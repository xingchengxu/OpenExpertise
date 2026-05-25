import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { RunEvent } from './bus.js'

export class JsonlEventSink {
  private readonly filePath: string

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.filePath = filePath
  }

  write(event: RunEvent): void {
    appendFileSync(this.filePath, JSON.stringify(event) + '\n')
  }

  close(): void {
    // No-op: synchronous writes are already flushed to disk.
  }
}
