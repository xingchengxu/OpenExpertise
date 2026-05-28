---
title: Tier-1 support routing with auto-reply
description: Classify incoming tickets by urgency and topic, search your KB, auto-reply to FAQ-style tickets in the customer's tone, and route the rest to the right human queue.
---

# Tier-1 support routing with auto-reply

Customer support volume is dominated by FAQ-style tickets. In most teams, 40-60% of incoming tickets ask questions that are already answered in the knowledge base — but routing them still requires a human to read, recognize the pattern, copy-paste the answer, and close the ticket. At scale this is a staffing problem disguised as a workflow problem.

The current state of the art is keyword-based routing (fragile, misses paraphrase) or a monolithic LLM call that classifies and replies in one shot (no separation between "is this a duplicate?" and "write the reply"). OpenExpertise's `when:` edge lets you keep the classification and the reply separate, route duplicates differently from novel issues, and fall back to a human queue with full context when the LLM isn't confident.

## The shape

```
load_ticket (tool)
      ↓
classify (agent)              → classification { type, severity, area }
      ↓
search_kb (tool)              → similar_issues[]
      ↓
dedup (agent)                 → is_duplicate (boolean)
      ↓ when: is_duplicate == true
auto_reply (agent)            → reply_text
      ↓
post_reply (tool)             → reply_url

      ↓ when: is_duplicate == false  [direct edge from dedup]
assign_labels (agent)         → labels[]
      ↓
route_to_queue (tool)         → queue_name
```

The `when:` edges on `dedup`'s outgoing edges are the key: if the ticket is a duplicate, it goes to `auto_reply` and gets an LLM-written response in the customer's tone. If it's novel, it goes to `assign_labels` and then `route_to_queue` for a human. Both branches exist in the same graph.

## How OpenExpertise builds it

The experience maps directly to the `issue-triage` pattern: classify first, search second, dedup third, then branch on the result. The `when:` edge on the dedup → auto_reply path is `'$.is_duplicate == true'`; the `when:` edge on the dedup → assign_labels path is `'$.is_duplicate == false'`.

A critical detail: `assign_labels` does NOT depend on `dedup` — it depends on `classify`. This is intentional. If `dedup` is skipped (because `similar_issues` was empty and the `when:` on search → dedup didn't fire), a dependency on `dedup` would cascade a skip to `assign_labels`, silently dropping the label assignment. The direct edge `classify → assign_labels` keeps labeling robust regardless of dedup status. See the `NOTE` comment in the YAML.

The `auto_reply` agent reads both the ticket and the best-matching KB article (via `similar_issues[0]`) and writes the reply in the customer's actual tone — if the ticket is formal, the reply is formal; if it's casual, the reply matches.

```yaml
name: support-routing
description: 'Classify → KB search → auto-reply if duplicate, else route to human queue.'
version: 0.1.0

state:
  schema:
    ticket: { type: object }
    classification: { type: object }
    similar_issues: { type: array, items: { type: object } }
    is_duplicate: { type: boolean }
    duplicate_of: { type: string }
    reply_text: { type: string }
    reply_url: { type: string }
    labels: { type: array, items: { type: string }, merge: array_append }
    suggested_queue: { type: string }

graph:
  nodes:
    - id: load_ticket
      kind: tool
      phase: classify
      impl: ./tools/load_ticket.mjs
      writes: [ticket]
    - id: classify
      kind: agent
      phase: classify
      prompt: ./prompts/classify.md
      reads: [ticket]
      schema:
        type: object
        required: [classification]
        properties:
          classification:
            type: object
            required: [type, severity, area]
            properties:
              type: { type: string, enum: [bug, feature, question, billing, chore] }
              severity: { type: string, enum: [low, medium, high, urgent] }
              area: { type: string }
      writes: [classification]
    - id: search_kb
      kind: tool
      phase: dedup
      impl: ./tools/search_kb.mjs
      reads: [ticket]
      writes: [similar_issues]
    - id: dedup
      kind: agent
      phase: dedup
      prompt: ./prompts/dedup.md
      reads: [ticket, similar_issues]
      schema:
        type: object
        required: [is_duplicate]
        properties:
          is_duplicate: { type: boolean }
          duplicate_of: { type: string }
      writes: [is_duplicate, duplicate_of]
    - id: auto_reply
      kind: agent
      phase: route
      prompt: ./prompts/auto_reply.md
      reads: [ticket, similar_issues]
      schema:
        type: object
        required: [reply_text]
        properties:
          reply_text: { type: string }
      writes: [reply_text]
    - id: post_reply
      kind: tool
      phase: route
      impl: ./tools/post_reply.mjs
      reads: [reply_text]
      writes: [reply_url]
    - id: assign_labels
      kind: agent
      phase: route
      prompt: ./prompts/assign_labels.md
      reads: [ticket, classification]
      schema:
        type: object
        required: [labels]
        properties:
          labels: { type: array, items: { type: string } }
      writes: [labels]
    - id: route_to_queue
      kind: tool
      phase: route
      impl: ./tools/route_to_queue.mjs
      reads: [classification, labels]
      writes: [suggested_queue]
  edges:
    - { from: load_ticket, to: classify }
    - { from: classify, to: search_kb }
    - { from: search_kb, to: dedup, when: 'length($.similar_issues) > 0' }
    - { from: dedup, to: auto_reply, when: '$.is_duplicate == true' }
    - { from: auto_reply, to: post_reply }
    # NOTE: assign_labels intentionally depends on classify, NOT dedup.
    # dedup may be skipped (when similar_issues is empty), and depending on it
    # would cascade the skip to label assignment. Labels only need classification.
    - { from: classify, to: assign_labels }
    - { from: assign_labels, to: route_to_queue }
```

This is a direct adaptation of [`examples/issue-triage`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/issue-triage), extended with the `auto_reply` branch and a support-ticket framing.

## What you'd see after 5 real runs

For a duplicate ticket (the common case), wall time is roughly 8-12 seconds: classify fires, KB search returns 2-3 similar issues, dedup fires and returns `is_duplicate: true`, `auto_reply` generates a response in 3-5 seconds, `post_reply` POSTs it. `oe state reply_text` shows the generated response.

For a novel ticket, wall time is roughly 6-10 seconds: classify, KB search returns nothing, dedup is skipped, `assign_labels` and `route_to_queue` fire. `oe state suggested_queue` shows which human queue received it.

After 5 real runs, `oe evolve <run-id>` typically proposes: "Add a `confidence` field to the `dedup` agent's output (0.0-1.0). When `is_duplicate == true` but `confidence < 0.7`, route to a human review queue rather than auto-reply — reduces the risk of incorrect auto-replies on ambiguous duplicates."

## Why this is durable (and not just a one-off script)

- **Human-in-the-loop fallback is structural.** The `when:` edge on `dedup → auto_reply` means that if the dedup agent is not confident, a small change to the prompt (returning `is_duplicate: false` when uncertain) automatically routes to the human path. No code change needed.
- **Tone matching is versioned.** The `auto_reply.md` prompt lives in git. If you change the tone policy, the change is reviewed as a PR, appears in the changelog, and applies uniformly to all future auto-replies. No "which agent did we update last month?" problem.
- **Replay any past ticket.** `oe run . --args ticket_id=T-4421` re-runs the full classification + dedup + routing against the original ticket content. Useful for auditing why a ticket was auto-replied vs. routed.
- **Wire to Zendesk / Intercom / Salesforce.** The `load_ticket` and `post_reply` tools are the integration points. Swap the stub for your ticketing system's API. The rest of the graph — classification, KB search, dedup logic — is reusable across ticket sources.
- **KB search is data-driven.** Update `search_kb.mjs` to point at a different KB (e.g., Notion, Confluence, vector DB) without touching any agent node.

## Estimated time investment

|                                                | Time           | Note                            |
| ---------------------------------------------- | -------------- | ------------------------------- |
| First scaffold (adapt `issue-triage`)          | ~10 min        |                                 |
| Wire `load_ticket` to your ticketing system    | ~30 min        | Zendesk / Intercom / Salesforce |
| Wire `search_kb` to your KB                    | ~1 hour        | Vector DB or full-text search   |
| Tune the `classify.md` and `dedup.md` prompts  | ~45 min        |                                 |
| Tune the `auto_reply.md` tone policy           | ~30 min        | Iterate against real tickets    |
| First useful run on live tickets               | ~3 hours total |                                 |
| Production-ready (confidence gating, CI tests) | ~1 day         |                                 |

## See also

- [examples/issue-triage](/examples/issue-triage) — the canonical reference implementation this adapts
- [Branch by feature flag](/cookbook/branch-by-feature-flag) — the `when:` edge pattern
- [Edges and control flow](/concepts/control-flow) — how skip cascades work and how to avoid them
- [Structured output schemas](/cookbook/structured-output-schemas) — enforcing the classification schema
