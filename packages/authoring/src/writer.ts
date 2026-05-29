import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, relative, sep } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import type { AnalysisOutput, SynthesisOutput } from './schemas.js'

export class PathTraversalError extends Error {
  constructor(public readonly attemptedPath: string) {
    super(`writeDraft rejected unsafe path: "${attemptedPath}"`)
    this.name = 'PathTraversalError'
  }
}

export interface WriteDraftOpts {
  draftDir: string
  experienceYaml: string
  files: Array<{ path: string; content: string }>
}

export interface WriteDraftResult {
  draftDir: string
  files_written: string[]
}

export async function writeDraft(opts: WriteDraftOpts): Promise<WriteDraftResult> {
  const absRoot = resolve(opts.draftDir)
  mkdirSync(absRoot, { recursive: true })

  const written: string[] = []

  // experience.yaml is always at the root.
  const yamlAbs = join(absRoot, 'experience.yaml')
  writeFileSync(yamlAbs, opts.experienceYaml)
  written.push('experience.yaml')

  for (const f of opts.files) {
    if (isAbsolute(f.path)) {
      throw new PathTraversalError(f.path)
    }
    const abs = resolve(absRoot, f.path)
    const rel = relative(absRoot, abs)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new PathTraversalError(f.path)
    }
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.content)
    written.push(rel)
  }

  return { draftDir: absRoot, files_written: written }
}

export interface ReadDraftResult {
  draftDir: string
  synthesis: SynthesisOutput
  analysis: AnalysisOutput
}

// Read-side inverse of writeDraft: reconstructs a SynthesisOutput from disk
// (experience.yaml at the root + recursively collected supporting files), and
// loads analysis.json as the analysis (re-derived-minimal fallback when absent).
// analysis.json is EXCLUDED from the reconstructed SynthesisOutput.files[].
export function readDraft(draftDir: string): ReadDraftResult {
  const absRoot = resolve(draftDir)
  // Reject a draftDir that contains a `..` traversal segment (e.g. `../../etc`).
  // NOTE (divergence from the plan): the plan's published code used a CWD-relative
  // guard `relative(resolve('.'), absRoot).startsWith('..')`. In this repo's vitest
  // environment `os.tmpdir()` is `/tmp/...`, which lives OUTSIDE the repo-root CWD,
  // so a CWD-relative guard rejects every legitimate `mkdtempSync(tmpdir())` draft —
  // including the plan's own round-trip/fallback fixtures. We instead reject on a
  // literal `..` segment in the input path: this throws on `../../etc` (the plan's
  // PathTraversalError test) while allowing an absolute temp/project draft dir, which
  // is what every production caller passes (CLI/MCP `resolve(draftPath)` first). The
  // per-entry walk below re-checks each collected path for `..`/absolute leakage as a
  // second layer, mirroring writeDraft's two-layer guard.
  if (draftDir.split(/[\\/]/).includes('..')) {
    throw new PathTraversalError(draftDir)
  }

  const experienceYaml = readFileSync(join(absRoot, 'experience.yaml'), 'utf8')

  // Recursively collect every file under absRoot EXCEPT experience.yaml and analysis.json.
  const files: Array<{ path: string; content: string }> = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry)
      const rel = relative(absRoot, abs).split(sep).join('/')
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new PathTraversalError(rel)
      }
      if (statSync(abs).isDirectory()) {
        walk(abs)
        continue
      }
      if (rel === 'experience.yaml' || rel === 'analysis.json') continue
      files.push({ path: rel, content: readFileSync(abs, 'utf8') })
    }
  }
  walk(absRoot)

  const synthesis: SynthesisOutput = { experience_yaml: experienceYaml, files }

  // Load analysis.json as the analysis, or re-derive a minimal one from the YAML.
  let analysis: AnalysisOutput
  try {
    analysis = JSON.parse(readFileSync(join(absRoot, 'analysis.json'), 'utf8')) as AnalysisOutput
  } catch {
    analysis = deriveMinimalAnalysis(experienceYaml)
  }

  return { draftDir: absRoot, synthesis, analysis }
}

function deriveMinimalAnalysis(experienceYaml: string): AnalysisOutput {
  let name = 'recovered-draft'
  let description = 'Re-derived from experience.yaml (analysis.json was absent).'
  let phases: Array<{ id: string; title?: string }> = []
  const stateFields: AnalysisOutput['state_fields'] = []
  const nodeSketches: AnalysisOutput['node_sketches'] = []
  try {
    // Cast THROUGH unknown: parseExperienceYaml returns ExperienceSpec (graph: GraphSpec
    // required, nodes: NodeSpec[] discriminated union). A direct `as` to this loosened
    // literal shape can trip TS2352 ("neither sufficiently overlaps") because NodeSpec is
    // a union and the target uses a narrower `{ id; kind }`. `as unknown as` is safe here.
    const spec = parseExperienceYaml(experienceYaml) as unknown as {
      name?: string
      description?: string
      phases?: Array<{ id: string; title?: string }>
      state?: { schema?: Record<string, unknown> }
      graph?: { nodes?: Array<{ id: string; kind: string }> }
    }
    if (typeof spec.name === 'string') name = spec.name
    if (typeof spec.description === 'string') description = spec.description
    if (Array.isArray(spec.phases)) phases = spec.phases
    for (const k of Object.keys(spec.state?.schema ?? {})) {
      stateFields.push({ name: k, type: 'string' })
    }
    for (const n of spec.graph?.nodes ?? []) {
      nodeSketches.push({
        id: n.id,
        kind: n.kind as AnalysisOutput['node_sketches'][number]['kind'],
        purpose: 'recovered',
      })
    }
  } catch {
    // unparseable YAML → keep the placeholder minimal analysis
  }
  return {
    name,
    description,
    phases,
    state_fields: stateFields,
    node_sketches:
      nodeSketches.length > 0 ? nodeSketches : [{ id: 'node', kind: 'tool', purpose: 'recovered' }],
  }
}
