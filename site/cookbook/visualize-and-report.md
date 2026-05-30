---
title: Visualize a graph & share a run report
description: Render an experience's DAG as Mermaid with oe graph, and emit a self-contained HTML run report with oe inspect --html.
---

# Visualize a graph & share a run report

## Problem

You want to _see_ the experience you authored before running it — and after a run, you want to hand a teammate (or pin to a PR) a single artifact that shows what actually happened: which nodes ran, which failed, how long each took, and how many tokens it cost. Reading raw JSONL is not it.

## Solution

Two commands, both pure transforms — no API key, nothing to deploy.

```bash
# 1. Render the static DAG as a Mermaid flowchart on stdout.
#    Paste it straight into a GitHub README, issue, or PR — Mermaid renders natively.
oe graph examples/review-branch

# Left-to-right layout, written to a file:
oe graph examples/review-branch --lr -o review-branch.mmd

# Or a self-contained HTML page (open in any browser, no server):
oe graph examples/review-branch --html -o review-branch.html
```

```bash
# 2. After a run, turn the event log into a shareable HTML run report.
#    The same DAG, but each node is coloured by its status (success / failed / skipped),
#    plus an events timeline and per-node duration & token counts.
oe run examples/review-branch --input pr_url=https://github.com/org/repo/pull/42
# → run-id: run_abc123

oe inspect run_abc123 --experience examples/review-branch --html -o run_abc123.html
```

## Walkthrough

`oe graph` loads `experience.yaml`, validates it, and renders the node graph as a [Mermaid](https://mermaid.js.org/) `flowchart`. Nodes are grouped into **phase subgraphs**, each node kind gets its own shape and colour (`tool`, `agent`, `skill`, `dataset`, `experience`, `cli-agent`), and edges produced by `for_each` fan-out and conditional `when:` dependencies are labelled. It never calls an LLM. Default output is stdout (top-down); `--lr` flips it left-to-right, `-o <file>` writes to disk, and `--html` wraps it in a standalone page.

`oe inspect <run-id> --html` reads the run's `.openexpertise/runs/<run-id>.jsonl` event log and produces the same DAG — but now each node is **coloured by its run status**, alongside an events timeline and a per-node table of duration and token usage. Because it is a single self-contained HTML file, you can attach it to a PR, drop it in a ticket, or archive it next to the run directory. Use `--experience <path>` so the command can locate the run directory when you are not in the experience folder, and `--lr` for a wide graph.

The two views compose: `oe graph` is the _design-time_ picture (what the experience can do), and `oe inspect --html` is the _run-time_ picture (what one execution actually did).

## Variations

- **Pin a report to a PR.** In CI, run the experience, then `oe inspect <run-id> --html -o report.html` and upload `report.html` as a build artifact (or commit it to a `gh-pages`-style branch) so reviewers can open the run report directly from the pull request.
- **Keep diagrams in your README current.** Commit the `oe graph ... -o experience.mmd` output (or a fenced Mermaid block) next to the experience; regenerate it whenever the graph changes so the picture never drifts from the YAML.
- **Plain stdout for chat.** Omit `--html` / `-o` and paste the Mermaid block into a GitHub comment or any Mermaid-aware tool.

## See also

- [Reference: oe graph](/reference/cli/graph)
- [Reference: oe inspect](/reference/cli/inspect)
- [Examples gallery](/examples/) — every example page embeds its own `oe graph` DAG
