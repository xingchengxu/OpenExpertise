import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// Stub vector search — reads a fixed list of "historical" issues and returns
// any whose title shares ≥2 words with the incoming issue's title. Replace with
// a real vector search against an embedding store for production use.
//
// ToolDispatcher passes a single argument: `{ ...bundle.args, _edge_inputs, _state }`.
// `_state` exposes everything the node's `reads:` list declared.
export default async function searchSimilar(input) {
  const issue = input._state?.issue
  if (!issue) return { state_delta: { similar_issues: [] } }
  const path = resolve(HERE, '..', 'fixtures', 'historical_issues.json')
  const history = JSON.parse(readFileSync(path, 'utf8'))
  const titleWords = String(issue.title ?? '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
  const similar = history.filter((h) => {
    const hw = String(h.title ?? '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
    const overlap = titleWords.filter((w) => hw.includes(w)).length
    return overlap >= 2
  })
  return { state_delta: { similar_issues: similar } }
}
