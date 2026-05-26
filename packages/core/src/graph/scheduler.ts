// for_each expansion: a node with `for_each: { source: $.list }` runs once per
// item in the resolved list, with the item injected into args.$item. The source
// is resolved from current state at dispatch time, so upstream nodes that
// populate it must have already run (guaranteed by the topological order).
import type { Dag, DagNode } from './dag.js'
import type { RunContext } from '../run/context.js'
import type { NodeDispatcher, NodeInputBundle, NodeOutput } from '../dispatcher/types.js'
import { resolveExpression } from '../expressions/resolve.js'
import { evaluateExpression } from '../expressions/evaluate.js'
import { computeCacheKey } from '../cache/key.js'

const RUNTIME_VERSION = '0.1.0' // bump to invalidate caches on breaking changes

export async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (limit <= 1 || items.length <= 1) {
    for (let i = 0; i < items.length; i++) {
      await fn(items[i]!, i)
    }
    return
  }
  let nextIdx = 0
  const startWorker = async (): Promise<void> => {
    while (true) {
      const idx = nextIdx++
      if (idx >= items.length) return
      await fn(items[idx]!, idx)
    }
  }
  const n = Math.min(limit, items.length)
  const workers: Promise<void>[] = []
  for (let i = 0; i < n; i++) workers.push(startWorker())
  await Promise.all(workers)
}

export interface NodeRunResult {
  nodeId: string
  status: 'success' | 'failed' | 'skipped'
  output?: NodeOutput
  error?: Error
}

export class SequentialScheduler {
  constructor(
    protected readonly dag: Dag,
    protected readonly ctx: RunContext,
  ) {}

  async run(): Promise<{ status: 'success' | 'failed' | 'partial'; results: NodeRunResult[] }> {
    const results: NodeRunResult[] = []
    const edgeBuffer = new Map<string, Record<string, unknown>>() // nodeId -> edge_inputs by predecessor
    const skipped = new Set<string>()
    let anyFailed = false

    const pipelineStageIds = new Set((this.ctx.spec.graph.pipelines ?? []).flatMap((p) => p.stages))
    const loopBodyIds = new Set((this.ctx.spec.graph.loops ?? []).map((l) => l.body))

    for (const node of this.dag.topoOrder) {
      if (pipelineStageIds.has(node.id) || loopBodyIds.has(node.id)) {
        continue // executed by pipeline or loop pass instead
      }
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
          ...(node.spec.phase ? { phase: node.spec.phase } : {}),
        })
        results.push({ nodeId: node.id, status: 'skipped' })
        continue
      }

      // Evaluate any when: conditions on incoming edges. The node runs only if
      // ALL its incoming edges are "live" (no edge whose when: is false).
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
          continue
        }
      }

      const { anyFanFailed } = await this.runSingleNodeWithForEach(
        node,
        edgeBuffer,
        skipped,
        results,
      )
      if (anyFanFailed) anyFailed = true
    }

    const tailResult = await this.runPipelineAndLoopPasses(edgeBuffer, skipped, results)
    if (tailResult.anyFailed) anyFailed = true

    const status = anyFailed
      ? results.every((r) => r.status === 'failed' || r.status === 'skipped')
        ? 'failed'
        : 'partial'
      : 'success'
    return { status, results }
  }

  protected async runSingleNodeWithForEach(
    node: DagNode,
    edgeBuffer: Map<string, Record<string, unknown>>,
    skipped: Set<string>,
    results: NodeRunResult[],
  ): Promise<{ anyFanFailed: boolean }> {
    const forEach = (node.spec as { for_each?: { source: string; concurrency?: number } }).for_each
    if (forEach) {
      const fullState = this.ctx.store.snapshot()
      const sourceVal = resolveExpression(forEach.source, fullState)
      const items: unknown[] = Array.isArray(sourceVal) ? sourceVal : []
      const concurrency = forEach.concurrency ?? 1
      const resultsBefore = results.length
      await runWithLimit(items, concurrency, async (item, idx) => {
        await this.runNodeOnce(node, { $item: item, $index: idx }, skipped, results, edgeBuffer)
      })
      // After all iterations, check whether any of the results added by THIS
      // for_each saw 'failed'. (In sequential mode the last result is for this
      // node; in parallel mode the order is not guaranteed.)
      const anyFanFailed = results.slice(resultsBefore).some((r) => r.status === 'failed')
      return { anyFanFailed }
    }

    await this.runNodeOnce(node, {}, skipped, results, edgeBuffer)
    const last = results[results.length - 1]
    return { anyFanFailed: last?.status === 'failed' }
  }

  protected async runPipelineAndLoopPasses(
    edgeBuffer: Map<string, Record<string, unknown>>,
    skipped: Set<string>,
    results: NodeRunResult[],
  ): Promise<{ anyFailed: boolean }> {
    let anyFailed = false

    // Pipeline groups: each pipeline reads its `items:` source from state and
    // runs each item through all stages. Within a pipeline, each item flows
    // through every stage before the next item starts (sequential V1; Plan 4
    // can add per-stage barrier semantics for true streaming).
    const pipelines = this.ctx.spec.graph.pipelines ?? []
    for (const pg of pipelines) {
      const fullState = this.ctx.store.snapshot()
      const itemsVal = resolveExpression(pg.items, fullState)
      const items: unknown[] = Array.isArray(itemsVal) ? itemsVal : []
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        let edgeFromPrevStage: unknown = undefined
        let prevStageId: string | undefined
        for (const stageId of pg.stages) {
          const stageNode = this.dag.nodes.get(stageId)
          if (!stageNode) {
            throw new Error(`Pipeline "${pg.id}" references unknown stage node "${stageId}"`)
          }
          const edgeInputs: Record<string, unknown> =
            prevStageId !== undefined && edgeFromPrevStage !== undefined
              ? { [prevStageId]: edgeFromPrevStage }
              : {}
          edgeBuffer.set(stageId, edgeInputs)
          await this.runNodeOnce(
            stageNode,
            { $item: item, $index: idx, $pipeline: pg.id },
            skipped,
            results,
            edgeBuffer,
          )
          // Recover stage output for next stage's edge_inputs
          const last = results[results.length - 1]
          if (last?.status === 'success' && last.output?.edge_output !== undefined) {
            edgeFromPrevStage = last.output.edge_output
            prevStageId = stageId
          } else {
            edgeFromPrevStage = undefined
            prevStageId = undefined
            if (last?.status === 'failed') anyFailed = true
            break // a stage failed; abort this item, continue with the next
          }
        }
      }
    }

    // Loop groups (Plan 4 bounded loop). Each loop has a single body node
    // repeated up to max_iters times, terminating when `until` evaluates true.
    // Loop bodies must NOT appear in the main topological pass — track them too.
    const loops = this.ctx.spec.graph.loops ?? []
    for (const loop of loops) {
      const bodyNode = this.dag.nodes.get(loop.body)
      if (!bodyNode) {
        throw new Error(`Loop "${loop.id}" references unknown body node "${loop.body}"`)
      }
      const maxIters = loop.max_iters ?? 100
      if (!loop.until && !loop.max_iters) {
        throw new Error(`Loop "${loop.id}" must declare at least one of: until, max_iters`)
      }
      let iter = 0
      while (iter < maxIters) {
        const fullState = this.ctx.store.snapshot()
        if (loop.until && evaluateExpression(loop.until, fullState)) {
          break
        }
        await this.runNodeOnce(
          bodyNode,
          { $iter: iter, $loop: loop.id },
          skipped,
          results,
          edgeBuffer,
        )
        iter++
        const last = results[results.length - 1]
        if (last?.status === 'failed') {
          anyFailed = true
          break
        }
      }
    }

    return { anyFailed }
  }

  protected async runNodeOnce(
    node: DagNode,
    extraArgs: Record<string, unknown>,
    skipped: Set<string>,
    results: NodeRunResult[],
    edgeBuffer: Map<string, Record<string, unknown>>,
  ): Promise<void> {
    this.ctx.events.emit({
      type: 'node.ready',
      run_id: this.ctx.runId,
      node_id: node.id,
      ts: this.ctx.now(),
      ...(node.spec.phase ? { phase: node.spec.phase } : {}),
    })
    const bundle = this.assembleBundle(node, edgeBuffer.get(node.id) ?? {}, extraArgs)

    // Cache lookup (Plan 4)
    let cacheKey: string | undefined
    if (this.ctx.cache) {
      cacheKey = computeCacheKey({
        nodeSpec: node.spec,
        stateView: bundle.state_view as Record<string, unknown>,
        edgeInputs: bundle.edge_inputs,
        args: bundle.args,
        runtimeVersion: RUNTIME_VERSION,
      })
      const hit = this.ctx.cache.get(cacheKey)
      if (hit) {
        // Replay cached output without dispatching
        if (hit.state_delta && Object.keys(hit.state_delta).length > 0) {
          this.ctx.store.write(hit.state_delta, { runId: this.ctx.runId, nodeId: node.id })
          for (const field of Object.keys(hit.state_delta)) {
            this.ctx.events.emit({
              type: 'state.write',
              run_id: this.ctx.runId,
              node_id: node.id,
              field,
              ts: this.ctx.now(),
            })
          }
        }
        if (hit.edge_output !== undefined) {
          for (const succ of node.successors) {
            const existing = edgeBuffer.get(succ) ?? {}
            existing[node.id] = hit.edge_output
            edgeBuffer.set(succ, existing)
          }
        }
        this.ctx.events.emit({
          type: 'node.finished',
          run_id: this.ctx.runId,
          node_id: node.id,
          ts: this.ctx.now(),
          ...(node.spec.phase ? { phase: node.spec.phase } : {}),
          ...(hit.metrics ? { metrics: hit.metrics } : {}),
        })
        results.push({ nodeId: node.id, status: 'success', output: hit })
        return
      }
    }

    const dispatcher: NodeDispatcher = this.ctx.dispatchers.get(node.spec.kind)
    this.ctx.events.emit({
      type: 'node.started',
      run_id: this.ctx.runId,
      node_id: node.id,
      ts: this.ctx.now(),
      ...(node.spec.phase ? { phase: node.spec.phase } : {}),
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
          ...(node.spec.phase ? { phase: node.spec.phase } : {}),
          ...(output.metrics ? { metrics: output.metrics } : {}),
        })
        if (cacheKey && this.ctx.cache) {
          this.ctx.cache.put(cacheKey, output)
        }
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
        ...(node.spec.phase ? { phase: node.spec.phase } : {}),
      })
      results.push({ nodeId: node.id, status: 'failed', error })
      skipped.add(node.id)
      if (policy.policy === 'fail_run') {
        throw new Error(`Node "${node.id}" failed and policy=fail_run: ${error.message}`)
      }
    }
  }

  protected assembleBundle(
    node: DagNode,
    edgeInputs: Record<string, unknown>,
    extraArgs: Record<string, unknown> = {},
  ): NodeInputBundle {
    const declaredReads = node.spec.reads ?? []
    const state_view: Record<string, unknown> = {}
    for (const field of declaredReads) {
      state_view[field] = this.ctx.store.get(field)
    }

    const fullState = this.ctx.store.snapshot()
    const rawArgs = ('args' in node.spec ? node.spec.args : undefined) ?? {}
    const resolvedArgs = resolveExpression(rawArgs, fullState) as Record<string, unknown>

    return {
      state_view: Object.freeze({ ...state_view }),
      edge_inputs: edgeInputs,
      args: { ...resolvedArgs, ...extraArgs },
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
