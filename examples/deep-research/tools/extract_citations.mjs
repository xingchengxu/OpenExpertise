// Post-process raw_findings (an array of {claim, evidence, url}) into a
// deduplicated, ordered list of unique URLs. Called between the search
// phase and the cross-reference agent.

export default async function extractCitations(input) {
  const raw = input._state?.raw_findings ?? []
  const seen = new Set()
  const citations = []
  for (const f of raw) {
    const url = f?.url
    if (typeof url === 'string' && url.length > 0 && !seen.has(url)) {
      seen.add(url)
      citations.push(url)
    }
  }
  return { state_delta: { citations } }
}
