---
title: dataset-aggregate
description: Load a CSV with a dataset node, then aggregate it with a tool node — no LLM required.
---

# dataset-aggregate

_A two-node pipeline: a [`dataset`](/concepts/node-dataset) node loads a CSV into [state](/concepts/state), a [`tool`](/concepts/node-tool) node aggregates it — no LLM involved._

## What it demonstrates

- The `dataset` node kind with a local CSV source
- Sequential edge: `load_rows → aggregate`
- A tool reading from state via the `reads` contract
- Pure-compute pipelines (no LLM, no external services)

## The graph

```yaml
graph:
  nodes:
    - id: load_rows
      kind: dataset
      source:
        type: file
        uri: ./data/sample.csv
        format: csv
      writes: [rows]
    - id: aggregate
      kind: tool
      impl: ./tools/aggregate.mjs
      reads: [rows]
      writes: [total]
  edges:
    - { from: load_rows, to: aggregate }
```

## State schema

| Field   | Type            | Direction    | Description                    |
| ------- | --------------- | ------------ | ------------------------------ |
| `rows`  | `array<object>` | intermediate | CSV rows loaded by `load_rows` |
| `total` | `number`        | out          | Sum of the `amount` column     |

## How it runs

```bash
oe run examples/dataset-aggregate
```

No `ANTHROPIC_API_KEY` required. No CLIs required.

## What happens

1. `load_rows` (dataset node) reads `data/sample.csv`, parses it as CSV, and writes each row as an object into `rows`.
2. `aggregate` receives the full `rows` array via its `reads: [rows]` binding, sums the `amount` column, and writes `total`.

```
$ oe state total
60
```

`data/sample.csv` contains five rows with amounts 5, 10, 15, 20, 10 — total 60.

## How `aggregate.mjs` reads state

```js
export default async function aggregate(args) {
  const rows = args._state?.rows ?? []
  const total = rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0)
  return { state_delta: { total } }
}
```

State fields declared in `reads` are available on `args._state`. This is the canonical pattern for tools that consume upstream state.

## Try it: variations

**1. Swap the CSV.**
Replace `data/sample.csv` with any CSV that has an `amount` column (or update the aggregation formula in `aggregate.mjs`).

**2. Add a filter node.**
Insert a `filter` tool between `load_rows` and `aggregate` that writes `filtered_rows` from `rows` (e.g., only rows where `amount > 10`). Update the edge chain and the `reads` binding on `aggregate`.

**3. Replace CSV with JSON.**
Change `format: csv` to `format: json` and point `uri` at a `.json` file containing an array of objects. The dataset node handles both formats.

::: tip LLM-free pipeline
This example shows that OpenExpertise is not only for AI workflows. Any deterministic data pipeline — ETL, file transforms, CI artifact processing — can be expressed as a graph of tool nodes.
:::

## Source

[examples/dataset-aggregate/](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/dataset-aggregate)
