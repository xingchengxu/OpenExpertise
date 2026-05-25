import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { validateExperienceSpec } from '@openexpertise/schema'
import type { ExperienceSpec } from '@openexpertise/schema'
import { StateStore } from './state/store.js'
import { EventBus } from './events/bus.js'
import { JsonlEventSink } from './events/sink.js'
import { buildDag } from './graph/dag.js'
import { SequentialScheduler } from './graph/scheduler.js'
import { RunContext } from './run/context.js'
import { DispatcherRegistry } from './dispatcher/registry.js'

export interface RunOpts {
  spec: ExperienceSpec
  experienceDir: string
  dispatchers: DispatcherRegistry
  events?: EventBus
  args?: Record<string, unknown>
  dbPath?: string
  runId?: string
  eventLogPath?: string
}

export interface RunResult {
  runId: string
  status: 'success' | 'failed' | 'partial'
  finalState: Record<string, unknown>
}

export async function runExperience(opts: RunOpts): Promise<RunResult> {
  validateExperienceSpec(opts.spec)

  const runId = opts.runId ?? randomUUID()
  const events = opts.events ?? new EventBus()

  const runDir = join(opts.experienceDir, '.openexpertise')
  mkdirSync(runDir, { recursive: true })
  const dbPath = opts.dbPath ?? join(runDir, 'state.sqlite')
  const eventLogPath = opts.eventLogPath ?? join(runDir, 'runs', `${runId}.jsonl`)

  const sink = new JsonlEventSink(eventLogPath)
  const unsub = events.subscribe((e) => sink.write(e))

  const store = new StateStore({ dbPath, spec: opts.spec })

  try {
    events.emit({
      type: 'run.started',
      run_id: runId,
      ts: new Date().toISOString(),
      args: opts.args ?? {},
    })

    const dag = buildDag(opts.spec)
    const ctx = new RunContext({
      runId,
      spec: opts.spec,
      experienceDir: opts.experienceDir,
      store,
      events,
      dispatchers: opts.dispatchers,
      args: opts.args ?? {},
    })
    const scheduler = new SequentialScheduler(dag, ctx)
    const { status } = await scheduler.run()

    events.emit({ type: 'run.finished', run_id: runId, ts: new Date().toISOString(), status })

    const finalState = store.snapshot()
    return { runId, status, finalState }
  } finally {
    unsub()
    sink.close()
    store.close()
  }
}
