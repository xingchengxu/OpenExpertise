import type { Dag, DagNode } from './dag.js'
import type { RunContext } from '../run/context.js'
import type { NodeDispatcher, NodeInputBundle, NodeOutput } from '../dispatcher/types.js'
import { resolveExpression } from '../expressions/resolve.js'

export interface NodeRunResult {
  nodeId: string
  status: 'success' | 'failed' | 'skipped'
  output?: NodeOutput
  error?: Error
}

export class SequentialScheduler {
  constructor(
    private readonly dag: Dag,
    private readonly ctx: RunContext,
  ) {}

  async run(): Promise<{ status: 'success' | 'failed' | 'partial'; results: NodeRunResult[] }> {
    const results: NodeRunResult[] = []
    const edgeBuffer = new Map<string, Record<string, unknown>>() // nodeId -> edge_inputs by predecessor
    const skipped = new Set<string>()
    let anyFailed = false

    for (const node of this.dag.topoOrder) {
      // skip if any predecessor was skipped or failed (Plan 1 default = skip downstream)
      const predSkipped = node.predecessors.some((p) => skipped.has(p))
      if (predSkipped) {
        skipped.add(node.id)
        this.ctx.events.emit({
          type: 'node.skipped',
          run_id: this.ctx.runId,
          node_id: node.id,
          ts: this.ctx.now(),
          reason: 'predecessor failed or skipped',
        })
        results.push({ nodeId: node.id, status: 'skipped' })
        continue
      }

      this.ctx.events.emit({
        type: 'node.ready',
        run_id: this.ctx.runId,
        node_id: node.id,
        ts: this.ctx.now(),
      })

      const bundle = this.assembleBundle(node, edgeBuffer.get(node.id) ?? {})
      const dispatcher: NodeDispatcher = this.ctx.dispatchers.get(node.spec.kind)

      this.ctx.events.emit({
        type: 'node.started',
        run_id: this.ctx.runId,
        node_id: node.id,
        ts: this.ctx.now(),
      })

      const policy = node.spec.on_error ?? { policy: 'skip' as const }
      const maxAttempts = policy.policy === 'retry' ? policy.attempts : 1
      let attempt = 0
      let lastError: Error | undefined
      let succeeded = false

      while (attempt < maxAttempts) {
        attempt++
        try {
          const impl = await dispatcher.resolve(node.spec, this.ctx)
          const output = await dispatcher.run(impl, bundle, this.ctx)
          if (output.state_delta && Object.keys(output.state_delta).length > 0) {
            this.ctx.store.write(output.state_delta, { runId: this.ctx.runId, nodeId: node.id })
            for (const field of Object.keys(output.state_delta)) {
              this.ctx.events.emit({
                type: 'state.write',
                run_id: this.ctx.runId,
                node_id: node.id,
                field,
                ts: this.ctx.now(),
              })
            }
          }
          if (output.edge_output !== undefined) {
            for (const succ of node.successors) {
              const existing = edgeBuffer.get(succ) ?? {}
              existing[node.id] = output.edge_output
              edgeBuffer.set(succ, existing)
            }
          }
          this.ctx.events.emit({
            type: 'node.finished',
            run_id: this.ctx.runId,
            node_id: node.id,
            ts: this.ctx.now(),
            ...(output.metrics ? { metrics: output.metrics } : {}),
          })
          results.push({ nodeId: node.id, status: 'success', output })
          succeeded = true
          break
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          if (policy.policy === 'retry' && attempt < maxAttempts) {
            const base = policy.base_ms ?? 100
            const sleepMs =
              policy.backoff === 'exponential' ? base * 2 ** (attempt - 1) : base * attempt
            await sleep(sleepMs)
            continue
          }
          break
        }
      }

      if (!succeeded) {
        const error = lastError ?? new Error('unknown error')
        this.ctx.events.emit({
          type: 'node.failed',
          run_id: this.ctx.runId,
          node_id: node.id,
          ts: this.ctx.now(),
          error: error.message,
        })
        results.push({ nodeId: node.id, status: 'failed', error })
        skipped.add(node.id)
        anyFailed = true
        if (policy.policy === 'fail_run') {
          throw new Error(`Node "${node.id}" failed and policy=fail_run: ${error.message}`)
        }
      }
    }

    const status = anyFailed
      ? results.every((r) => r.status === 'failed' || r.status === 'skipped')
        ? 'failed'
        : 'partial'
      : 'success'
    return { status, results }
  }

  private assembleBundle(node: DagNode, edgeInputs: Record<string, unknown>): NodeInputBundle {
    const declaredReads = node.spec.reads ?? []
    const state_view: Record<string, unknown> = {}
    for (const field of declaredReads) {
      state_view[field] = this.ctx.store.get(field)
    }

    const fullState = this.ctx.store.snapshot()
    const args = ('args' in node.spec ? node.spec.args : undefined) ?? {}
    const resolvedArgs = resolveExpression(args, fullState) as Record<string, unknown>

    return {
      state_view: Object.freeze({ ...state_view }),
      edge_inputs: edgeInputs,
      args: resolvedArgs,
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
