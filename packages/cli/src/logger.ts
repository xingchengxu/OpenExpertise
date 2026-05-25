import pino from 'pino'

export function makeLogger(opts: { pretty?: boolean; level?: string } = {}) {
  if (opts.pretty) {
    return pino({
      level: opts.level ?? 'info',
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    })
  }
  return pino({ level: opts.level ?? 'info' })
}
