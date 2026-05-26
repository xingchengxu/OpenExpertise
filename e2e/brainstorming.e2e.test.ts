import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry,
  EventBus,
  runExperience,
  type LLMClient,
  type LLMCompleteOpts,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import {
  CliAgentDispatcher,
  type SubprocessRunner,
  type SpawnSpec,
  type RunResult,
} from '@openexpertise/node-kinds-cli-agent'

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('clustering brainstormed ideas')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              clusters: [
                {
                  id: 'c1',
                  name: 'Zero-config defaults',
                  description: 'Ideas that eliminate manual setup by shipping sensible defaults.',
                  idea_indices: [0, 1, 2, 3, 4],
                },
                {
                  id: 'c2',
                  name: 'Live failure feedback',
                  description: 'Ideas that surface errors immediately with actionable messages.',
                  idea_indices: [5, 6, 7, 8, 9],
                },
                {
                  id: 'c3',
                  name: 'Progressive onboarding',
                  description: 'Ideas that guide the user through incremental success milestones.',
                  idea_indices: [10, 11, 12, 13, 14],
                },
              ],
            },
          },
        ],
      }
    }
    if (prompt.includes('synthesis lead')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              picks: {
                top_3: [
                  {
                    idea: 'Add a `setup --dry-run` flag that prints exactly what would change before committing.',
                    why_strongest:
                      'Addresses the biggest weakness of over-documentation by replacing prose with executable proof.',
                  },
                  {
                    idea: 'Emit a "what went wrong + fix it in one command" error block on any setup failure.',
                    why_strongest:
                      'Survives the critique that live feedback is noisy by tying every error to a single remediation command.',
                  },
                  {
                    idea: 'Ship a 60-second demo script that succeeds on a fresh checkout with no environment variables.',
                    why_strongest:
                      'Counters the onboarding fragility critique by owning the full environment rather than delegating to the user.',
                  },
                ],
                reasoning:
                  'These three picks span all three clusters, ensuring diversity of mechanism. Each addresses its cluster critique directly rather than papering over it.',
                next_actions: [
                  'Build the --dry-run flag in a one-day spike and run it past 3 new contributors.',
                  'Add an error-with-remediation wrapper around the top 5 most common setup failures.',
                  'Record a sub-60-second terminal demo and link it from the README above the fold.',
                ],
              },
            },
          },
        ],
      }
    }
    return { text: 'unknown prompt' }
  }
}

class ScriptedRunner implements SubprocessRunner {
  public calls: Array<{ spec: SpawnSpec; cwd: string }> = []
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    this.calls.push({ spec, cwd: opts.cwd })
    const prompt = spec.args.find((a) => typeof a === 'string' && a.length > 20) ?? ''

    if (prompt.includes('brainstorming from a specific angle')) {
      const angleMatch = /Your angle: (\w+)/.exec(prompt)
      const angle = angleMatch?.[1] ?? 'practitioner'
      return {
        stdout: JSON.stringify({
          raw_ideas: [
            {
              angle,
              idea: `Add a one-command setup script that works on a fresh machine (${angle} idea 1).`,
              rationale: 'Eliminates the most common first-run failure: missing prerequisites.',
            },
            {
              angle,
              idea: `Provide a \`setup --check\` flag that validates the environment before making changes (${angle} idea 2).`,
              rationale: 'Surfaces config problems before they cause cryptic failures.',
            },
            {
              angle,
              idea: `Ship a working demo fixture so the user sees output within 30 seconds (${angle} idea 3).`,
              rationale: 'Gives immediate positive feedback that the tool actually works.',
            },
            {
              angle,
              idea: `Emit a concise "what failed + how to fix" block instead of a raw stack trace (${angle} idea 4).`,
              rationale: 'Converts frustration into a clear next step instead of a dead end.',
            },
            {
              angle,
              idea: `Pin all transitive dependency versions in a lockfile committed to the repo (${angle} idea 5).`,
              rationale: 'Removes the "worked on my machine" class of failures entirely.',
            },
          ],
        }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }

    if (prompt.includes('critiquing a cluster')) {
      const clusterIdMatch = /cluster_id[":\s]+(c\d+)|Cluster: (\w+)/.exec(prompt)
      const clusterIdFromName = /Cluster: (\w+)/.exec(prompt)
      // Try to extract cluster id from the prompt — the for_each item has id and name
      const clusterNameMatch = /Cluster: ([^\n]+)/.exec(prompt)
      const clusterName = clusterNameMatch?.[1]?.trim() ?? 'Unknown'
      // Map cluster name back to id via simple lookup
      const nameToId: Record<string, string> = {
        'Zero-config defaults': 'c1',
        'Live failure feedback': 'c2',
        'Progressive onboarding': 'c3',
      }
      const clusterId =
        nameToId[clusterName] ?? clusterIdMatch?.[1] ?? clusterIdFromName?.[1] ?? 'c1'
      return {
        stdout: JSON.stringify({
          critiques: [
            {
              cluster_id: clusterId,
              biggest_weakness: `The ideas in this cluster assume contributors have admin access, which many CI environments block.`,
              what_we_dont_know: `Whether the fixes work equally well on Windows, macOS, and Linux without extra branching.`,
              best_idea_in_cluster: `The one-command setup script is strongest because it is self-contained and testable in CI.`,
            },
          ],
        }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }

    return { stdout: '', stderr: 'unknown prompt', exitCode: 1, timedOut: false }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('brainstorming end-to-end (mocked LLM + cli-agent)', () => {
  it('runs all phases and produces 15 raw ideas, 3 clusters, 3 critiques, and 3 picks', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-brainstorm-'))
    const src = join(HERE, '..', 'examples', 'brainstorming')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new ScriptedLLM()
    const runner = new ScriptedRunner()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))
    dispatchers.register(new CliAgentDispatcher({ runner }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')

    // topic + angles loaded from seed
    expect(typeof result.finalState.topic).toBe('string')
    expect((result.finalState.topic as string).length).toBeGreaterThan(0)
    expect(Array.isArray(result.finalState.angles)).toBe(true)
    expect((result.finalState.angles as unknown[]).length).toBe(3)

    // diverge: 3 angles × 5 ideas = 15 raw_ideas
    expect(Array.isArray(result.finalState.raw_ideas)).toBe(true)
    expect((result.finalState.raw_ideas as unknown[]).length).toBe(15)

    // cluster: 3-5 thematic clusters
    expect(Array.isArray(result.finalState.clusters)).toBe(true)
    const clusters = result.finalState.clusters as unknown[]
    expect(clusters.length).toBeGreaterThanOrEqual(3)
    expect(clusters.length).toBeLessThanOrEqual(5)

    // critique: one per cluster
    expect(Array.isArray(result.finalState.critiques)).toBe(true)
    const critiques = result.finalState.critiques as unknown[]
    expect(critiques.length).toBe(clusters.length)

    // synthesize: top_3 picks + next_actions
    const picks = result.finalState.picks as {
      top_3: unknown[]
      reasoning: string
      next_actions: string[]
    }
    expect(picks).toBeDefined()
    expect(Array.isArray(picks.top_3)).toBe(true)
    expect(picks.top_3.length).toBe(3)
    expect(typeof picks.reasoning).toBe('string')
    expect(picks.reasoning.length).toBeGreaterThan(0)
    expect(Array.isArray(picks.next_actions)).toBe(true)
    expect(picks.next_actions.length).toBeGreaterThanOrEqual(3)
    expect(picks.next_actions.length).toBeLessThanOrEqual(5)
  })
})
