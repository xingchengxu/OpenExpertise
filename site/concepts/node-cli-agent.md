# `cli-agent` node

A cli-agent node delegates a prompt to an external AI coding CLI — Claude Code, OpenAI Codex, or Google Gemini — as a subprocess. It is the bridge between OpenExpertise's deterministic DAG and the autonomous agentic runtimes that live outside it.

---

## When to use it

- You want Claude Code, Codex, or Gemini to execute a complex task that requires their tool-use capabilities (file reading, code execution, web search) — things that a plain `agent` LLM call cannot do.
- You have an existing workflow that delegates work to a specific CLI and want to orchestrate it as part of a larger graph with shared state.
- You want to compare outputs from rival providers in a single flow (the `tri-cli-orchestration` pattern).
- You want the LLM to work inside a specific working directory (e.g. the repo being reviewed), which the `workdir:` field enables.

::: info Not for plain LLM calls
Use an `agent` node if you just need an LLM API call. The `cli-agent` node shells out to a CLI binary — it has subprocess overhead and requires the CLI to be installed. Reserve it for tasks that benefit from the CLI's agentic capabilities.
:::

---

## YAML fields

| Field           | Required | Type                                       | Description                                                                                                        |
| --------------- | -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `id`            | yes      | string                                     | Unique node identifier.                                                                                            |
| `kind`          | yes      | `"cli-agent"`                              | Must be the literal string `"cli-agent"`.                                                                          |
| `provider`      | yes      | `"claude-code"` \| `"codex"` \| `"gemini"` | Which CLI to spawn.                                                                                                |
| `prompt`        | yes      | string                                     | Inline prompt string. Supports `{{field}}` interpolation.                                                          |
| `model`         | no       | string                                     | Model override passed to the CLI via its `--model` flag.                                                           |
| `workdir`       | no       | string                                     | Working directory for the subprocess, relative to `experience.yaml`. Default: same directory as `experience.yaml`. |
| `output_format` | no       | `"text"` \| `"json"`                       | Output parsing mode. Default: `"text"`.                                                                            |
| `schema`        | no       | object                                     | JSON Schema for validating parsed JSON output (only used when `output_format: json`).                              |
| `timeout_ms`    | no       | number                                     | Subprocess timeout in milliseconds. Default: `600000` (10 minutes).                                                |
| `extra_args`    | no       | string[]                                   | Additional CLI flags appended after the standard arguments.                                                        |
| `reads`         | no       | string[]                                   | State fields interpolated into the prompt.                                                                         |
| `writes`        | no       | string[]                                   | State fields to write. In `text` mode: at most one. In `json` mode: keys from the parsed object.                   |
| `args`          | no       | object                                     | Static values merged into the interpolation context.                                                               |
| `phase`         | no       | string                                     | Phase grouping.                                                                                                    |
| `on_error`      | no       | `ErrorPolicy`                              | `skip` \| `fail_run` \| `retry`.                                                                                   |
| `for_each`      | no       | `ForEachClause`                            | Fan-out across a state array.                                                                                      |

---

## Provider matrix

| Provider      | CLI binary | Default invocation                                        | Notes                                                                                                                                                                                                                                         |
| ------------- | ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude-code` | `claude`   | `claude -p <prompt> --output-format <fmt>`                | `--output-format text` or `json`. JSON mode returns a `{type:"result", result: string}` envelope that OE auto-unwraps.                                                                                                                        |
| `codex`       | `codex`    | `codex exec --skip-git-repo-check [--model ...] <prompt>` | `--skip-git-repo-check` is always added to avoid interactive prompts in non-repo directories.                                                                                                                                                 |
| `gemini`      | `gemini`   | `gemini --yolo --skip-trust --prompt <prompt>`            | `--yolo` bypasses tool-approval prompts. `--skip-trust` bypasses the folder-trust gate, which silently downgrades `--yolo` in untrusted directories (including `/tmp` and most CI workdirs). Required for reliable non-interactive operation. |

All three providers support `--model` (passed when `model:` is set in YAML) and `extra_args` (appended verbatim at the end of the argument list).

### Command shapes (from source)

```typescript
// claude-code
{ cmd: 'claude', args: ['-p', prompt, '--output-format', outputFormat, ...extra_args] }

// codex
{ cmd: 'codex', args: ['exec', '--skip-git-repo-check', ...modelArgs, ...extra_args, prompt] }

// gemini
{ cmd: 'gemini', args: ['--yolo', '--skip-trust', '--prompt', prompt, ...modelArgs, ...extra_args] }
```

---

## The implementation contract

`CliAgentDispatcher` from `@openexpertise/node-kinds-cli-agent`:

1. **Interpolates** the prompt template with `{ ...state_view, ...edge_inputs, ...args }`.
2. **Builds** the subprocess command via the provider's `buildCommand()`.
3. **Spawns** the subprocess with the `SubprocessRunner` (default: `DefaultSubprocessRunner` using `child_process.spawn`).
4. **Waits** up to `timeout_ms` for the process to exit.
5. **Checks** exit code. Non-zero → throws with stderr excerpt.
6. **Parses** stdout via `parseOutput()`:
   - `text` mode: writes stdout directly to the single `writes:` field.
   - `json` mode: unwraps Claude Code envelopes, strips markdown fences, parses JSON, optionally validates with AJV.

### JSON output parsing

The `parseOutput` function handles three forms of CLI JSON output:

````typescript
// 1. Claude Code envelope: {type:"result", result: "<json-string>"}
//    → recursively unwrapped
// 2. Markdown fence: ```json\n{...}\n```
//    → fence stripped
// 3. Raw JSON: {key: value}
//    → used as-is
````

After parsing, if `schema:` is set, AJV validates the object. On failure, the dispatcher throws with the AJV error messages. On success, the object is used as `state_delta`.

---

## Full working examples

### Two providers: `examples/cli-orchestration`

Source: [`examples/cli-orchestration/`](/examples/cli-orchestration)

```yaml
name: cli-orchestration
version: 0.1.0

state:
  schema:
    topic: { type: string }
    summary: { type: string }
    critique: { type: string }

graph:
  nodes:
    - id: summarize
      kind: cli-agent
      provider: claude-code
      prompt: |
        Write a 3-sentence summary of the following topic.
        Topic: {{topic}}
      args:
        topic: 'In-memory caching strategies for HTTP APIs'
      writes: [summary]
      timeout_ms: 120000

    - id: critique
      kind: cli-agent
      provider: codex
      prompt: |
        Critique this summary in 2 sentences.
        Summary: {{summary}}
      reads: [summary]
      writes: [critique]
      timeout_ms: 120000

  edges:
    - { from: summarize, to: critique }
```

### Three providers: `examples/tri-cli-orchestration`

Source: [`examples/tri-cli-orchestration/`](/examples/tri-cli-orchestration)

Claude Code → Codex → Gemini, each reading the prior node's output from state:

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
        Topic: {{topic}}
      args: { topic: 'In-memory caching strategies for HTTP APIs' }
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
        Given the summary and critique, deliver a one-sentence verdict on production-readiness.
        Summary: {{summary}}
        Critique: {{critique}}
      reads: [summary, critique]
      writes: [verdict]
      timeout_ms: 180000

  edges:
    - { from: summarize, to: critique }
    - { from: critique, to: verdict }
```

---

## Variations

### JSON output mode

Ask the CLI to return structured JSON and have it validated against a schema:

```yaml
- id: analyze_code
  kind: cli-agent
  provider: claude-code
  prompt: |
    Analyze this file and return JSON with keys: bugs (array), complexity (number).
    Output only JSON, no markdown.
    File: {{file_content}}
  output_format: json
  schema:
    type: object
    required: [bugs, complexity]
    properties:
      bugs: { type: array, items: { type: string } }
      complexity: { type: number }
  reads: [file_content]
  writes: [bugs, complexity]
```

### Custom working directory

Run the CLI inside a repository being reviewed:

```yaml
- id: security_scan
  kind: cli-agent
  provider: claude-code
  prompt: 'Scan this directory for security vulnerabilities and list findings.'
  workdir: ../target-repo
  writes: [security_findings]
```

### Fan-out per file

```yaml
- id: review_file
  kind: cli-agent
  provider: claude-code
  prompt: |
    Review this file for bugs.
    File path: {{_item.path}}
    Content: {{_item.content}}
  for_each: { source: $.files }
  reads: [files]
  writes: [file_reviews]
```

### With `extra_args` for Claude Code

```yaml
- id: web_search
  kind: cli-agent
  provider: claude-code
  prompt: 'Search the web for the latest Node.js LTS release notes.'
  extra_args: ['--allowedTools', 'WebSearch']
  writes: [release_notes]
```

### With `on_error: retry`

CLI agents can fail transiently (rate limits, process startup). Retry helps:

```yaml
- id: fetch_data
  kind: cli-agent
  provider: gemini
  prompt: 'Fetch current weather data for {{city}}.'
  reads: [city]
  writes: [weather]
  on_error:
    policy: retry
    attempts: 3
    backoff: exponential
    base_ms: 2000
```

---

## Gotchas

1. **CLIs must be on PATH** — The dispatcher uses `spawn` without a shell. If `claude`, `codex`, or `gemini` is not on PATH at the time `oe run` executes, the node fails immediately. Run `oe doctor` to check.

2. **Gemini requires `--skip-trust` in most environments** — Without it, Gemini exits with code 55 in untrusted directories (all `/tmp` and most CI workdirs). OE adds `--skip-trust` automatically; remove it via `extra_args` only if you know your workdir is trusted.

3. **Text mode: at most one `writes:` field** — In `text` mode, stdout is written verbatim to a single field. For multi-field output, use `output_format: json` with a schema.

4. **Claude Code JSON output is envelope-wrapped** — `--output-format json` from Claude Code returns `{"type":"result","result":"<model-text>"}`, not raw JSON. The `parseOutput` function unwraps this automatically.

5. **Timeout is 10 minutes by default** — For agentic tasks that browse the web or read large codebases, this may be too short. Set `timeout_ms:` explicitly for long-running nodes.

---

## See also

- [Guide: cli-agent node usage](/guide/cli-agent-usage)
- [The 6 node kinds](/concepts/node-kinds)
- [Examples: cli-orchestration](/examples/cli-orchestration)
- [Examples: tri-cli-orchestration](/examples/tri-cli-orchestration)
- [CLI: `oe doctor`](/reference/cli/doctor)
