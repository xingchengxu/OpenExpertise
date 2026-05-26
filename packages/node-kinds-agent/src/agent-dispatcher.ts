import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import Ajv from 'ajv'
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
  LLMClient,
  LLMCompleteOpts,
  LLMTool,
} from '@openexpertise/core'
import { interpolatePrompt } from '@openexpertise/core'
import type { NodeSpec, AgentNodeSpec } from '@openexpertise/schema'

export interface AgentDispatcherOpts {
  client: LLMClient
  defaultModel?: string
  defaultMaxTokens?: number
}

interface AgentImpl extends ResolvedImpl {
  spec: AgentNodeSpec
  promptTemplate: string
  ajvValidator?: (data: unknown) => boolean
  ajvErrors?: () => string[]
  [k: string]: unknown
}

const STRUCTURED_TOOL_NAME = 'structured_output'

export class AgentDispatcher implements NodeDispatcher {
  readonly kind = 'agent' as const
  private readonly ajv = new Ajv({ allErrors: true, strict: false })

  constructor(private readonly opts: AgentDispatcherOpts) {}

  async resolve(node: NodeSpec, ctx: RunContext): Promise<AgentImpl> {
    if (node.kind !== 'agent') {
      throw new Error(`AgentDispatcher cannot resolve kind=${node.kind}`)
    }
    const t = node as AgentNodeSpec
    const promptTemplate = loadPromptTemplate(t.prompt, ctx.experienceDir)
    const impl: AgentImpl = { spec: t, promptTemplate }
    if (t.schema && typeof t.schema === 'object') {
      const compiled = this.ajv.compile(t.schema as Record<string, unknown>)
      impl.ajvValidator = compiled
      impl.ajvErrors = () =>
        (compiled.errors ?? []).map(
          (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
        )
    }
    return impl
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput> {
    const ai = impl as AgentImpl
    const userPrompt = interpolatePrompt({
      template: ai.promptTemplate,
      values: { ...bundle.state_view, ...bundle.edge_inputs, ...bundle.args },
      strict: false, // tolerant: an unused state field shouldn't break a run
    })

    const completeOpts: LLMCompleteOpts = {
      model: ai.spec.model ?? this.opts.defaultModel ?? 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: this.opts.defaultMaxTokens ?? 4096,
    }

    if (ai.ajvValidator) {
      const tool: LLMTool = {
        name: STRUCTURED_TOOL_NAME,
        description: 'Return the agent result as a structured object matching the schema',
        input_schema: ai.spec.schema as Record<string, unknown>,
      }
      completeOpts.tools = [tool]
    }

    const ts = () => new Date().toISOString()
    ctx.events.emit({
      type: 'node.activity',
      run_id: ctx.runId,
      node_id: ai.spec.id,
      ts: ts(),
      activity: `calling ${completeOpts.model}`,
    })

    const result = await this.opts.client.complete(completeOpts)

    if (result.usage) {
      ctx.events.emit({
        type: 'node.tokens',
        run_id: ctx.runId,
        node_id: ai.spec.id,
        ts: ts(),
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        model: completeOpts.model,
      })
    }
    ctx.events.emit({
      type: 'node.activity',
      run_id: ctx.runId,
      node_id: ai.spec.id,
      ts: ts(),
      activity: ai.ajvValidator ? 'validating structured output' : 'parsing text output',
    })

    let stateDelta: Record<string, unknown>
    if (ai.ajvValidator) {
      const call = result.tool_calls?.find((c) => c.name === STRUCTURED_TOOL_NAME)
      if (!call) {
        throw new Error(`Agent "${ai.spec.id}" expected a structured_output tool call but got none`)
      }
      if (!ai.ajvValidator(call.input)) {
        const msgs = ai.ajvErrors?.() ?? ['schema mismatch']
        throw new Error(`Agent "${ai.spec.id}" structured output failed schema: ${msgs.join(', ')}`)
      }
      stateDelta = call.input as Record<string, unknown>
    } else {
      // Text mode: writes must have exactly one field; otherwise we can't map text → state.
      const writes = ai.spec.writes ?? []
      if (writes.length !== 1) {
        throw new Error(
          `Agent "${ai.spec.id}" returned text but declares ${writes.length} writes; ` +
            `text mode requires exactly a single write field. Use a structured schema for multi-field output.`,
        )
      }
      stateDelta = { [writes[0] as string]: result.text }
    }

    const out: NodeOutput = { state_delta: stateDelta }
    if (result.usage) {
      out.metrics = { tokens_in: result.usage.input_tokens, tokens_out: result.usage.output_tokens }
    }
    return out
  }
}

function loadPromptTemplate(impl: string, experienceDir: string): string {
  const abs = isAbsolute(impl) ? impl : resolve(experienceDir, impl)
  if (!existsSync(abs)) {
    throw new Error(`Agent prompt template not found: ${abs} (declared as "${impl}")`)
  }
  return readFileSync(abs, 'utf8')
}
