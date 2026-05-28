import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Demo {
  name: string
  one_liner: string
  category: 'multi-vendor' | 'fan-out' | 'skill-translation' | 'ideation'
  run: {
    command: string
    duration: string
    status: 'success' | 'failed' | 'partial'
    final_state_preview: Record<string, string>
    event_count: number
    node_count: number
  }
  evolution_proposal?: {
    rationale: string
    operation: string
    diff: string
  }
  tip?: string
}

const HERE = dirname(fileURLToPath(import.meta.url))

const DEMO_NAMES = ['deep-research', 'review-branch', 'systematic-debugging', 'brainstorming']

export function loadDemo(name: string): Demo | null {
  if (!DEMO_NAMES.includes(name)) return null
  try {
    const path = resolve(HERE, '..', 'demos', `${name}.json`)
    return JSON.parse(readFileSync(path, 'utf8')) as Demo
  } catch {
    return null
  }
}

export function listDemos(): { name: string; one_liner: string; has_evolution: boolean }[] {
  return DEMO_NAMES.map((name) => {
    const demo = loadDemo(name)
    return {
      name,
      one_liner: demo?.one_liner ?? '',
      has_evolution: demo?.evolution_proposal !== undefined,
    }
  })
}
