export interface HttpSourceOpts {
  url: string
  method?: 'GET' | 'POST'
  body?: unknown
}

export async function loadHttpSource(opts: HttpSourceOpts): Promise<unknown[]> {
  const method = opts.method ?? 'GET'
  const init: RequestInit = { method }
  if (method === 'POST' && opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
    init.headers = { 'content-type': 'application/json' }
  }
  const response = await fetch(opts.url, init)
  if (!response.ok) {
    throw new Error(`Dataset http source ${opts.url} returned ${response.status} ${response.statusText}`)
  }
  const parsed = await response.json()
  if (!Array.isArray(parsed)) {
    throw new Error(`Dataset http source ${opts.url} must return a top-level JSON array`)
  }
  return parsed
}
