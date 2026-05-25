import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry, EventBus, runExperience, StateStore,
  type LLMClient, type LLMCompleteOpts,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { EvolutionAdvisor } from '@openexpertise/evolution'

class CannedLLM implements LLMClient {
  async complete(_opts: LLMCompleteOpts) {
    return {
      text: '',
      tool_calls: [{
        name: 'structured_output',
        input: {
          proposals: [
            {
              operation: 'tune-param',
              confidence: 'high',
              title: 'Tighten threshold',
              rationale: 'Saw underflow.',
              diff: '- threshold: 0.5\n+ threshold: 0.6\n',
            },
          ],
        },
      }],
    }
  }
}

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('Evolution end-to-end', () => {
  it('runs an experience, then generates an evolution markdown file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-evo-'))
    mkdirSync(join(dir, 'tools'), { recursive: true })
    writeFileSync(join(dir, 'tools/inc.mjs'),
      `export default async () => ({ state_delta: { count: 1 } })\n`)
    writeFileSync(join(dir, 'experience.yaml'), [
      'name: e',
      'version: 0.1.0',
      'state:',
      '  schema:',
      '    count: { type: number }',
      'graph:',
      '  nodes:',
      '    - id: inc',
      '      kind: tool',
      '      impl: ./tools/inc.mjs',
      '      writes: [count]',
      '  edges: []',
    ].join('\n'))
    const yamlSource = readFileSync(join(dir, 'experience.yaml'), 'utf8')
    const spec = parseExperienceYaml(yamlSource)

    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())

    const r = await runExperience({
      spec, experienceDir: dir, dispatchers, events: new EventBus(), args: {},
    })
    expect(r.status).toBe('success')

    const logPath = join(dir, '.openexpertise', 'runs', `${r.runId}.jsonl`)
    expect(existsSync(logPath)).toBe(true)
    const events = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))

    const store = new StateStore({
      dbPath: join(dir, '.openexpertise', 'state.sqlite'),
      spec,
    })
    const stateDiff: { field: string; before: unknown; after: unknown }[] = []
    for (const f of Object.keys(spec.state.schema)) {
      const h = store.history(f).filter((row) => row.run_id === r.runId)
      if (h.length > 0) {
        stateDiff.push({ field: f, before: h[0]?.value_old, after: h[h.length - 1]?.value_new })
      }
    }
    store.close()

    const advisor = new EvolutionAdvisor({ client: new CannedLLM() })
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: yamlSource,
      runEvents: events,
      stateDiff,
    })
    expect(proposals).toHaveLength(1)
    const md = advisor.renderMarkdown(proposals, r.runId)
    expect(md).toContain('Tighten threshold')
    expect(md).toContain('tune-param')
  })
})
