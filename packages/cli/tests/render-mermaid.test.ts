import { describe, it, expect } from 'vitest'
import type { ExperienceSpec } from '@openexpertise/schema'
import { renderMermaid, renderMermaidHtml } from '../src/render-mermaid.js'

const SPEC: ExperienceSpec = {
  name: 'review-branch',
  version: '0.1.0',
  state: { schema: {} } as ExperienceSpec['state'],
  phases: [{ id: 'collect', title: 'Collect' }, { id: 'review' }],
  graph: {
    nodes: [
      { id: 'fetch_diff', kind: 'tool', phase: 'collect', impl: './t.mjs', writes: ['diff'] },
      {
        id: 'bug_review',
        kind: 'agent',
        phase: 'review',
        prompt: './p.md',
        reads: ['diff'],
        for_each: { source: '$.dimensions' },
        writes: ['findings'],
      },
    ],
    edges: [
      { from: 'fetch_diff', to: 'bug_review' },
      { from: 'bug_review', to: 'score', when: 'length($.findings) > 0' },
    ],
  } as ExperienceSpec['graph'],
} as ExperienceSpec

describe('renderMermaid', () => {
  it('emits a flowchart with phase subgraphs, kind shapes/classes, for_each + when labels', () => {
    const out = renderMermaid(SPEC)
    expect(out.startsWith('flowchart TD')).toBe(true)
    // phase subgraphs (title used when present, id otherwise)
    expect(out).toContain('subgraph phase_collect["Collect"]')
    expect(out).toContain('subgraph phase_review["review"]')
    // nodes by kind shape + class
    expect(out).toContain('fetch_diff["fetch_diff"]:::tool')
    expect(out).toMatch(/bug_review\(".*for each \$\.dimensions"\):::agent/s)
    // edges, incl. the conditional edge with a quoted/escaped label
    expect(out).toContain('fetch_diff --> bug_review')
    expect(out).toContain('bug_review -->|"length($.findings) &gt; 0"| score')
    // classDefs present for the kinds used
    expect(out).toContain('classDef tool')
    expect(out).toContain('classDef agent')
  })

  it('respects direction LR', () => {
    expect(renderMermaid(SPEC, { direction: 'LR' }).startsWith('flowchart LR')).toBe(true)
  })

  it('sanitizes unsafe node ids consistently in nodes and edges', () => {
    const spec = {
      ...SPEC,
      phases: [],
      graph: {
        nodes: [{ id: 'a-b.c', kind: 'tool', impl: './t.mjs' }],
        edges: [{ from: 'a-b.c', to: 'a-b.c' }],
      },
    } as unknown as ExperienceSpec
    const out = renderMermaid(spec)
    expect(out).toContain('a_b_c["a-b.c"]:::tool') // safe id in def, original in label
    expect(out).toContain('a_b_c --> a_b_c') // edge uses the SAME safe id
  })

  it('renderMermaidHtml wraps the diagram in a self-contained page', () => {
    const html = renderMermaidHtml(SPEC, renderMermaid(SPEC))
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('flowchart TD')
    expect(html).toContain('review-branch') // experience name in <title>/<h1>
    expect(html).toContain('mermaid') // the script/init
  })
})

describe('renderMermaid nodeStatus', () => {
  it('applies status classes instead of kind classes when nodeStatus is given', () => {
    const out = renderMermaid(SPEC, { nodeStatus: { fetch_diff: 'success', bug_review: 'failed' } })
    expect(out).toContain('fetch_diff["fetch_diff"]:::status_success')
    expect(out).toMatch(/bug_review\(".*"\):::status_failed/s)
    expect(out).toContain('classDef status_success')
    expect(out).toContain('classDef status_failed')
    // a node with no status entry falls back to its kind class
  })

  it('is byte-identical to the no-opts output when nodeStatus is absent (back-compat)', () => {
    expect(renderMermaid(SPEC, {})).toBe(renderMermaid(SPEC))
    expect(renderMermaid(SPEC)).not.toContain('status_')
  })

  it('only emits status classDefs for statuses actually used', () => {
    const out = renderMermaid(SPEC, { nodeStatus: { fetch_diff: 'success' } })
    expect(out).toContain('classDef status_success')
    expect(out).not.toContain('classDef status_failed')
  })
})
