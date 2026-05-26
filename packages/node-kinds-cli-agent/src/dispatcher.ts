import { resolve as resolvePath } from 'node:path'
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
} from '@openexpertise/core'
import { interpolatePrompt } from '@openexpertise/core'
import type { NodeSpec, CliAgentNodeSpec } from '@openexpertise/schema'
import { DefaultSubprocessRunner, type SubprocessRunner } from './runner.js'
import { providerFor } from './providers/index.js'
import { parseOutput } from './parse.js'

export interface CliAgentDispatcherOpts {
  runner?: SubprocessRunner
  defaultTimeoutMs?: number
}

interface CliAgentImpl extends ResolvedImpl {
  spec: CliAgentNodeSpec
  [k: string]: unknown
}

export class CliAgentDispatcher implements NodeDispatcher {
  readonly kind = 'cli-agent' as const
  private readonly runner: SubprocessRunner
  private readonly defaultTimeoutMs: number

  constructor(opts: CliAgentDispatcherOpts = {}) {
    this.runner = opts.runner ?? new DefaultSubprocessRunner()
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 600_000
  }

  async resolve(node: NodeSpec, ctx: RunContext): Promise<CliAgentImpl> {
    if (node.kind !== 'cli-agent') {
      throw new Error(`CliAgentDispatcher cannot resolve kind=${node.kind}`)
    }
    return { spec: node as CliAgentNodeSpec }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput> {
    const ci = impl as CliAgentImpl
    const spec = ci.spec
    const provider = providerFor(spec.provider)
    const outputFormat = spec.output_format ?? 'text'

    const prompt = interpolatePrompt({
      template: spec.prompt,
      values: { ...bundle.state_view, ...bundle.edge_inputs, ...bundle.args },
      strict: false,
    })

    const workdir = spec.workdir ? resolvePath(ctx.experienceDir, spec.workdir) : ctx.experienceDir

    const buildOpts: Parameters<typeof provider.buildCommand>[0] = {
      prompt,
      workdir,
      outputFormat,
    }
    if (spec.model) buildOpts.model = spec.model
    if (spec.extra_args) buildOpts.extra_args = spec.extra_args

    const cmd = provider.buildCommand(buildOpts)
    const timeoutMs = spec.timeout_ms ?? this.defaultTimeoutMs

    const ts = () => new Date().toISOString()
    ctx.events.emit({
      type: 'node.activity',
      run_id: ctx.runId,
      node_id: spec.id,
      ts: ts(),
      activity: `spawning ${spec.provider} (timeout ${timeoutMs}ms)`,
    })

    const res = await this.runner.run(cmd, { timeoutMs, cwd: workdir })

    if (res.timedOut) {
      throw new Error(
        `cli-agent "${spec.id}" timed out after ${timeoutMs}ms (provider=${spec.provider})`,
      )
    }
    if (res.exitCode !== 0) {
      throw new Error(
        `cli-agent "${spec.id}" (provider=${spec.provider}) exited with exit code ${res.exitCode}. ` +
          `stderr: ${res.stderr.slice(0, 500)}`,
      )
    }

    ctx.events.emit({
      type: 'node.activity',
      run_id: ctx.runId,
      node_id: spec.id,
      ts: ts(),
      activity: outputFormat === 'json' ? 'parsing JSON output' : 'parsing text output',
    })

    const parseOpts: Parameters<typeof parseOutput>[0] = {
      stdout: res.stdout,
      outputFormat,
      writes: spec.writes ?? [],
      nodeId: spec.id,
    }
    if (spec.schema) parseOpts.schema = spec.schema
    const stateDelta = parseOutput(parseOpts)

    return { state_delta: stateDelta }
  }
}
