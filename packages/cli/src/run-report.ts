import type { ExperienceSpec } from '@openexpertise/schema'
import { renderMermaid, type NodeRunStatus } from './render-mermaid.js'

/**
 * Loose structural type for a parsed run event. The JSONL is parsed to plain
 * objects, so we deliberately do NOT couple to core's `RunEvent` union — the
 * report should render even if the event shape drifts.
 */
export type RunEventLike = {
  type: string
  ts?: string
  node_id?: string
  [k: string]: unknown
}

export interface NodeSummary {
  node_id: string
  status: 'success' | 'failed' | 'skipped' | 'running'
  started_at?: string
  ended_at?: string
  duration_ms?: number
  tokens_in?: number
  tokens_out?: number
  detail?: string // error message or skip reason
}

export interface RunSummary {
  overallStatus: 'success' | 'failed' | 'partial' | 'unknown'
  nodeStatus: Record<string, NodeSummary['status']>
  nodes: NodeSummary[] // in first-seen order
  totals: {
    nodes: number
    failed: number
    skipped: number
    tokens_in: number
    tokens_out: number
    duration_ms?: number
  }
  timeline: Array<{ ts?: string; type: string; node_id?: string; detail?: string }>
  runId?: string
}

const TERMINAL_STATUS: Record<string, NodeSummary['status']> = {
  'node.finished': 'success',
  'node.failed': 'failed',
  'node.skipped': 'skipped',
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function timelineDetail(e: RunEventLike): string | undefined {
  if (e.type === 'node.failed') return asString(e.error)
  if (e.type === 'node.skipped') return asString(e.reason)
  if (e.type === 'run.finished') return asString(e.status)
  const metrics = e.metrics as { tokens_in?: unknown; tokens_out?: unknown } | undefined
  if (metrics && typeof metrics === 'object') {
    const ti = asNumber(metrics.tokens_in)
    const to = asNumber(metrics.tokens_out)
    if (ti !== undefined || to !== undefined) return `tokens_in=${ti ?? 0} tokens_out=${to ?? 0}`
  }
  if (e.type === 'node.tokens') {
    const ti = asNumber(e.input_tokens)
    const to = asNumber(e.output_tokens)
    if (ti !== undefined || to !== undefined) return `tokens_in=${ti ?? 0} tokens_out=${to ?? 0}`
  }
  return undefined
}

/**
 * Pure aggregator: collapse a sorted (by ts) sequence of run events into a
 * per-node + overall run summary. The only "impurity" is `Date.parse` on the
 * provided ts strings — it operates on input data, never the wall clock.
 */
export function summarizeRun(events: RunEventLike[]): RunSummary {
  // Per-node accumulators, keyed by node_id, preserving first-seen order.
  interface Acc {
    node_id: string
    status: NodeSummary['status']
    started_at: string | undefined
    ended_at: string | undefined
    detail: string | undefined
    metricsTokensIn: number | undefined
    metricsTokensOut: number | undefined
    sumTokensIn: number
    sumTokensOut: number
    sawTokens: boolean
  }
  const order: string[] = []
  const byNode = new Map<string, Acc>()
  const ensure = (id: string): Acc => {
    let acc = byNode.get(id)
    if (!acc) {
      acc = {
        node_id: id,
        status: 'running',
        started_at: undefined,
        ended_at: undefined,
        detail: undefined,
        metricsTokensIn: undefined,
        metricsTokensOut: undefined,
        sumTokensIn: 0,
        sumTokensOut: 0,
        sawTokens: false,
      }
      byNode.set(id, acc)
      order.push(id)
    }
    return acc
  }

  let runFinishedStatus: string | undefined
  let runStartedTs: string | undefined
  let runFinishedTs: string | undefined
  let runId: string | undefined

  for (const e of events) {
    if (runId === undefined) runId = asString(e.run_id)

    if (e.type === 'run.started') {
      runStartedTs = e.ts ?? runStartedTs
      continue
    }
    if (e.type === 'run.finished') {
      runFinishedTs = e.ts ?? runFinishedTs
      runFinishedStatus = asString(e.status) ?? runFinishedStatus
      continue
    }

    const nodeId = e.node_id
    if (nodeId === undefined) continue
    const acc = ensure(nodeId)

    if (e.type === 'node.started') {
      acc.started_at = e.ts ?? acc.started_at
      continue
    }
    if (e.type === 'node.ready') {
      // ready alone keeps the node 'running' until a terminal event arrives
      continue
    }

    const terminal = TERMINAL_STATUS[e.type]
    if (terminal !== undefined) {
      // Last terminal event wins.
      acc.status = terminal
      acc.ended_at = e.ts ?? acc.ended_at
      if (e.type === 'node.failed') acc.detail = asString(e.error)
      else if (e.type === 'node.skipped') acc.detail = asString(e.reason)
      if (e.type === 'node.finished') {
        const metrics = e.metrics as { tokens_in?: unknown; tokens_out?: unknown } | undefined
        if (metrics && typeof metrics === 'object') {
          const ti = asNumber(metrics.tokens_in)
          const to = asNumber(metrics.tokens_out)
          if (ti !== undefined) acc.metricsTokensIn = ti
          if (to !== undefined) acc.metricsTokensOut = to
        }
      }
      continue
    }

    if (e.type === 'node.tokens') {
      const ti = asNumber(e.input_tokens)
      const to = asNumber(e.output_tokens)
      if (ti !== undefined || to !== undefined) {
        acc.sawTokens = true
        acc.sumTokensIn += ti ?? 0
        acc.sumTokensOut += to ?? 0
      }
      continue
    }
    // Other event types (node.activity, state.write, …) don't change node state.
  }

  const nodes: NodeSummary[] = order.map((id) => {
    const acc = byNode.get(id)!
    // Prefer node.finished.metrics; else fall back to summed node.tokens.
    const tokens_in =
      acc.metricsTokensIn !== undefined
        ? acc.metricsTokensIn
        : acc.sawTokens
          ? acc.sumTokensIn
          : undefined
    const tokens_out =
      acc.metricsTokensOut !== undefined
        ? acc.metricsTokensOut
        : acc.sawTokens
          ? acc.sumTokensOut
          : undefined
    let duration_ms: number | undefined
    if (acc.started_at !== undefined && acc.ended_at !== undefined) {
      const start = Date.parse(acc.started_at)
      const end = Date.parse(acc.ended_at)
      if (Number.isFinite(start) && Number.isFinite(end)) duration_ms = end - start
    }
    // Omit undefined optional keys (exactOptionalPropertyTypes is on).
    const node: NodeSummary = { node_id: acc.node_id, status: acc.status }
    if (acc.started_at !== undefined) node.started_at = acc.started_at
    if (acc.ended_at !== undefined) node.ended_at = acc.ended_at
    if (duration_ms !== undefined) node.duration_ms = duration_ms
    if (tokens_in !== undefined) node.tokens_in = tokens_in
    if (tokens_out !== undefined) node.tokens_out = tokens_out
    if (acc.detail !== undefined) node.detail = acc.detail
    return node
  })

  const nodeStatus: Record<string, NodeSummary['status']> = {}
  let failed = 0
  let skipped = 0
  let running = 0
  let totalTokensIn = 0
  let totalTokensOut = 0
  for (const n of nodes) {
    nodeStatus[n.node_id] = n.status
    if (n.status === 'failed') failed++
    if (n.status === 'skipped') skipped++
    if (n.status === 'running') running++
    if (n.tokens_in !== undefined) totalTokensIn += n.tokens_in
    if (n.tokens_out !== undefined) totalTokensOut += n.tokens_out
  }

  // Prefer the explicit run.finished.status. Otherwise derive: failed wins,
  // then partial (skips). A still-running node (no terminal event) with no
  // run.finished means the run state is unknown — we can't claim success.
  let overallStatus: RunSummary['overallStatus']
  if (runFinishedStatus === 'success' || runFinishedStatus === 'failed') {
    overallStatus = runFinishedStatus
  } else if (runFinishedStatus === 'partial') {
    overallStatus = 'partial'
  } else if (failed > 0) {
    overallStatus = 'failed'
  } else if (running > 0) {
    overallStatus = 'unknown'
  } else if (skipped > 0) {
    overallStatus = 'partial'
  } else if (nodes.length > 0) {
    overallStatus = 'success'
  } else {
    overallStatus = 'unknown'
  }

  let runDuration: number | undefined
  if (runStartedTs !== undefined && runFinishedTs !== undefined) {
    const start = Date.parse(runStartedTs)
    const end = Date.parse(runFinishedTs)
    if (Number.isFinite(start) && Number.isFinite(end)) runDuration = end - start
  }

  const timeline = events.map((e) => {
    const entry: RunSummary['timeline'][number] = { type: e.type }
    if (e.ts !== undefined) entry.ts = e.ts
    if (e.node_id !== undefined) entry.node_id = e.node_id
    const detail = timelineDetail(e)
    if (detail !== undefined) entry.detail = detail
    return entry
  })

  const totals: RunSummary['totals'] = {
    nodes: nodes.length,
    failed,
    skipped,
    tokens_in: totalTokensIn,
    tokens_out: totalTokensOut,
  }
  if (runDuration !== undefined) totals.duration_ms = runDuration

  const summary: RunSummary = { overallStatus, nodeStatus, nodes, totals, timeline }
  if (runId !== undefined) summary.runId = runId
  return summary
}

// HTML-escape every interpolated runtime string (node ids, errors, reasons,
// experience name). `&` first so we don't double-escape the others.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escOpt(s: string | undefined): string {
  return s === undefined ? '' : esc(s)
}

const STATUS_BADGE: Record<RunSummary['overallStatus'], string> = {
  success: '#2e7d32',
  failed: '#c62828',
  partial: '#f9a825',
  unknown: '#9e9e9e',
}

function fmtDuration(ms: number | undefined): string {
  if (ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 2)} s`
}

function fmtNum(n: number | undefined): string {
  return n === undefined ? '—' : String(n)
}

/**
 * Pure: build a self-contained HTML run report — the status-colored DAG, a
 * per-node table, and an events timeline. Every interpolated runtime string is
 * HTML-escaped.
 */
export function renderRunReportHtml(
  spec: ExperienceSpec,
  summary: RunSummary,
  runId?: string,
): string {
  const name = esc(spec.name ?? 'experience')
  const rid = escOpt(runId ?? summary.runId)
  const overall = summary.overallStatus
  const badgeColor = STATUS_BADGE[overall]
  const mermaid = renderMermaid(spec, {
    nodeStatus: summary.nodeStatus as Record<string, NodeRunStatus>,
  })

  const nodeRows = summary.nodes
    .map(
      (n) => `      <tr class="status-${esc(n.status)}">
        <td><code>${esc(n.node_id)}</code></td>
        <td><span class="badge badge-${esc(n.status)}">${esc(n.status)}</span></td>
        <td class="num">${fmtDuration(n.duration_ms)}</td>
        <td class="num">${fmtNum(n.tokens_in)}</td>
        <td class="num">${fmtNum(n.tokens_out)}</td>
        <td>${escOpt(n.detail)}</td>
      </tr>`,
    )
    .join('\n')

  const timelineRows = summary.timeline
    .map(
      (t) => `      <tr>
        <td class="ts">${escOpt(t.ts)}</td>
        <td><code>${esc(t.type)}</code></td>
        <td><code>${escOpt(t.node_id)}</code></td>
        <td>${escOpt(t.detail)}</td>
      </tr>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name} — OpenExpertise run report</title>
<style>
:root{color-scheme:light}
body{font-family:system-ui,-apple-system,sans-serif;margin:2rem;background:#fafafa;color:#1a1a1a}
h1{font-size:1.3rem;margin:0 0 .25rem}
h2{font-size:1rem;margin:2rem 0 .5rem;color:#444}
.meta{color:#666;font-size:.9rem;margin-bottom:1rem}
.meta code{background:#eee;padding:.1rem .35rem;border-radius:3px}
.totals{display:flex;flex-wrap:wrap;gap:1rem;margin:1rem 0}
.totals .cell{background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:.5rem .75rem;font-size:.9rem}
.totals .cell b{display:block;font-size:1.1rem}
.badge{display:inline-block;padding:.1rem .5rem;border-radius:10px;font-size:.8rem;color:#fff;font-weight:600}
.badge-success{background:#2e7d32}
.badge-failed{background:#c62828}
.badge-skipped{background:#9e9e9e}
.badge-running{background:#f9a825}
.overall{display:inline-block;padding:.15rem .6rem;border-radius:10px;font-size:.9rem;color:#fff;font-weight:600;background:${badgeColor}}
pre.mermaid{background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:1rem;overflow:auto}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e0e0e0;border-radius:6px;font-size:.9rem}
th,td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #eee;vertical-align:top}
th{background:#f5f5f5;font-weight:600}
td.num,td.ts{font-variant-numeric:tabular-nums;white-space:nowrap;color:#555}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em}
</style>
</head>
<body>
<h1>${name} <span class="overall">${esc(overall)}</span></h1>
<div class="meta">Run <code>${rid}</code></div>
<div class="totals">
  <div class="cell"><b>${summary.totals.nodes}</b>nodes</div>
  <div class="cell"><b>${summary.totals.failed}</b>failed</div>
  <div class="cell"><b>${summary.totals.skipped}</b>skipped</div>
  <div class="cell"><b>${summary.totals.tokens_in}</b>tokens in</div>
  <div class="cell"><b>${summary.totals.tokens_out}</b>tokens out</div>
  <div class="cell"><b>${fmtDuration(summary.totals.duration_ms)}</b>duration</div>
</div>

<h2>Graph</h2>
<pre class="mermaid">
${mermaid}</pre>

<h2>Nodes</h2>
<table>
  <thead>
    <tr><th>node</th><th>status</th><th>duration</th><th>tokens in</th><th>tokens out</th><th>detail</th></tr>
  </thead>
  <tbody>
${nodeRows}
  </tbody>
</table>

<h2>Timeline</h2>
<table>
  <thead>
    <tr><th>ts</th><th>type</th><th>node</th><th>detail</th></tr>
  </thead>
  <tbody>
${timelineRows}
  </tbody>
</table>

<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
mermaid.initialize({ startOnLoad: true, theme: 'neutral' })
</script>
</body>
</html>
`
}
