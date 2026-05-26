import { describe, it, expect } from 'vitest'
import {
  initialDashboardState,
  reduceDashboardState,
  type DashboardState,
} from '../src/reducer.js'
import type { RunEvent } from '@openexpertise/core'

const NODES = [{ id: 'a' }, { id: 'b', phase: 'review' }]
const TS = '2026-05-26T00:00:00Z'

function evt<T extends RunEvent['type']>(
  type: T,
  rest: Omit<Extract<RunEvent, { type: T }>, 'type' | 'ts'>,
): RunEvent {
  return { type, ts: TS, ...rest } as RunEvent
}

describe('reduceDashboardState', () => {
  it('initial state has all nodes pending and zero tokens', () => {
    const state = initialDashboardState(NODES)
    expect(state.runStatus).toBe('starting')
    expect(Object.keys(state.nodes).sort()).toEqual(['a', 'b'])
    expect(state.nodes['a']!.status).toBe('pending')
    expect(state.nodes['b']!.phase).toBe('review')
    expect(state.totals).toEqual({ input_tokens: 0, output_tokens: 0 })
  })

  it('run.started → runStatus is "running"', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(s0, evt('run.started', { run_id: 'r1' }))
    expect(s1.runStatus).toBe('running')
  })

  it('node.started → that node becomes "running"', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(s0, evt('node.started', { run_id: 'r1', node_id: 'a' }))
    expect(s1.nodes['a']!.status).toBe('running')
  })

  it('node.activity → that node has the latest activity', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.activity', { run_id: 'r1', node_id: 'a', activity: 'calling claude' }),
    )
    expect(s1.nodes['a']!.activity).toBe('calling claude')

    const s2 = reduceDashboardState(
      s1,
      evt('node.activity', { run_id: 'r1', node_id: 'a', activity: 'parsing output' }),
    )
    expect(s2.nodes['a']!.activity).toBe('parsing output')
  })

  it('node.tokens → accumulates per node AND in totals', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.tokens', {
        run_id: 'r1',
        node_id: 'a',
        input_tokens: 10,
        output_tokens: 5,
        model: 'm',
      }),
    )
    expect(s1.nodes['a']!.tokens).toEqual({ input: 10, output: 5 })
    expect(s1.totals).toEqual({ input_tokens: 10, output_tokens: 5 })

    // Another emit on the same node accumulates
    const s2 = reduceDashboardState(
      s1,
      evt('node.tokens', {
        run_id: 'r1',
        node_id: 'a',
        input_tokens: 2,
        output_tokens: 3,
        model: 'm',
      }),
    )
    expect(s2.nodes['a']!.tokens).toEqual({ input: 12, output: 8 })
    expect(s2.totals).toEqual({ input_tokens: 12, output_tokens: 8 })
  })

  it('node.finished → status becomes "done"', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(s0, evt('node.finished', { run_id: 'r1', node_id: 'a' }))
    expect(s1.nodes['a']!.status).toBe('done')
  })

  it('node.failed → status becomes "failed" with error', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.failed', { run_id: 'r1', node_id: 'a', error: 'boom' }),
    )
    expect(s1.nodes['a']!.status).toBe('failed')
    expect(s1.nodes['a']!.error).toBe('boom')
  })

  it('node.skipped → status becomes "skipped" with reason', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.skipped', { run_id: 'r1', node_id: 'a', reason: 'when=false' }),
    )
    expect(s1.nodes['a']!.status).toBe('skipped')
  })

  it('run.finished → captures final status', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('run.finished', { run_id: 'r1', status: 'success' }),
    )
    expect(s1.runStatus).toBe('finished: success')
  })

  it('ignores events for unknown node ids gracefully', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.activity', { run_id: 'r1', node_id: 'ghost', activity: 'x' }),
    )
    expect(s1.nodes['ghost']).toBeUndefined()
  })

  it('state.write events are accepted but do not break state', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('state.write', { run_id: 'r1', node_id: 'a', field: 'x' }),
    )
    // state.write is not currently rendered; reducer just returns prev.
    expect(s1).toEqual(s0)
  })
})
