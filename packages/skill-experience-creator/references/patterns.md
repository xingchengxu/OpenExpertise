# Patterns — copy-paste topology shapes

## Linear (a → b → c)

```yaml
graph:
  nodes:
    - { id: load, kind: dataset, source: { type: file, uri: ./data.json }, writes: [rows] }
    - { id: filter, kind: tool, impl: ./tools/filter.mjs, reads: [rows], writes: [rows_filtered] }
    - {
        id: summarize,
        kind: agent,
        prompt: ./prompts/sum.md,
        reads: [rows_filtered],
        writes: [summary],
      }
  edges:
    - { from: load, to: filter }
    - { from: filter, to: summarize }
```

## Fan-out across a list

```yaml
graph:
  nodes:
    - { id: seed, kind: tool, impl: ./tools/items.mjs, writes: [items] }
    - id: process
      kind: agent
      prompt: ./prompts/per-item.md # has {{$item}} placeholder
      for_each: { source: $.items }
      schema: { type: object, required: [result], properties: { result: { type: string } } }
      writes: [results] # uses merge: array_append in state.schema
  edges:
    - { from: seed, to: process }
```

(Don't forget `state.schema.results.merge: array_append`.)

## Pipeline (per-item streaming through stages)

```yaml
graph:
  nodes:
    - { id: seed, kind: tool, impl: ./tools/items.mjs, writes: [items] }
    - { id: stage_a, kind: agent, prompt: ./prompts/a.md, writes: [_unused_a] } # uses edge_output
    - {
        id: stage_b,
        kind: agent,
        prompt: ./prompts/b.md,
        writes: [final_per_item],
        schema: { ... },
      }
  edges:
    - { from: seed, to: stage_a }
  pipelines:
    - { id: p, items: $.items, stages: [stage_a, stage_b] }
```

## Conditional branch

```yaml
graph:
  nodes:
    - { id: score, kind: agent, prompt: ./prompts/score.md, schema: { ... }, writes: [risk] }
    - { id: alert, kind: tool, impl: ./tools/page.mjs, reads: [risk] }
  edges:
    - { from: score, to: alert, when: '$.risk > 0.8' }
```

## Bounded loop

```yaml
graph:
  nodes:
    - { id: refine, kind: agent, prompt: ./prompts/refine.md, writes: [draft, error_count] }
  loops:
    - { id: refinement, body: refine, until: '$.error_count == 0', max_iters: 5 }
```

## Dataset → tool → agent (the common case)

```yaml
state:
  schema:
    raw: { type: array, items: { type: object } }
    aggregated: { type: object }
    insight: { type: string }
graph:
  nodes:
    - {
        id: load,
        kind: dataset,
        source: { type: file, uri: ./data.csv, format: csv },
        writes: [raw],
      }
    - { id: agg, kind: tool, impl: ./tools/agg.mjs, reads: [raw], writes: [aggregated] }
    - {
        id: explain,
        kind: agent,
        prompt: ./prompts/explain.md,
        reads: [aggregated],
        writes: [insight],
      }
  edges:
    - { from: load, to: agg }
    - { from: agg, to: explain }
```
