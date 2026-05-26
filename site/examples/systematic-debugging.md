---
title: systematic-debugging
description: The systematic-debugging discipline as a durable OE flow — observe, hypothesize, verify each hypothesis with Claude Code, localize, fix, verify the fix.
---

# systematic-debugging

_The `systematic-debugging` superpowers skill translated into an OpenExpertise flow: capture symptoms, generate hypotheses, verify each one with Claude Code (`for_each` fan-out), localize the root cause, apply the minimum fix, confirm the tests pass._

## What it demonstrates

- Six-phase pipeline: `observe → hypothesize → verify → localize → fix → verify_fix`
- `for_each` fan-out on a `cli-agent` node: one Claude Code invocation per hypothesis
- Mixed node kinds: `tool + agent + cli-agent` in one graph
- Bidirectional CLI loop: Claude Code reads code, makes edits, then a tool re-runs the tests
- Structured output with enum constraints (`supported | refuted | inconclusive`)
- Persistent, replayable debugging trail via SQLite state

## The graph

```
capture_symptoms → hypothesize → verify_hypothesis (cli-agent, for_each)
                                          │
                                          ▼
                                      localize → propose_fix (cli-agent) → verify_fix
```

Phases: `observe` → `hypothesize` → `verify` → `localize` → `fix` → `verify_fix`.

## State schema

| Field                 | Type            | Description                                             |
| --------------------- | --------------- | ------------------------------------------------------- |
| `repo_path`           | `string`        | Path to the repo being debugged                         |
| `failing_test_cmd`    | `string`        | Command that reproduces the failure                     |
| `symptoms`            | `object`        | Test output, error message, stack trace                 |
| `hypotheses`          | `array<object>` | `[{id, text, confidence, predicted_check}]`             |
| `check_results`       | `array<object>` | `[{hypothesis_id, evidence, verdict}]` (`array_append`) |
| `diagnosis`           | `object`        | `{root_cause, location, supported_hypothesis_id}`       |
| `fix_proposal`        | `string`        | Markdown summary of changes made by Claude Code         |
| `verification_status` | `string`        | `passed` or `failed`                                    |
| `verification_output` | `string`        | Full test output after the fix                          |

## How it runs

### Against the bundled fixture

The default `args` point at `fixtures/buggy_repo`, which has a known off-by-one in `validateUserId`:

```bash
export ANTHROPIC_API_KEY=sk-...   # for hypothesize + localize agents
# claude CLI must be on PATH and authenticated (for verify_hypothesis + propose_fix)
oe run examples/systematic-debugging --tui
```

Expected: `verification_status` → `passed`, wall time ~2–4 minutes.

### Against your own repo

Edit `capture_symptoms`'s `args` in `experience.yaml`:

```yaml
- id: capture_symptoms
  args:
    repo_path: '/path/to/your/repo'
    failing_test_cmd: 'pnpm test --filter @your/pkg'
```

`failing_test_cmd` runs with `cwd: repo_path`. Any test runner that exits non-zero on failure works (pytest, vitest, cargo test, go test).

::: warning Claude Code will edit your files
`propose_fix` calls Claude Code with write access to `repo_path`. Commit your work before running. The flow does not auto-commit.
:::

## What happens, step by step

1. **capture_symptoms** — runs `failing_test_cmd` in `repo_path`, captures stdout/stderr/exit code, writes them as `symptoms`.

2. **hypothesize** — the `hypothesize.md` agent reads `symptoms` and returns 2–4 ranked hypotheses, each with a `predicted_check` (what evidence would confirm or refute it). Example for the bundled fixture:

   ```json
   [
     {
       "id": "h1",
       "text": "validateUserId uses < instead of > for the upper bound",
       "confidence": "high",
       "predicted_check": "Read validateUserId in index.mjs"
     },
     {
       "id": "h2",
       "text": "ID validation is missing entirely",
       "confidence": "low",
       "predicted_check": "Grep for validateUserId"
     }
   ]
   ```

3. **verify_hypothesis** — fans out over `hypotheses`, one Claude Code call per hypothesis:

   ```
   Repo path: ./fixtures/buggy_repo
   Hypothesis (h1): validateUserId uses < instead of > for the upper bound
   Predicted check: Read validateUserId in index.mjs

   Read the relevant files, examine the failing output, and judge whether
   the hypothesis is supported. Return JSON: {"check_results": [...]}
   ```

   Claude reads the file, finds the comparison, and returns `"verdict": "supported"`. Results accumulate into `check_results` via `array_append`.

4. **localize** — the `localize.md` agent reads all check results and returns the single root cause with the exact file + line location.

5. **propose_fix** — Claude Code reads the file, makes the minimum edit (`id < MAX_USER_ID` → `id > MAX_USER_ID`), saves it, and returns a markdown summary.

6. **verify_fix** — `run_tests.mjs` re-runs `failing_test_cmd`. Writes `verification_status: "passed"` and the full test output.

```bash
$ oe state verification_status
passed

$ oe state diagnosis
{"root_cause": "Off-by-one: comparison should be > not <", "location": "fixtures/buggy_repo/index.mjs:12"}
```

## Why OE instead of running the skill directly in Claude Code

| Skill in Claude Code        | OE flow                                                    |
| --------------------------- | ---------------------------------------------------------- |
| No persistent state         | Every hypothesis + result in SQLite                        |
| Session ends = context lost | Resume tomorrow with `oe resume <run-id>`                  |
| No replay                   | Full event log: `oe inspect <run-id>`                      |
| No learning loop            | `oe evolve` proposes smarter `hypothesize.md` after N runs |
| Manual discipline           | Enforced by the graph structure                            |

## Mapping to the superpowers skill

| Superpowers phase       | OE node                                   |
| ----------------------- | ----------------------------------------- |
| Observe                 | `capture_symptoms`                        |
| Hypothesize             | `hypothesize` (agent)                     |
| Verify each hypothesis  | `verify_hypothesis` (cli-agent, for_each) |
| Localize root cause     | `localize` (agent)                        |
| Propose minimum fix     | `propose_fix` (cli-agent)                 |
| Verify fix passes tests | `verify_fix` (tool)                       |

Same discipline. Durable, replayable, and evolvable.

## Try it: variations

**1. Add a `git_blame` node.**
Insert a `git_blame` tool node between `capture_symptoms` and `hypothesize` that surfaces the most recent commit touching the failing line. Pass it as context to `hypothesize.md`. Most bugs are recently introduced — this biases hypothesis generation toward recent changes.

**2. Add a `regression_test_writer`.**
After `propose_fix` but before `verify_fix`, add a `regression_test_writer` `cli-agent` node that asks Claude to write a new test that would have caught this bug. The test is written to the repo; `verify_fix` then runs it too.

**3. Classify the failure type first.**
Add a `classify_failure` agent before `hypothesize` that classifies the failure as one of: `compile_error | assertion_failure | runtime_exception | timeout`. Pass the classification to `hypothesize.md` to steer hypothesis generation.

## Source

[examples/systematic-debugging/](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/systematic-debugging)
