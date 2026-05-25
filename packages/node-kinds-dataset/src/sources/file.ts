import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute, extname } from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'

export type FileFormat = 'json' | 'jsonl' | 'csv' | 'parquet'

export interface FileSourceOpts {
  uri: string
  format?: FileFormat
  experienceDir: string
}

export function loadFileSource(opts: FileSourceOpts): unknown[] {
  const abs = isAbsolute(opts.uri) ? opts.uri : resolve(opts.experienceDir, opts.uri)
  if (!existsSync(abs)) {
    throw new Error(`Dataset file not found: ${abs} (declared as "${opts.uri}")`)
  }
  const format = opts.format ?? inferFormat(abs)
  const source = readFileSync(abs, 'utf8')
  switch (format) {
    case 'json': {
      const parsed = JSON.parse(source)
      if (!Array.isArray(parsed)) {
        throw new Error(`File "${opts.uri}" must contain a top-level JSON array; got ${typeof parsed}`)
      }
      return parsed
    }
    case 'jsonl':
      return source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    case 'csv':
      return parseCsv(source, { columns: true, skip_empty_lines: true }) as unknown[]
    case 'parquet':
      throw new Error(`parquet file format is not implemented in V1`)
    default: {
      const _exhaustive: never = format
      throw new Error(`Unsupported file format "${_exhaustive}" for ${opts.uri}`)
    }
  }
}

function inferFormat(absPath: string): FileFormat {
  const ext = extname(absPath).toLowerCase()
  if (ext === '.json') return 'json'
  if (ext === '.jsonl' || ext === '.ndjson') return 'jsonl'
  if (ext === '.csv') return 'csv'
  throw new Error(`Cannot infer file format from extension "${ext}"; specify source.format explicitly`)
}
