import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ToolDispatcher } from '../src/index.js'
import { RunContext } from '@openexpertise/core'
import { StateStore, EventBus, DispatcherRegistry } from '@openexpertise/core'
import type { ToolNodeSpec, ExperienceSpec } from '@openexpertise/schema'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let ctx: RunContext

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { out: { type: 'string' } } },
  graph: { nodes: [{ id: 'x', kind: 'tool', impl: './t.mjs', writes: ['out'] }], edges: [] },
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-tool-'))
  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
  ctx = new RunContext({
    runId: 'r',
    spec,
    experienceDir: dir,
    store,
    events: new EventBus(),
    dispatchers: new DispatcherRegistry(),
    args: {},
  })
})

afterEach(() => {
  ctx.store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('ToolDispatcher', () => {
  it('loads a tool module and invokes its default export', async () => {
    const modulePath = join(dir, 'greet.mjs')
    writeFileSync(
      modulePath,
      `export default async (args) => ({ state_delta: { out: 'hello ' + args.name } })\n`,
    )

    const node: ToolNodeSpec = {
      id: 'x',
      kind: 'tool',
      impl: './greet.mjs',
      writes: ['out'],
      args: { name: 'world' },
    }
    const dispatcher = new ToolDispatcher()
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(
      impl,
      { state_view: {}, edge_inputs: {}, args: { name: 'world' } },
      ctx,
    )

    expect(output.state_delta).toEqual({ out: 'hello world' })
  })

  it('throws a clear error when impl file is missing', async () => {
    const node: ToolNodeSpec = { id: 'x', kind: 'tool', impl: './does-not-exist.mjs' }
    const dispatcher = new ToolDispatcher()
    await expect(dispatcher.resolve(node, ctx)).rejects.toThrow(/does-not-exist/)
  })

  it('throws when module has no default export', async () => {
    const modulePath = join(dir, 'no-default.mjs')
    writeFileSync(modulePath, `export const named = () => {}\n`)
    const node: ToolNodeSpec = { id: 'x', kind: 'tool', impl: './no-default.mjs' }
    const dispatcher = new ToolDispatcher()
    const impl = await dispatcher.resolve(node, ctx)
    await expect(
      dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx),
    ).rejects.toThrow(/default export/)
  })
})
