# Your first experience

Let's build a working experience from scratch — no scaffolding, no shortcuts. By the end you'll have a runnable YAML graph in your own directory, a tool stub, and a SQLite blackboard recording the run.

## What we're building

A trivial flow with two nodes:

```
fetch_quote  (tool, produces a random quote)
     │
     ▼
print_quote  (tool, reads the quote and decorates it)
```

That's it. We'll add an `agent` (LLM) node in the [next guide](/guide/run-with-llm).

## Create the directory

Anywhere outside `examples/` (so the workspace doesn't interfere):

```bash
mkdir -p ~/oe-playground/my-first-flow
cd ~/oe-playground/my-first-flow
mkdir -p tools
```

## Write `experience.yaml`

```yaml
# experience.yaml
name: my-first-flow
description: Two-step quote pipeline.
version: 0.1.0

state:
  schema:
    quote: { type: string }
    decorated: { type: string }

graph:
  nodes:
    - id: fetch_quote
      kind: tool
      impl: ./tools/fetch_quote.mjs
      writes: [quote]
    - id: print_quote
      kind: tool
      impl: ./tools/print_quote.mjs
      reads: [quote]
      writes: [decorated]
  edges:
    - { from: fetch_quote, to: print_quote }
```

Three things to notice:

1. **`state.schema` is typed.** Every field a node writes must appear here. The validator rejects writes to undeclared fields. Code-as-Law.
2. **`reads:` and `writes:` are explicit.** A tool that reads `quote` gets `bundle._state.quote` injected. A tool that writes `decorated` produces `{ state_delta: { decorated: '...' } }`.
3. **Edges are explicit.** No conventions — if A must run before B, declare `{ from: A, to: B }`. This is also what enables conditional `when:` edges and parallel execution.

## Write the tool stubs

```js
// tools/fetch_quote.mjs
export default async function fetchQuote() {
  const quotes = [
    'Make it work, make it right, make it fast.',
    'A program is a sentence whose meaning is the activity of a machine.',
    'The best way out is always through.',
  ]
  const q = quotes[Math.floor(Math.random() * quotes.length)]
  return { state_delta: { quote: q } }
}
```

```js
// tools/print_quote.mjs
export default async function printQuote(input) {
  const quote = input._state?.quote ?? '(no quote)'
  return { state_delta: { decorated: `«  ${quote}  »` } }
}
```

What's `input`? The dispatcher calls your tool with `{ ...bundle.args, _edge_inputs, _state }`. So:

- `input.someArg` — values declared in the node's `args:` field
- `input._edge_inputs` — outputs from predecessor nodes (via `edge_output`)
- `input._state` — a read-only view of the fields named in the node's `reads:`

Your tool returns one of:

```ts
{ state_delta?: { ...field: value },     // merges into the SQLite blackboard
  edge_output?: any,                     // passed to nodes that read this one's output
  metrics?: { tokens_in, tokens_out, cost_usd } }
```

## Validate

```bash
OE=$HOME/path/to/OpenExpertise/packages/cli/dist/bin.js   # adjust path
node $OE validate .
```

You should see:

```
INFO: experience valid path="...experience.yaml"
```

If you misspelled a field (e.g. `writes: [quotex]`), the validator catches it now — before any code runs.

## Run

```bash
node $OE run .
```

Expected:

```
ⓘ run-... finished
  status: "success"
  finalState: {
    "quote": "Make it work, make it right, make it fast.",
    "decorated": "«  Make it work, make it right, make it fast.  »"
  }
```

Run it again — different quote (random), same `decorated` pattern. State persists across runs in `.openexpertise/state.sqlite`. Want a clean slate?

```bash
node $OE reset-state --yes
```

## Why declare reads/writes if SQLite would let me write anything?

Because the graph is your contract. Three things flow from declared reads/writes:

1. **Validation.** The validator can compute "every field declared in `state.schema` is written by ≥0 nodes and read by ≥0 nodes". If a node writes a field nobody reads, that's signal worth surfacing (currently a warning, may become an error).
2. **Concurrency.** The scheduler knows independent nodes can run in parallel. Two nodes that write the same field — that's a deliberate choice you make with `merge: array_append | set_once | last_wins`.
3. **The evolution advisor.** When the advisor proposes adding a new dimension, it knows what state fields exist and how they're used.

## What changes if I add an LLM agent node?

Just the node entry — the rest is identical. See the [next guide](/guide/run-with-llm).

## What if I want the LLM to write this YAML for me?

```bash
node $OE ultra "Generate a random quote and decorate it with brackets"
```

The LLM analyzes the task, decomposes it into nodes, and writes a complete `experience.yaml` + tool stubs into `.openexpertise/drafts/<slug>/`. See [`oe ultra`](/guide/authoring-ultra).

→ Continue with [Run with an LLM](/guide/run-with-llm).
