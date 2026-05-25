import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, isAbsolute, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
} from '@openexpertise/core'
import { parseExperienceYaml } from '@openexpertise/schema'
import type { NodeSpec, ExperienceNodeSpec, ExperienceSpec } from '@openexpertise/schema'

// runExperience is injected to break the would-be circular dep:
// core -> experience dispatcher -> core's runExperience.
export interface ExperienceDispatcherOpts {
  runExperience: (opts: {
    spec: ExperienceSpec
    experienceDir: string
    dispatchers: import('@openexpertise/core').DispatcherRegistry
    args?: Record<string, unknown>
    dbPath?: string
    runId?: string
  }) => Promise<{
    runId: string
    status: 'success' | 'failed' | 'partial'
    finalState: Record<string, unknown>
  }>
}

interface ExperienceImpl extends ResolvedImpl {
  spec: ExperienceNodeSpec
  childSpec: ExperienceSpec
  childDir: string
  [k: string]: unknown
}

export class ExperienceDispatcher implements NodeDispatcher {
  readonly kind = 'experience' as const

  constructor(private readonly opts: ExperienceDispatcherOpts) {}

  async resolve(node: NodeSpec, ctx: RunContext): Promise<ExperienceImpl> {
    if (node.kind !== 'experience') {
      throw new Error(`ExperienceDispatcher cannot resolve kind=${node.kind}`)
    }
    const t = node as ExperienceNodeSpec
    if (t.state_scope === 'shared') {
      throw new Error(`Experience "${t.id}" requests state_scope=shared, which is not implemented in V1`)
    }
    const abs = isAbsolute(t.impl) ? t.impl : resolve(ctx.experienceDir, t.impl)
    if (!existsSync(abs)) {
      throw new Error(`Sub-experience yaml not found: ${abs} (declared as "${t.impl}")`)
    }
    const source = readFileSync(abs, 'utf8')
    const childSpec = parseExperienceYaml(source)
    return { spec: t, childSpec, childDir: dirname(abs) }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput> {
    const ei = impl as ExperienceImpl
    // isolated: a brand-new SQLite file scoped to this nested run, kept under
    // the parent's .openexpertise/sub/ for inspection.
    const subRunId = randomUUID()
    const subDir = join(ctx.experienceDir, '.openexpertise', 'sub')
    mkdirSync(subDir, { recursive: true })
    const dbPath = join(subDir, `${ei.spec.id}-${subRunId}.sqlite`)

    const childResult = await this.opts.runExperience({
      spec: ei.childSpec,
      experienceDir: ei.childDir,
      dispatchers: ctx.dispatchers,
      args: { ...bundle.args, _parent_run_id: ctx.runId, _parent_state: bundle.state_view },
      dbPath,
      runId: subRunId,
    })

    return {
      state_delta: {},
      edge_output: {
        runId: childResult.runId,
        status: childResult.status,
        finalState: childResult.finalState,
      },
    }
  }
}
