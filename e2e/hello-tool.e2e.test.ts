import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience, StateStore } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { copyExampleToSandbox, type Sandbox } from './helpers.js'

let sandbox: Sandbox
afterEach(() => sandbox?.cleanup())

describe('hello-tool E2E', () => {
  it('runs to completion and writes greeting to state', async () => {
    sandbox = copyExampleToSandbox('hello-tool')
    const yamlPath = join(sandbox.dir, 'experience.yaml')
    const spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))

    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())

    const result = await runExperience({
      spec,
      experienceDir: sandbox.dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    expect(result.finalState.greeting).toBe('hello, World')

    // Run log was written
    const runLog = join(sandbox.dir, '.openexpertise', 'runs', `${result.runId}.jsonl`)
    expect(existsSync(runLog)).toBe(true)
    const events = readFileSync(runLog, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(events.find((e) => e.type === 'run.started')).toBeDefined()
    expect(events.find((e) => e.type === 'state.write' && e.field === 'greeting')).toBeDefined()
    expect(events.find((e) => e.type === 'run.finished' && e.status === 'success')).toBeDefined()

    // SQLite persists the state
    const store = new StateStore({
      dbPath: join(sandbox.dir, '.openexpertise', 'state.sqlite'),
      spec,
    })
    expect(store.get('greeting')).toBe('hello, World')
    store.close()
  })
})
