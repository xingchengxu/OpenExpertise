export type RunEvent =
  | { type: 'run.started'; run_id: string; ts: string; args?: unknown }
  | { type: 'run.finished'; run_id: string; ts: string; status: 'success' | 'failed' | 'partial' }
  | { type: 'node.ready'; run_id: string; node_id: string; ts: string }
  | { type: 'node.started'; run_id: string; node_id: string; ts: string }
  | {
      type: 'node.finished'
      run_id: string
      node_id: string
      ts: string
      metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number }
    }
  | { type: 'node.failed'; run_id: string; node_id: string; ts: string; error: string }
  | { type: 'node.skipped'; run_id: string; node_id: string; ts: string; reason: string }
  | { type: 'state.write'; run_id: string; node_id: string; field: string; ts: string }

export type EventListener = (event: RunEvent) => void

export class EventBus {
  private listeners: Set<EventListener> = new Set()

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: RunEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        // Subscriber errors must not abort the run; log to stderr and continue.
        process.stderr.write(`event listener error: ${(err as Error).message}\n`)
      }
    }
  }
}
