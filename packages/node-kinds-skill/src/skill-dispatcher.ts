import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
  LLMClient,
  LLMCompleteOpts,
} from '@openexpertise/core'
import type { NodeSpec, SkillNodeSpec } from '@openexpertise/schema'
import { loadSkillFile, type LoadedSkill } from './skill-loader.js'

export interface SkillDispatcherOpts {
  client: LLMClient
  defaultModel?: string
  defaultMaxTokens?: number
}

interface SkillImpl extends ResolvedImpl {
  spec: SkillNodeSpec
  skill: LoadedSkill
  [k: string]: unknown
}

export class SkillDispatcher implements NodeDispatcher {
  readonly kind = 'skill' as const

  constructor(private readonly opts: SkillDispatcherOpts) {}

  async resolve(node: NodeSpec, ctx: RunContext): Promise<SkillImpl> {
    if (node.kind !== 'skill') throw new Error(`SkillDispatcher cannot resolve kind=${node.kind}`)
    const t = node as SkillNodeSpec
    const skill = loadSkillFile(t.impl, ctx.experienceDir)
    return { spec: t, skill }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, _ctx: RunContext): Promise<NodeOutput> {
    const si = impl as SkillImpl
    const userPayload = {
      ...bundle.state_view,
      ...bundle.edge_inputs,
      ...bundle.args,
    }
    const completeOpts: LLMCompleteOpts = {
      model: si.spec.model ?? this.opts.defaultModel ?? 'claude-sonnet-4-5',
      system: si.skill.body,
      messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
      max_tokens: this.opts.defaultMaxTokens ?? 4096,
    }

    const result = await this.opts.client.complete(completeOpts)

    const writes = si.spec.writes ?? []
    if (writes.length !== 1) {
      throw new Error(
        `Skill "${si.spec.id}" must declare exactly one write field for text mode; ` +
          `got ${writes.length}. Structured-output skills land in Plan 3+.`,
      )
    }
    const out: NodeOutput = { state_delta: { [writes[0] as string]: result.text } }
    if (result.usage) {
      out.metrics = { tokens_in: result.usage.input_tokens, tokens_out: result.usage.output_tokens }
    }
    return out
  }
}
