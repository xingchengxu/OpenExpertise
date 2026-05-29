import { describe, it, expect } from 'vitest'
import type { ExperienceSpec } from '@openexpertise/schema'
import { summarizeRun, renderRunReportHtml } from '../src/run-report.js'

const EVENTS = [
  { type: 'run.started', run_id: 'r1', ts: '2026-05-26T00:00:00Z' },
  { type: 'node.started', run_id: 'r1', node_id: 'a', ts: '2026-05-26T00:00:01Z' },
  {
    type: 'node.finished',
    run_id: 'r1',
    node_id: 'a',
    ts: '2026-05-26T00:00:03Z',
    metrics: { tokens_in: 10, tokens_out: 5 },
  },
  { type: 'node.started', run_id: 'r1', node_id: 'b', ts: '2026-05-26T00:00:03Z' },
  { type: 'node.failed', run_id: 'r1', node_id: 'b', ts: '2026-05-26T00:00:04Z', error: 'boom' },
  {
    type: 'node.skipped',
    run_id: 'r1',
    node_id: 'c',
    ts: '2026-05-26T00:00:04Z',
    reason: 'when: condition false',
  },
  { type: 'run.finished', run_id: 'r1', ts: '2026-05-26T00:00:05Z', status: 'failed' },
]

describe('summarizeRun', () => {
  it('derives per-node status, timing, tokens, and overall status', () => {
    const s = summarizeRun(EVENTS)
    expect(s.overallStatus).toBe('failed')
    expect(s.nodeStatus).toEqual({ a: 'success', b: 'failed', c: 'skipped' })
    const a = s.nodes.find((n) => n.node_id === 'a')!
    expect(a.duration_ms).toBe(2000)
    expect(a.tokens_in).toBe(10)
    expect(a.tokens_out).toBe(5)
    expect(s.nodes.find((n) => n.node_id === 'b')!.detail).toBe('boom')
    expect(s.nodes.find((n) => n.node_id === 'c')!.detail).toBe('when: condition false')
    expect(s.totals.failed).toBe(1)
    expect(s.totals.skipped).toBe(1)
    expect(s.totals.tokens_in).toBe(10)
    expect(s.totals.duration_ms).toBe(5000)
    expect(s.timeline.length).toBe(EVENTS.length)
  })

  it('marks a node running when it started but never terminated, and derives overall when run.finished is absent', () => {
    const s = summarizeRun([{ type: 'node.started', node_id: 'x', ts: '2026-05-26T00:00:01Z' }])
    expect(s.nodeStatus.x).toBe('running')
    expect(s.overallStatus).toBe('unknown') // no terminal, no run.finished
  })
})

describe('renderRunReportHtml', () => {
  const SPEC = {
    name: 'demo',
    version: '0.1.0',
    state: { schema: {} },
    graph: {
      nodes: [
        { id: 'a', kind: 'tool', impl: './t.mjs' },
        { id: 'b', kind: 'agent', prompt: './p.md' },
        { id: 'c', kind: 'tool', impl: './u.mjs' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    },
  } as unknown as ExperienceSpec
  it('produces a self-contained page with the status DAG, tables, and badges', () => {
    const html = renderRunReportHtml(SPEC, summarizeRun(EVENTS), 'r1')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('class="mermaid"')
    expect(html).toContain(':::status_success') // a succeeded
    expect(html).toContain(':::status_failed') // b failed
    expect(html).toContain('r1') // run id in header
    expect(html).toContain('boom') // error surfaced in a table (escaped)
  })
})
