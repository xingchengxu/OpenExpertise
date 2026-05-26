import type { ExperienceSpec } from '@openexpertise/schema'
import type { StateStore } from '../state/store.js'
import type { EventBus } from '../events/bus.js'
import type { DispatcherRegistry } from '../dispatcher/registry.js'
import type { CacheStore } from '../cache/store.js'

export interface RunContextOpts {
  runId: string
  spec: ExperienceSpec
  experienceDir: string
  store: StateStore
  events: EventBus
  dispatchers: DispatcherRegistry
  args: Record<string, unknown>
  cache?: CacheStore
}

export class RunContext {
  readonly runId: string
  readonly spec: ExperienceSpec
  readonly experienceDir: string
  readonly store: StateStore
  readonly events: EventBus
  readonly dispatchers: DispatcherRegistry
  readonly args: Record<string, unknown>
  readonly cache?: CacheStore

  constructor(opts: RunContextOpts) {
    this.runId = opts.runId
    this.spec = opts.spec
    this.experienceDir = opts.experienceDir
    this.store = opts.store
    this.events = opts.events
    this.dispatchers = opts.dispatchers
    this.args = opts.args
    if (opts.cache) this.cache = opts.cache
  }

  now(): string {
    return new Date().toISOString()
  }
}
