import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExperienceDispatcher } from '../src/index.js'
import {
  RunContext,
  StateStore,
  EventBus,
  DispatcherRegistry,
  runExperience,
} from '@openexpertise/core'
import type { ExperienceNodeSpec, ExperienceSpec } from '@openexpertise/schema'

const outerSpec: ExperienceSpec = {
  name: 'outer',
  version: '0.1.0',
  state: { schema: { result: { type: 'object' } } },
  graph: { nodes: [], edges: [] },
}

let dir: string
let outerCtx: RunContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-experience-'))
  mkdirSync(join(dir, 'child/tools'), { recursive: true })
  writeFileSync(
    join(dir, 'child/tools/echo.mjs'),
    `export default async () => ({ state_delta: { child_value: 'hello-from-child' } })\n`,
  )
  writeFileSync(
    join(dir, 'child/experience.yaml'),
    [
      'name: child',
      'version: 0.1.0',
      'state:',
      '  schema:',
      '    child_value:',
      '      type: string',
      'graph:',
      '  nodes:',
      '    - id: echo',
      '      kind: tool',
      '      impl: ./tools/echo.mjs',
      '      writes: [child_value]',
      '  edges: []',
    ].join('\n'),
  )

  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec: outerSpec })
  const dispatchers = new DispatcherRegistry()
  // We register a tool dispatcher here for the child to use.
  // Tests bring their own; we'll wire one via the actual ToolDispatcher.
  outerCtx = new RunContext({
    runId: 'r',
    spec: outerSpec,
    experienceDir: dir,
    store,
    events: new EventBus(),
    dispatchers,
    args: {},
  })
})

afterEach(() => {
  outerCtx.store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('ExperienceDispatcher', () => {
  it('runs a sub-experience with isolated state and returns its finalState as edge_output', async () => {
    // Use the actual ToolDispatcher for the child's tool node
    const { ToolDispatcher } = await import('@openexpertise/node-kinds-tool')
    outerCtx.dispatchers.register(new ToolDispatcher())

    const dispatcher = new ExperienceDispatcher({ runExperience })
    const node: ExperienceNodeSpec = {
      id: 'child',
      kind: 'experience',
      impl: './child/experience.yaml',
      state_scope: 'isolated',
    }
    const impl = await dispatcher.resolve(node, outerCtx)
    const output = await dispatcher.run(
      impl,
      { state_view: {}, edge_inputs: {}, args: {} },
      outerCtx,
    )

    expect(output.edge_output).toMatchObject({
      status: 'success',
      finalState: { child_value: 'hello-from-child' },
    })
    expect(output.state_delta).toEqual({})
  })

  it('rejects when impl file is missing', async () => {
    const dispatcher = new ExperienceDispatcher({ runExperience })
    const node: ExperienceNodeSpec = {
      id: 'child',
      kind: 'experience',
      impl: './missing/experience.yaml',
    }
    await expect(dispatcher.resolve(node, outerCtx)).rejects.toThrow(/missing/)
  })

  it('rejects state_scope=shared as not implemented in V1', async () => {
    const dispatcher = new ExperienceDispatcher({ runExperience })
    const node: ExperienceNodeSpec = {
      id: 'child',
      kind: 'experience',
      impl: './child/experience.yaml',
      state_scope: 'shared',
    }
    await expect(dispatcher.resolve(node, outerCtx)).rejects.toThrow(/shared/i)
  })
})
