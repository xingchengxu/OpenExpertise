# `/ultraexpertise` and `oe ultra` — one-keyword SOP authoring

`/ultraexpertise <task>` (Claude Code slash command) and `oe ultra "<task>"` (CLI) are the same thing: an LLM-driven pipeline that turns a natural-language task description into a complete, validated OpenExpertise experience. The pipeline runs two LLM phases (Analysis → Synthesis), followed by an optional in-memory quality loop (Critique → Revise), and then a single Materialization pass that writes the best-scoring draft to disk.

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

### Quality loop (critique → revise)

After synthesis, `oe ultra` runs an in-memory critique→revise loop before writing anything to disk. This loop is enabled by default (`--max-rounds 1`); pass `--max-rounds 0` to skip it and get the legacy one-shot behavior.

**How a round works:**

1. A deterministic preflight (`parseExperienceYaml` → `validateExperienceSpec` → `buildDag` + static file/field assertions) and schema validation run against the current draft. Any errors are collected immediately — no LLM needed.
2. An adversarial LLM **critic** judges only two subjective dimensions: decomposition quality (graph structure, verifier coverage, fan-out semantics) and prompt quality (output contracts, specificity). It does NOT re-judge `writes`/`reads` consistency, schema validity, dangling edges, or missing tool files — those are handled deterministically in step 1 and fed to the reviser directly.
3. If the critic finds issues, an incremental LLM **reviser** applies the smallest correct edit — touching only the implicated node IDs and file paths and emitting everything else byte-identical.
4. The revised draft is re-evaluated and compared against the previous best. The **keep-best + monotonicity guarantee** ensures the loop never ships a draft worse than the one-shot baseline: a revision that introduces new validation failures is discarded and the prior best is kept.

**Early stop:** If the critic returns an empty `findings[]`, or if the composite score (adjusted for high/medium-severity findings) meets or exceeds `OE_ULTRA_SCORE_BAR`, the loop stops before the reviser is called and the current draft is materialized immediately.

**Configuration:**

| Option | Default | Description |
|--------|---------|-------------|
| `--max-rounds <n>` | `1` (CLI) / `0` (library) | Number of critique→revise rounds. `0` disables the loop entirely (legacy one-shot). |
| `OE_ULTRA_SCORE_BAR` | `80` | Composite score (0–100) required for early-stop. Raise it to demand a cleaner first pass; lower it to exit sooner. |
| `OE_ULTRA_CRITIC_MODEL` | _(base model)_ | Optional same-provider model override for the critic role. Defaults to the same model used for analysis/synthesis. |

Note: the `author()` library default is `maxRounds: 0` (preserving exact backward compatibility for callers that omit the option). Only the `oe ultra` CLI defaults to 1 round.

**`loop` field in the `author()` return value:**

When `maxRounds > 0`, the return object includes a `loop` key:

```ts
loop: {
  rounds_run: number          // how many critique→revise rounds actually executed
  final_score: number | null  // the composite score of the materialized draft (null if no critique ran)
  critiques: CritiqueOutput[] // one entry per round that produced a valid critique
  tokens?: {                  // summed LLM usage across all critique + revise calls
    input: number
    output: number
  }
}
```

When `maxRounds === 0` (the default for direct `author()` calls), no `loop` key is present — the return shape is identical to the pre-loop baseline.

**CLI progress output:**

```
Phase 1/2 analyze  ✓ 2.1s
Phase 2/2 synthesize  ✓ 8.4s
  ↳ critique round 1/1  ✓ 3.2s  score 74
  ↳ revise round 1/1  ✓ 6.1s
Quality loop: 1 round(s), final score 91/100 (bar 80)
```

### Phase 3 — Materialization

The writer creates the draft directory and writes the best-scoring draft — a single `writeDraft` call, always with the highest-composite draft produced across all rounds. Files are written safely (path-traversal rejected, parent dirs created). Then `oe validate` runs against the result.

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
- `--max-rounds <n>`: number of critique→revise rounds (default `1`; `0` disables the loop for the legacy one-shot behavior).

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

Returns `{ slug, draft_dir, analysis, synthesis: { file_paths, next_steps }, validation, files_written, loop? }`. The full file contents are NOT in the response — they're on disk at `draft_dir`. The optional `loop` field (`{ rounds_run, final_score, critiques }`) is present when `max_rounds > 0` (the default).

## Composition with the evolution advisor

The same LLM provider drives both `oe ultra` and `oe evolve`. After you run the authored experience once, the advisor reads the events + state diff and proposes upgrades — additional dimensions, tuned retry policies, missing tools. Author → run → evolve is one continuous loop.

## V1 limitations

- **In-memory iteration only.** The quality loop runs within a single `oe ultra` call and cannot resume from a prior run. Post-materialization refinement is via `oe evolve` on a real run.
- **No prompt customization.** The analyzer / synthesizer system prompts ship with the package; users can fork the package to customize.
- **Tool stubs may need real wiring.** Generated `tools/*.mjs` typically include a `// TODO:` marker for the real integration point (API call, credentials, etc.). They're runnable as fixtures but not production-ready until you fill them in.
- **No automatic promotion.** `mv draft examples/` is intentional — moving to permanent storage is a user decision.
