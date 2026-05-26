# Code-as-Law

"Code-as-Law" is OpenExpertise's central architectural thesis. It comes down to a single rule:

> **The graph is declared in YAML and validated by a schema. The LLM cannot rewrite the graph at runtime; it can only fill the gaps the graph asks for.**

This is the difference between an **AI workflow framework** and an **AI agent framework**. The former gives you reproducibility, observability, and the ability to evolve your SOPs deliberately. The latter is wonderful for one-off exploration and useless for production.

## The agentic alternative (and why it doesn't scale)

A typical "agent" framework looks like this:

```
You: "Review this pull request for security issues."
Agent: <picks tools to invoke, in some order, until it's satisfied>
       <writes some output that you have to parse>
```

This works for a single demo. It does not work as the basis of an SOP, for four reasons:

1. **The trajectory is improvised.** The agent might run `grep`, then call an LLM, then run `git diff`, then forget halfway and try again. Two runs of the same task produce different action sequences. Auditing one run tells you nothing about the next.
2. **The contract is implicit.** The output format depends on the LLM's mood. "Sometimes JSON, sometimes prose, sometimes a half-formed JSON with markdown fences" is the lived experience of anyone who's tried to chain agent outputs.
3. **Errors are diffuse.** When a step goes wrong, there's no atomic location where it failed. The whole trajectory has to be replayed mentally.
4. **You can't evolve it.** "Improve the review process for next month" is not a thing you can do to an improvised flow.

## The OpenExpertise alternative

```
You: <define a graph in YAML: 3 reviewers fan out, 1 verifier, 1 scorer>
Runtime: <executes the graph the same way every time>
LLM: <called only at agent nodes; outputs are AJV-validated structured tool calls>
State: <every write goes to SQLite; history is queryable>
Events: <every transition goes to a JSONL log; replayable>
Evolution advisor: <after a run, reads the log + state diff and proposes graph upgrades you decide whether to apply>
```

The skeleton is **hard-coded**. The LLM only fills the **leaves**. This is what Anthropic's `/workflows` describes as "the JavaScript controls the flow; the model is the law's executor, not the legislator". OpenExpertise applies the same principle, with a stricter schema and a more declarative shape.

## The trade-offs (named, so we don't pretend they don't exist)

This rigidity has costs.

| What you gain                                                                                                   | What you give up                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Reproducibility.** Same DAG every run; replayable trace.                                                      | **Spontaneity.** The LLM can't decide to skip a step or invent a new one based on what it's seeing.                |
| **Observability.** Per-node tokens, per-node activity, per-field write history.                                 | **Surprise wins.** The agent won't go off-script to fix a side issue it noticed.                                   |
| **Evolution.** You change the graph deliberately, with the advisor's help, and you keep the old version in git. | **Speed of iteration.** Modifying the graph requires a `git apply` step (or a manual YAML edit).                   |
| **Safety.** The graph can't write outside its declared `state.schema` fields.                                   | **Generality.** OpenExpertise is for codified SOPs — not for exploratory tasks where you don't know the shape yet. |

If you want exploratory or open-ended work, **use Claude Code, Codex, or Gemini directly.** OpenExpertise sits one layer above them. It is the conductor; they are the workers.

## What "filling the gaps" actually means

An `agent` node's contract:

```yaml
- id: classify_issue
  kind: agent
  prompt: ./prompts/classify.md
  reads: [issue] # the LLM sees these state fields
  schema: # the LLM MUST return data matching this shape
    type: object
    required: [type, severity]
    properties:
      type: { type: string, enum: [bug, feature, question] }
      severity: { type: string, enum: [low, medium, high] }
  writes: [classification] # the result goes to this state field
```

The LLM is called with the prompt + the `issue` state field. It must respond by invoking a `structured_output` tool whose arguments match the inline schema. AJV validates. The result is written to the `classification` state field. **That's the entire contract.**

The LLM can produce literally any classification object that satisfies the schema. It cannot:

- Decide to skip this node.
- Decide to call a different node first.
- Decide to write to a different state field.
- Decide to invent a new state field.
- Return free text or markdown or anything else.

If the LLM returns invalid JSON, or omits a required field, or uses an enum value not in the allow-list, the node **fails** (and the `on_error` policy applies — retry, skip, or fail the whole run).

That strictness is the feature. The runtime is auditable and explainable in a way that an open-ended agent never is.

## The escape hatches you do have

Code-as-Law is strict but not totalitarian. Where you need flexibility:

- **`when:` conditional edges.** An edge can carry an expression like `when: 'length($.findings) > 0'`. The target node is skipped if the expression evaluates false.
- **`for_each` fan-out.** A single node spec runs once per item in a state-derived list, with bounded concurrency.
- **`on_error: retry`.** Nodes can retry on failure with exponential backoff.
- **`cli-agent`.** A node can delegate the actual judgment to a Claude Code / Codex / Gemini subprocess, which **does** have free agency inside its own session — but the parent graph still treats that as one atomic node that produces an output.

The graph stays the same. The LLM does its thing inside each node.

## Code-as-Law and the evolution loop

Strict graphs would be a problem if you couldn't iterate on them. The evolution advisor solves this:

```
Run 1 (3 reviewers)                          Run 2 (4 reviewers)
─────────────────                            ─────────────────
findings: [bug, perf, test]                  findings: [bug, perf, test, SQL injection]
risk_score: 0.30                             risk_score: 0.85
                  │
                  ▼
         oe evolve <run-id>
                  │
                  ▼
    Advisor: "Add `security` dimension. The default reviewers
              focus on logic + tests; injection-class bugs need
              a dedicated security reviewer."
              <one-line YAML patch attached>
                  │
                  ▼
            you decide whether to git apply
```

You don't trade the rigidity of Code-as-Law for the unpredictability of an agent. You trade single-run improvisation for **deliberate, traceable, version-controlled evolution.** Every change to your SOP is a commit.

→ Continue with [The 6 node kinds](/concepts/node-kinds), or skip to [The evolution loop](/concepts/evolution-loop) for the iteration side of the story.
