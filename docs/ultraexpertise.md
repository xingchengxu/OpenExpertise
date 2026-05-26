# `/ultraexpertise` and `oe ultra` — one-keyword SOP authoring

`/ultraexpertise <task>` (Claude Code slash command) and `oe ultra "<task>"` (CLI) are the same thing: an LLM-driven, two-phase pipeline that turns a natural-language task description into a complete, validated OpenExpertise experience.

This is OpenExpertise's analogue of Claude Code's `/workflows` + `ultrawork` keyword — with a structural difference: the output is a **declarative YAML graph + tool stubs + prompts**, version-controllable from day one, ready to be promoted into your repo's `examples/` and improved via the [evolution advisor](./mcp-server.md).

## How it works

### Phase 1 — Analysis

The LLM reads your task and returns a structured plan:

- `name`: slug for the experience.
- `phases`: ordered phases (default: collect / analyze / verify / report).
- `state_fields`: the SQLite blackboard schema.
- `node_sketches`: one entry per node — id, kind (`tool` / `agent` / `skill` / `dataset` / `experience` / `cli-agent`), purpose, optional fan-out.
- `open_questions`: anything the user has to fill in (credentials, choice lists, etc.).

### Phase 2 — Synthesis

A second LLM call turns the plan into a runnable artifact:

- `experience_yaml`: the full YAML, validated against OpenExpertise's schema.
- `files[]`: every supporting file (`tools/*.mjs` stubs, `prompts/*.md`, a top-level `README.md`).
- `next_steps[]`: concrete actions.

### Phase 3 — Materialization

The writer creates the draft directory and writes every file safely (path-traversal rejected, parent dirs created). Then `oe validate` runs against the result.

### Phase 4 — User decision

The CLI prints the slug, draft path, open questions, and next-step commands. You can:

- `oe run <draft path>` to try it.
- `mv <draft path> examples/<slug>` to promote it (entirely your choice — no automatic promotion).
- Run it, then `oe evolve <run-id>` to get advisor proposals on top of what was authored.

## CLI

```bash
oe ultra "Review pull requests against SOC2 controls and produce a risk score"
# → writes .openexpertise/drafts/soc2-pr-review/
```

Flags:

- `--draft-root <dir>`: where to put the draft (default `.openexpertise/drafts`).
- `--llm <anthropic|openai>`: provider override (auto-detected from env).

Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

## Claude Code slash command

Install once:

```bash
mkdir -p ~/.claude/commands
cp packages/skill-experience-creator/commands/ultraexpertise.md ~/.claude/commands/
```

Then in any Claude Code session:

```
/ultraexpertise Review my repo for OWASP Top 10 issues
```

The assistant runs `oe ultra` and reports back.

## MCP tool

From inside any MCP-aware CLI:

```
oe_ultra({ task: "..." })
```

Returns `{ slug, draft_dir, analysis, synthesis: { file_paths, next_steps }, validation, files_written }`. The full file contents are NOT in the response — they're on disk at `draft_dir`.

## Composition with the evolution advisor

The same LLM provider drives both `oe ultra` and `oe evolve`. After you run the authored experience once, the advisor reads the events + state diff and proposes upgrades — additional dimensions, tuned retry policies, missing tools. Author → run → evolve is one continuous loop.

## V1 limitations

- **No iteration.** Each `oe ultra` call is a fresh two-phase pipeline. The next iteration is via `oe evolve` on a real run, not a `oe ultra --refine` flag.
- **No prompt customization.** The analyzer / synthesizer system prompts ship with the package; users can fork the package to customize.
- **Tool stubs may need real wiring.** Generated `tools/*.mjs` typically include a `// TODO:` marker for the real integration point (API call, credentials, etc.). They're runnable as fixtures but not production-ready until you fill them in.
- **No automatic promotion.** `mv draft examples/` is intentional — moving to permanent storage is a user decision.
