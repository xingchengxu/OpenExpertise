# Observability

Every OpenExpertise run produces a structured, replayable trace. This page covers the JSONL event log format, the TUI dashboard, how to write custom subscribers, and how to bridge events into Prometheus, OpenTelemetry, PagerDuty, and Datadog.

---

## The JSONL event log

Every run writes one file: `.openexpertise/runs/<run-id>.jsonl`. Each line is a JSON-encoded `RunEvent` appended synchronously via `JsonlEventSink`.

### Event types

| `type`          | When emitted                                 | Key fields                                                                        |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| `run.started`   | Start of `runExperience`                     | `run_id`, `ts`, `args`                                                            |
| `run.finished`  | End of `runExperience`                       | `run_id`, `ts`, `status` (`success` \| `failed` \| `partial`)                     |
| `node.ready`    | Scheduler: node's dependencies are satisfied | `node_id`, `phase`                                                                |
| `node.started`  | Dispatcher: about to call impl               | `node_id`, `phase`                                                                |
| `node.finished` | Dispatcher: impl returned successfully       | `node_id`, `phase`, `metrics.tokens_in`, `metrics.tokens_out`, `metrics.cost_usd` |
| `node.failed`   | Dispatcher: impl threw                       | `node_id`, `phase`, `error`                                                       |
| `node.skipped`  | Cache hit or `when:` condition false         | `node_id`, `phase`, `reason`                                                      |
| `node.activity` | Agent/cli-agent: progress milestones         | `node_id`, `activity` (e.g. `"calling claude-sonnet-4-6"`)                        |
| `node.tokens`   | LLM call returned usage                      | `node_id`, `input_tokens`, `output_tokens`, `model`                               |
| `state.write`   | `StateStore.write()` called                  | `node_id`, `field`                                                                |

### Replay a run

```bash
oe inspect <run-id>
# → streams all events sorted by ts, pretty-printed
```

Or read the raw JSONL directly:

```bash
cat .openexpertise/runs/<run-id>.jsonl | jq .
```

---

## TUI dashboard

The `--tui` flag on `oe run` mounts an Ink-based live dashboard provided by `@openexpertise/tui`. It subscribes to the `EventBus` before the run starts and renders a live view with:

- **Header bar** — run id, elapsed time, total token count.
- **Node list** — one row per node: phase, status icon (waiting / running / done / failed / skipped), last activity string.
- **Token column** — per-node cumulative input + output tokens.
- **Activity feed** — scrolling log of `node.activity` events, rate-limited to avoid flicker.

```bash
oe run examples/review-branch --tui
```

The dashboard is read-only; it does not block the run. If stdout is not a TTY (CI, redirected), `--tui` degrades gracefully to plain log output.

See [Guide: TUI dashboard](/guide/tui) for a screenshot walkthrough.

---

## Custom event subscribers

`EventBus` exposes a simple pub-sub interface. Subscribe before calling `runExperience`:

```typescript
import { runExperience, EventBus } from '@openexpertise/core'

const events = new EventBus()

// Your subscriber — called synchronously for every event
const unsub = events.subscribe((event) => {
  if (event.type === 'node.tokens') {
    console.log(`[${event.node_id}] tokens: in=${event.input_tokens} out=${event.output_tokens}`)
  }
})

await runExperience({ spec, experienceDir, dispatchers, events })
unsub()
```

::: warning Subscriber errors are swallowed
If your subscriber throws, the error is logged to stderr but the run continues. This is intentional: a broken metrics sink must not abort a production flow.
:::

---

## Prometheus integration

Export per-run and per-node metrics to a Prometheus Pushgateway. The pattern below accumulates token counts and node durations, then pushes at the end of the run.

```typescript
import { runExperience, EventBus } from '@openexpertise/core'
import Pushgateway from 'prom-client/pushgateway'

const events = new EventBus()
const nodeDurations: Map<string, number> = new Map()
const tokenTotals = { in: 0, out: 0 }
const startTimes: Map<string, number> = new Map()

events.subscribe((e) => {
  if (e.type === 'node.started') startTimes.set(e.node_id, Date.now())
  if (e.type === 'node.finished') {
    const ms = Date.now() - (startTimes.get(e.node_id) ?? Date.now())
    nodeDurations.set(e.node_id, ms)
  }
  if (e.type === 'node.tokens') {
    tokenTotals.in += e.input_tokens
    tokenTotals.out += e.output_tokens
  }
})

const result = await runExperience({ spec, experienceDir, dispatchers, events })

const gw = new Pushgateway('http://pushgateway:9091')
// Push as gauge (simplest shape — adapt to counters/histograms as needed)
await gw.push({ jobName: 'openexpertise', groupings: { run_id: result.runId } })
```

::: tip Instrument with labels
Tag every metric with `experience_name` and `run_id` so you can group and alert per-experience in Grafana.
:::

---

## OpenTelemetry integration

Create an OTel span per node using the `node.started` / `node.finished` / `node.failed` event triplet.

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api'
import { EventBus } from '@openexpertise/core'

const tracer = trace.getTracer('openexpertise')
const spans: Map<string, ReturnType<typeof tracer.startSpan>> = new Map()

const events = new EventBus()
events.subscribe((e) => {
  if (e.type === 'run.started') {
    const rootSpan = tracer.startSpan('oe.run', {
      attributes: { 'oe.run_id': e.run_id },
    })
    spans.set('__run__', rootSpan)
  }
  if (e.type === 'node.started') {
    const span = tracer.startSpan(`oe.node.${e.node_id}`)
    spans.set(e.node_id, span)
  }
  if (e.type === 'node.finished') {
    spans.get(e.node_id)?.end()
    spans.delete(e.node_id)
  }
  if (e.type === 'node.failed') {
    const s = spans.get(e.node_id)
    s?.setStatus({ code: SpanStatusCode.ERROR, message: e.error })
    s?.end()
    spans.delete(e.node_id)
  }
  if (e.type === 'run.finished') {
    spans.get('__run__')?.end()
  }
})
```

Export to any OTLP-compatible backend (Jaeger, Tempo, Honeycomb, etc.) by configuring the OTel SDK as usual before running.

---

## PagerDuty integration

Trigger an incident when a run finishes with `status: 'failed'`.

```typescript
import { EventBus } from '@openexpertise/core'

const events = new EventBus()
events.subscribe(async (e) => {
  if (e.type === 'run.finished' && e.status === 'failed') {
    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: process.env.PD_ROUTING_KEY,
        event_action: 'trigger',
        payload: {
          summary: `OpenExpertise run ${e.run_id} failed`,
          severity: 'error',
          source: 'openexpertise',
          custom_details: { run_id: e.run_id, ts: e.ts },
        },
      }),
    })
  }
})
```

::: info Use `node.failed` for node-level alerts
To page on individual node failures (e.g. the `score` agent in a review-branch run), subscribe to `node.failed` instead and filter by `e.node_id`.
:::

---

## Datadog integration

Ship metrics as DogStatsD gauges and custom events. The snippet below uses `hot-shots`, but any StatsD client works.

```typescript
import StatsD from 'hot-shots'
import { EventBus } from '@openexpertise/core'

const dd = new StatsD({ host: 'localhost', port: 8125, prefix: 'oe.' })
const events = new EventBus()

events.subscribe((e) => {
  const tags = [`run_id:${e.run_id}`]
  if ('node_id' in e) tags.push(`node_id:${e.node_id}`)

  if (e.type === 'node.tokens') {
    dd.gauge('tokens.input', e.input_tokens, tags)
    dd.gauge('tokens.output', e.output_tokens, tags)
  }
  if (e.type === 'node.finished') {
    dd.increment('node.success', tags)
  }
  if (e.type === 'node.failed') {
    dd.increment('node.failure', tags)
    dd.event(`OE node failed: ${e.node_id}`, e.error, { alertType: 'error' })
  }
  if (e.type === 'run.finished') {
    dd.increment(`run.${e.status}`, tags)
  }
})
```

---

## Reading the event log offline

Because the JSONL log contains all timing and token information, you can derive any metric after the fact without a live subscriber:

```bash
# All node finish events from a given run, with token totals
cat .openexpertise/runs/<run-id>.jsonl \
  | jq 'select(.type == "node.finished") | {node_id, metrics}'

# Sum total tokens across a run
cat .openexpertise/runs/<run-id>.jsonl \
  | jq '[select(.type == "node.tokens") | .input_tokens + .output_tokens] | add'

# Timeline of node activity
cat .openexpertise/runs/<run-id>.jsonl \
  | jq 'select(.type == "node.activity") | [.ts, .node_id, .activity] | @tsv' -r
```

---

## See also

- [Concepts: Events and event log](/concepts/events)
- [Guide: TUI dashboard](/guide/tui)
- [Architecture overview](/operations/architecture)
- [CLI: `oe inspect`](/reference/cli/inspect)
