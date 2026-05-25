import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventBus, type RunEvent } from '../src/events/bus.js'
import { JsonlEventSink } from '../src/events/sink.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('EventBus', () => {
  it('delivers events to all subscribers in order', () => {
    const bus = new EventBus()
    const received: RunEvent[] = []
    bus.subscribe((e) => received.push(e))
    bus.emit({ type: 'run.started', run_id: 'r1', ts: '2026-01-01T00:00:00Z' })
    bus.emit({ type: 'run.finished', run_id: 'r1', ts: '2026-01-01T00:00:01Z', status: 'success' })
    expect(received).toHaveLength(2)
    expect(received[0]?.type).toBe('run.started')
  })

  it('returns an unsubscribe handle', () => {
    const bus = new EventBus()
    const seen: RunEvent[] = []
    const unsub = bus.subscribe((e) => seen.push(e))
    bus.emit({ type: 'run.started', run_id: 'r', ts: 't' })
    unsub()
    bus.emit({ type: 'run.started', run_id: 'r', ts: 't' })
    expect(seen).toHaveLength(1)
  })
})

describe('JsonlEventSink', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-sink-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('writes one line per event', () => {
    const sink = new JsonlEventSink(join(dir, 'run.jsonl'))
    sink.write({ type: 'run.started', run_id: 'r', ts: 't' })
    sink.write({ type: 'node.started', run_id: 'r', node_id: 'x', ts: 't' })
    sink.close()
    const content = readFileSync(join(dir, 'run.jsonl'), 'utf8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!).type).toBe('run.started')
    expect(JSON.parse(lines[1]!).node_id).toBe('x')
  })
})
