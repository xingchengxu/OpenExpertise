import type { ExperienceSpec, NodeSpec, NodeKind } from '@openexpertise/schema'

export type NodeRunStatus = 'success' | 'failed' | 'skipped' | 'running'

export interface RenderMermaidOpts {
  direction?: 'TD' | 'LR'
  nodeStatus?: Record<string, NodeRunStatus>
}

const SHAPE: Record<NodeKind, [string, string]> = {
  tool: ['["', '"]'],
  agent: ['("', '")'],
  'cli-agent': ['[["', '"]]'],
  dataset: ['[("', '")]'],
  skill: ['(["', '"])'],
  experience: ['{{"', '"}}'],
}

const CLASSDEF: Record<NodeKind, string> = {
  tool: 'fill:#e3f2fd,stroke:#1565c0',
  agent: 'fill:#ede7f6,stroke:#5e35b1',
  'cli-agent': 'fill:#fff3e0,stroke:#e65100',
  dataset: 'fill:#e8f5e9,stroke:#2e7d32',
  skill: 'fill:#fce4ec,stroke:#ad1457',
  experience: 'fill:#eceff1,stroke:#455a64',
}

// Mermaid label escaping: `"` is structurally dangerous inside our quoted
// shapes; also escape `&`/`<`/`>` so condition strings like `> 0` don't render
// as HTML entities/tags. `&` first so we don't double-escape the others.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function makeSafeIds(
  nodes: NodeSpec[],
  edges: { from: string; to: string }[],
): Map<string, string> {
  const ids: string[] = []
  const seen = new Set<string>()
  const add = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  for (const n of nodes) add(n.id)
  for (const e of edges) {
    add(e.from)
    add(e.to)
  }
  const used = new Set<string>()
  const map = new Map<string, string>()
  for (const id of ids) {
    let safe = id.replace(/[^A-Za-z0-9_]/g, '_')
    if (!/^[A-Za-z_]/.test(safe)) safe = 'n_' + safe
    let candidate = safe
    let i = 1
    while (used.has(candidate)) candidate = `${safe}_${i++}`
    used.add(candidate)
    map.set(id, candidate)
  }
  return map
}

export function renderMermaid(spec: ExperienceSpec, opts: RenderMermaidOpts = {}): string {
  const dir = opts.direction === 'LR' ? 'LR' : 'TD'
  const nodes = spec.graph?.nodes ?? []
  const edges = spec.graph?.edges ?? []
  const safe = makeSafeIds(nodes, edges)
  const lines: string[] = [`flowchart ${dir}`]

  const nodeLine = (n: NodeSpec): string => {
    const [open, close] = SHAPE[n.kind] ?? ['["', '"]']
    const forEach = (n as { for_each?: { source: string } }).for_each
    const label = esc(n.id) + (forEach ? `\n⟳ for each ${esc(forEach.source)}` : '')
    const statusClass = opts.nodeStatus?.[n.id]
    const cls = statusClass !== undefined ? `status_${statusClass}` : n.kind
    return `${safe.get(n.id) ?? n.id}${open}${label}${close}:::${cls}`
  }

  // Group nodes by phase. Phase order + titles come from spec.phases when
  // present; phases referenced only by nodes are appended in first-seen order;
  // nodes with no phase are emitted at top level (no subgraph).
  const phaseOrder: string[] = []
  const byPhase = new Map<string, NodeSpec[]>()
  const noPhase: NodeSpec[] = []
  const phaseTitle = new Map<string, string>()
  for (const p of spec.phases ?? []) {
    phaseOrder.push(p.id)
    phaseTitle.set(p.id, p.title ?? p.id)
  }
  for (const n of nodes) {
    const ph = (n as { phase?: string }).phase
    if (!ph) {
      noPhase.push(n)
      continue
    }
    if (!byPhase.has(ph)) {
      byPhase.set(ph, [])
      if (!phaseOrder.includes(ph)) phaseOrder.push(ph)
    }
    byPhase.get(ph)!.push(n)
  }

  for (const n of noPhase) lines.push('  ' + nodeLine(n))
  for (const ph of phaseOrder) {
    const group = byPhase.get(ph)
    if (!group || group.length === 0) continue
    const safePhase = ph.replace(/[^A-Za-z0-9_]/g, '_')
    lines.push(`  subgraph phase_${safePhase}["${esc(phaseTitle.get(ph) ?? ph)}"]`)
    for (const n of group) lines.push('    ' + nodeLine(n))
    lines.push('  end')
  }

  for (const e of edges) {
    const from = safe.get(e.from) ?? e.from
    const to = safe.get(e.to) ?? e.to
    const when = (e as { when?: string }).when
    lines.push(when ? `  ${from} -->|"${esc(when)}"| ${to}` : `  ${from} --> ${to}`)
  }

  const kindsPresent = new Set(nodes.map((n) => n.kind))
  for (const k of kindsPresent)
    lines.push(`  classDef ${k} ${CLASSDEF[k] ?? 'fill:#eee,stroke:#999'}`)

  if (opts.nodeStatus !== undefined && Object.keys(opts.nodeStatus).length > 0) {
    const STATUS_CLASSDEF: Record<NodeRunStatus, string> = {
      success: 'fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px',
      failed: 'fill:#ffebee,stroke:#c62828,stroke-width:2px',
      skipped: 'fill:#f5f5f5,stroke:#9e9e9e,stroke-dasharray:4 2',
      running: 'fill:#fff8e1,stroke:#f9a825,stroke-width:2px',
    }
    const statusesUsed = new Set(Object.values(opts.nodeStatus))
    const statusOrder: NodeRunStatus[] = ['success', 'failed', 'skipped', 'running']
    for (const s of statusOrder) {
      if (statusesUsed.has(s)) lines.push(`  classDef status_${s} ${STATUS_CLASSDEF[s]}`)
    }
  }

  return lines.join('\n') + '\n'
}

export function renderMermaidHtml(spec: ExperienceSpec, mermaid: string): string {
  const title = esc(spec.name ?? 'experience')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title} — OpenExpertise graph</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#fafafa}h1{font-size:1.2rem}</style>
</head>
<body>
<h1>${title}</h1>
<pre class="mermaid">
${mermaid}</pre>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
mermaid.initialize({ startOnLoad: true, theme: 'neutral' })
</script>
</body>
</html>
`
}
