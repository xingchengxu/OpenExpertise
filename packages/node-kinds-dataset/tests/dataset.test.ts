import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { DatasetDispatcher } from '../src/index.js'
import { RunContext, StateStore, EventBus, DispatcherRegistry } from '@openexpertise/core'
import type { DatasetNodeSpec, ExperienceSpec } from '@openexpertise/schema'

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { rows: { type: 'array', items: { type: 'object' } } } },
  graph: { nodes: [], edges: [] },
}

let dir: string
let ctx: RunContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-dataset-'))
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

describe('DatasetDispatcher — file source', () => {
  it('loads a JSON file as an array of rows', async () => {
    writeFileSync(join(dir, 'data.json'), JSON.stringify([{ id: 1 }, { id: 2 }]))
    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd',
      kind: 'dataset',
      source: { type: 'file', uri: './data.json', format: 'json' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ id: 1 }, { id: 2 }] })
  })

  it('loads a JSONL file as an array of rows', async () => {
    writeFileSync(join(dir, 'data.jsonl'), '{"id":1}\n{"id":2}\n')
    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd',
      kind: 'dataset',
      source: { type: 'file', uri: './data.jsonl', format: 'jsonl' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ id: 1 }, { id: 2 }] })
  })

  it('loads a CSV file as an array of rows', async () => {
    writeFileSync(join(dir, 'data.csv'), 'id,name\n1,a\n2,b\n')
    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd',
      kind: 'dataset',
      source: { type: 'file', uri: './data.csv', format: 'csv' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({
      rows: [
        { id: '1', name: 'a' },
        { id: '2', name: 'b' },
      ],
    })
  })

  it('infers format from extension if not specified', async () => {
    writeFileSync(join(dir, 'auto.jsonl'), '{"x":1}\n')
    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd',
      kind: 'dataset',
      source: { type: 'file', uri: './auto.jsonl' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ x: 1 }] })
  })
})

describe('DatasetDispatcher — sqlite source', () => {
  it('runs a SQL query and returns rows', async () => {
    const dbPath = join(dir, 'incidents.sqlite')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE incidents (id INTEGER, kind TEXT)')
    db.prepare('INSERT INTO incidents VALUES (?, ?)').run(1, 'crash')
    db.prepare('INSERT INTO incidents VALUES (?, ?)').run(2, 'leak')
    db.close()

    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd',
      kind: 'dataset',
      source: {
        type: 'sqlite',
        uri: './incidents.sqlite',
        query: 'SELECT * FROM incidents ORDER BY id',
      },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({
      rows: [
        { id: 1, kind: 'crash' },
        { id: 2, kind: 'leak' },
      ],
    })
  })
})

describe('DatasetDispatcher — http source', () => {
  it('GETs a URL and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ a: 1 }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd',
      kind: 'dataset',
      source: { type: 'http', url: 'https://example.test/data', method: 'GET' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ a: 1 }] })

    vi.unstubAllGlobals()
  })
})
