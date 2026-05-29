import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'
import { buildDag } from '@openexpertise/core'
import type { SynthesisOutput } from './schemas.js'

export interface PreflightResult {
  ok: boolean
  issues: string[]
}

// Pure, side-effect-free static preflight. NEVER executes the graph.
// Necessary-not-sufficient: a green result means "would load", not "is good".
export function preflightDraft(synthesis: SynthesisOutput): PreflightResult {
  const issues: string[] = []

  let spec: ExperienceSpec
  try {
    spec = parseExperienceYaml(synthesis.experience_yaml)
  } catch (err) {
    return { ok: false, issues: [`parse: ${(err as Error).message}`] }
  }

  try {
    validateExperienceSpec(spec)
  } catch (err) {
    if (err instanceof ValidationError) {
      issues.push(...(err.errors.length > 0 ? err.errors : [err.message]))
    } else {
      issues.push((err as Error).message)
    }
  }

  try {
    buildDag(spec)
  } catch (err) {
    issues.push((err as Error).message)
  }

  // Static assertion: every node impl path the YAML references must appear in
  // synthesis.files[] (catches "tool impl not found" at run time).
  //
  // NOTE: Only `impl` is a file-path field. The `prompt` field on AgentNodeSpec
  // and CliAgentNodeSpec is inline prompt TEXT (not a path) — per the type
  // comments: "inline only in V1 — no file-path loading". Do NOT check `prompt`.
  // SkillNodeSpec and ExperienceNodeSpec also have an `impl` file-path field.
  const filePaths = new Set(synthesis.files.map((f) => f.path.replace(/^\.\//, '')))
  const nodes = (spec.graph?.nodes ?? []) as NodeSpec[]
  for (const node of nodes) {
    const impl = (node as { impl?: string }).impl
    if (typeof impl === 'string') {
      const rel = impl.replace(/^\.\//, '')
      if (!filePaths.has(rel)) {
        issues.push(`node "${node.id}" references "${impl}" which is not in synthesis.files`)
      }
    }
  }

  // Static assertion: every reads/writes field resolves to a declared state.schema key.
  // (validateExperienceSpec already catches this, but we add it here for completeness
  // in case validateExperienceSpec already threw — these checks run independently.)
  const declared = new Set(Object.keys(spec.state?.schema ?? {}))
  for (const node of nodes) {
    for (const field of [
      ...((node.writes ?? []) as string[]),
      ...((node.reads ?? []) as string[]),
    ]) {
      if (!declared.has(field)) {
        issues.push(`node "${node.id}" uses undeclared state field "${field}"`)
      }
    }
  }

  return { ok: issues.length === 0, issues }
}
