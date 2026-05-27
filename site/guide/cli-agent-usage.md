# cli-agent node — call CLIs from OE

Delegate a graph step to a Claude Code, Codex, or Gemini subprocess — get full CLI tool access inside an OpenExpertise graph.

## When you need this

- A step needs file editing, code search, or bash execution — capabilities the `agent` kind (SDK-only) doesn't have.
- You want to chain Claude Code, Codex, and Gemini in a single DAG (see `examples/tri-cli-orchestration`).
- You want to use installed Claude Code skills, Codex plugins, or Gemini extensions from inside an experience.
- No API key juggling — the CLI uses whatever auth the user already set up.

## The minimal example

`examples/tri-cli-orchestration/experience.yaml` — Claude Code → Codex → Gemini in one graph:

```yaml
name: tri-cli-orchestration
version: 0.1.0

state:
  schema:
    topic: { type: string }
    summary: { type: string }
    critique: { type: string }
    verdict: { type: string }

graph:
  nodes:
    - id: summarize
      kind: cli-agent
      provider: claude-code
      prompt: |
        Write a single-sentence summary of the topic.
        No preamble, no markdown.
        Topic: {{topic}}
      args:
        topic: 'In-memory caching strategies for HTTP APIs'
      writes: [summary]
      timeout_ms: 180000

    - id: critique
      kind: cli-agent
      provider: codex
      prompt: |
        In one sentence, point out the single biggest thing this summary misses.
        Summary: {{summary}}
      reads: [summary]
      writes: [critique]
      timeout_ms: 180000

    - id: verdict
      kind: cli-agent
      provider: gemini
      prompt: |
        Given the summary and the critique, deliver a one-sentence verdict.
        Summary: {{summary}}
        Critique: {{critique}}
      reads: [summary, critique]
      writes: [verdict]
      timeout_ms: 180000

  edges:
    - { from: summarize, to: critique }
    - { from: critique, to: verdict }
```

## How it works

Each `cli-agent` node spawns a subprocess. The provider determines the command shape:

| Provider      | Command                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `claude-code` | `claude -p "<prompt>" --output-format <text\|json> [--model X] [extra_args]` |
| `codex`       | `codex exec --skip-git-repo-check [--model X] [extra_args] "<prompt>"`       |
| `gemini`      | `gemini --yolo --skip-trust --prompt "<prompt>" [--model X] [extra_args]`    |

The dispatcher waits for the subprocess to exit, captures stdout, and applies output handling:

- **text mode (default):** stdout is written to the first field in `writes:`. Only one write field is allowed in text mode.
- **json mode (`output_format: json`):** stdout is `JSON.parse`'d. If `schema:` is set, the result is AJV-validated. Failures throw and trigger `on_error`.

**Prompt interpolation** uses the same `{{placeholder}}` mechanism as `agent` nodes — `reads:` fields, `args:`, `for_each` injections (`$item`, `$index`). Inline prompts only; file-path loading is a V2 feature.

**Three bugs fixed in V1** (from the source comments):

1. **`<think>` strip** — handled in the OpenAI client's `parseArguments`; the `cli-agent` dispatcher does not need to strip `<think>` blocks because the CLI's stdout is plain text, not a tool-call argument string.
2. **JSON envelope** — `claude --output-format json` wraps the response in a JSON envelope. The `claude-code` provider passes this flag, and the dispatcher unwraps the envelope before writing to state.
3. **`--skip-trust`** — Gemini 0.43 exits with code 55 in any non-whitelisted directory and silently downgrades `--yolo` when the trust gate is not satisfied. The Gemini provider passes `--skip-trust` unconditionally; users can override via `extra_args`.

## Variations

**JSON output with schema validation:**

```yaml
- id: classify
  kind: cli-agent
  provider: claude-code
  prompt: |
    Classify this issue. Reply with JSON: {"label": "<bug|feature|docs>", "confidence": 0..1}
    Issue: {{issue_body}}
  reads: [issue_body]
  writes: [classification]
  output_format: json
  schema:
    type: object
    required: [label, confidence]
    properties:
      label: { type: string, enum: [bug, feature, docs] }
      confidence: { type: number, minimum: 0, maximum: 1 }
```

::: warning JSON mode by provider
`output_format: json` passes `--output-format json` to `claude-code` (which emits a JSON envelope). For `codex` and `gemini`, no equivalent flag exists — the CLI is not told to emit JSON. You must instruct the agent in the prompt itself and accept that `JSON.parse` will throw if it replies in prose.
:::

**Restrict tool access for Claude Code:**

```yaml
extra_args: ['--allowed-tools', 'Read,Grep,Bash']
```

**Run in a specific working directory:**

```yaml
- id: audit_code
  kind: cli-agent
  provider: claude-code
  prompt: |
    Search for hardcoded secrets in this repository.
  workdir: ./checkout
  writes: [audit_findings]
```

**Fan out with `for_each`:**

```yaml
- id: review_file
  kind: cli-agent
  provider: claude-code
  prompt: |
    Review this file for issues: {{$item.path}}
  for_each:
    source: $.files_to_review
  reads: [files_to_review]
  writes: [file_reviews]
```

**Retry on timeout:**

```yaml
on_error:
  policy: retry
  attempts: 3
  backoff: exponential
  base_ms: 2000
```

## Gotchas

- **`reads:` is required for `{{placeholder}}` variables sourced from state.** `args:` inline vars do not need `reads:`; state-backed vars do. See [Prompt files](/guide/prompt-files).
- **`writes:` must have exactly one entry in text mode.** Zero entries silently drops the output. Two or more entries throws: ambiguous mapping.
- **Subprocess timeout defaults to 10 minutes (`600_000 ms`).** LLM CLI calls vary in speed; set `timeout_ms` conservatively on long tasks.
- **CLI versions are not pinned.** If a provider release changes its flags (e.g., Gemini's `--skip-trust` was added in 0.43), the provider file needs updating. Check the source in `packages/node-kinds-cli-agent/src/providers/` against your installed CLI version.

## See also

- [cli-agent concept](/concepts/node-cli-agent)
- [Prompt files](/guide/prompt-files) — `{{placeholder}}` interpolation details
- [MCP server](/guide/mcp-server) — the inverse: calling OE from inside Claude Code
- [cli-orchestration example](/examples/cli-orchestration)
- [tri-cli-orchestration example](/examples/tri-cli-orchestration)
