import type { AnalysisOutput } from './schemas.js'

export interface Exemplar {
  name: string
  description: string
  experience_yaml_excerpt: string
}

// Histogram of node kinds, lifted from the CLI's printAnalysisShape kindCounts.
function kindHistogram(kinds: string[]): Record<string, number> {
  const h: Record<string, number> = {}
  for (const k of kinds) h[k] = (h[k] ?? 0) + 1
  return h
}

function jaccard(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let inter = 0
  let union = 0
  for (const k of keys) {
    const av = a[k] ?? 0
    const bv = b[k] ?? 0
    inter += Math.min(av, bv)
    union += Math.max(av, bv)
  }
  return union === 0 ? 0 : inter / union
}

function tokens(...parts: string[]): Set<string> {
  return new Set(
    parts
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )
}

function keywordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / Math.max(a.size, b.size)
}

// Cheap, synchronous, no embeddings. Node-kind histogram (w2) dominates keyword
// overlap (w1) because free-text overlap is weak for novel domains.
const W1 = 0.3
const W2 = 0.6
const W3 = 0.1

export function pickExemplars(
  analysis: AnalysisOutput,
  corpus: Exemplar[],
  n = 2,
): Exemplar[] {
  if (corpus.length === 0 || n <= 0) return []

  const aHist = kindHistogram(analysis.node_sketches.map((s) => s.kind))
  const aTokens = tokens(analysis.name, analysis.description, analysis.domain ?? '')
  const aFanOut = analysis.node_sketches.some((s) => Boolean(s.fan_out_over))

  const scored = corpus.map((ex) => {
    const exKinds = [...ex.experience_yaml_excerpt.matchAll(/kind:\s*([a-z-]+)/g)].map((m) => m[1]!)
    const exHist = kindHistogram(exKinds)
    const exTokens = tokens(ex.name, ex.description)
    const exFanOut = /for_each/.test(ex.experience_yaml_excerpt)
    const score =
      W1 * keywordOverlap(aTokens, exTokens) +
      W2 * jaccard(aHist, exHist) +
      W3 * (aFanOut === exFanOut ? 1 : 0)
    return { ex, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, n).map((s) => s.ex)
}
