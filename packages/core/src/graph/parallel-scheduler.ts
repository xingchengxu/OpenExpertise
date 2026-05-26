import { SequentialScheduler, runWithLimit, type NodeRunResult } from './scheduler.js'
import type { Dag, DagNode } from './dag.js'
import type { RunContext } from '../run/context.js'
import { evaluateExpression } from '../expressions/evaluate.js'

export class ParallelScheduler extends SequentialScheduler {
  constructor(
    dag: Dag,
    ctx: RunContext,
    private readonly concurrency: number,
  ) {
    super(dag, ctx)
  }

  override async run(): Promise<{
    status: 'success' | 'failed' | 'partial'
    results: NodeRunResult[]
  }> {
    if (this.concurrency <= 1) {
      return super.run()
    }

    const results: NodeRunResult[] = []
    const edgeBuffer = new Map<string, Record<string, unknown>>()
    const skipped = new Set<string>()
    let anyFailed = false

    const pipelineStageIds = new Set((this.ctx.spec.graph.pipelines ?? []).flatMap((p) => p.stages))
    const loopBodyIds = new Set((this.ctx.spec.graph.loops ?? []).map((l) => l.body))

    // Filter the topo order to nodes handled by the main pass.
    const mainNodes = this.dag.topoOrder.filter(
      (n) => !pipelineStageIds.has(n.id) && !loopBodyIds.has(n.id),
    )
    const mainSet = new Set(mainNodes.map((n) => n.id))

    // Each main node's unmet predecessor count (only counts preds also in mainSet).
    const unmetCount = new Map<string, number>()
    for (const n of mainNodes) {
      unmetCount.set(n.id, n.predecessors.filter((p) => mainSet.has(p)).length)
    }

    // Wave loop: find all ready nodes, run them concurrently.
    while (unmetCount.size > 0) {
      const ready: DagNode[] = []
      for (const [id, count] of unmetCount) {
        if (count === 0) {
          const node = this.dag.nodes.get(id)
          if (node) ready.push(node)
        }
      }
      if (ready.length === 0) break

      const waveItems = ready.slice()
      await runWithLimit(waveItems, this.concurrency, async (node) => {
        await this.runOneInWave(node, edgeBuffer, skipped, results)
      })

      // Mark wave nodes as completed: remove from unmetCount, decrement
      // successor counts. (Successors come from the dag edges.)
      for (const node of ready) {
        unmetCount.delete(node.id)
        for (const edge of this.ctx.spec.graph.edges) {
          if (edge.from === node.id && unmetCount.has(edge.to)) {
            const c = unmetCount.get(edge.to)!
            unmetCount.set(edge.to, Math.max(0, c - 1))
          }
        }
      }
    }

    if (results.some((r) => r.status === 'failed')) anyFailed = true

    // Pipelines + loops run sequentially via the inherited helper.
    const tailResult = await this.runPipelineAndLoopPasses(edgeBuffer, skipped, results)
    if (tailResult.anyFailed) anyFailed = true

    const anySkipped = results.some((r) => r.status === 'skipped')
    let status: 'success' | 'failed' | 'partial' = 'success'
    if (anyFailed) status = 'failed'
    else if (anySkipped) status = 'partial'
    return { status, results }
  }

  private async runOneInWave(
    node: DagNode,
    edgeBuffer: Map<string, Record<string, unknown>>,
    skipped: Set<string>,
    results: NodeRunResult[],
  ): Promise<void> {
    // Pred-skipped check
    const predSkipped = node.predecessors.some((p) => skipped.has(p))
    if (predSkipped) {
      skipped.add(node.id)
      this.ctx.events.emit({
        type: 'node.skipped',
        run_id: this.ctx.runId,
        node_id: node.id,
        ts: this.ctx.now(),
        reason: 'predecessor failed or skipped',
        ...(node.spec.phase ? { phase: node.spec.phase } : {}),
      })
      results.push({ nodeId: node.id, status: 'skipped' })
      return
    }
    // when: edges
    if (node.incomingEdges.length > 0) {
      const fullState = this.ctx.store.snapshot()
      const anyEdgeDead = node.incomingEdges.some(
        (e) => e.when !== undefined && !Boolean(evaluateExpression(e.when, fullState)),
      )
      if (anyEdgeDead) {
        skipped.add(node.id)
        this.ctx.events.emit({
          type: 'node.skipped',
          run_id: this.ctx.runId,
          node_id: node.id,
          ts: this.ctx.now(),
          reason: 'when: condition false',
          ...(node.spec.phase ? { phase: node.spec.phase } : {}),
        })
        results.push({ nodeId: node.id, status: 'skipped' })
        return
      }
    }
    await this.runSingleNodeWithForEach(node, edgeBuffer, skipped, results)
  }
}
