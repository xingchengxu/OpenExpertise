# Recording the OpenExpertise hero GIF

This is the script for the `docs/assets/hero.gif` referenced in the root README. Recommended tools: `asciinema` for terminal capture + `agg` for GIF, or Loom if you want narration.

## Pre-flight (5 min before recording)

```bash
cd OpenExpertise
git status                           # clean tree
pnpm clean && pnpm install && pnpm -r build
rm -rf examples/review-branch/.openexpertise   # purge prior runs
unset ANTHROPIC_API_KEY OPENAI_API_KEY
export ANTHROPIC_API_KEY=sk-...      # or OPENAI_API_KEY=...
```

Terminal: 100×30 cells, a font that ligatures well (JetBrains Mono / FiraCode), prompt simplified to `$ `.

## Scene 1 — show the diff (8s)

Keystrokes:

```bash
cat examples/review-branch/fixtures/add-user-lookup.diff
```

Narration ("the team is reviewing a small Python diff that adds a user lookup endpoint"). Linger 2s on the SQL `f"SELECT ... WHERE id={user_id}"` line.

## Scene 2 — Run 1 (20s)

Keystrokes:

```bash
node packages/cli/dist/bin.js run examples/review-branch --tui
```

The TUI shows fan-out across `bugs`, `perf`, `tests` reviewers. Wait for completion. Capture the final state output, especially:

- `findings: [...]` — 3 items (null deref / missing test / unclosed cursor)
- `risk_score: 0.30` (will vary)

**Important:** copy the `runId` from the last output line. You need it in Scene 3.

Narration ("three reviewers — bugs, perf, tests — read the diff. They find three issues. The SQL injection on line 5 is missed because no reviewer was asked to look for security bugs.").

## Scene 3 — evolve (12s)

Keystrokes (substitute the captured runId):

```bash
node packages/cli/dist/bin.js evolve <runId>
cat .openexpertise/evolution/<runId>.md
```

The proposal should include "Add `security` dimension" with an embedded `diff` fenced block editing `tools/list_dimensions.mjs`. (There is no separate `.diff` file — the diff lives inside the markdown.)

Narration ("the advisor reads the run trace and the diff, notices no reviewer was looking for injection-class bugs, proposes adding a security dimension.").

### Fallback if the advisor doesn't propose `security`

Replace the proposal markdown manually with a pre-recorded version (kept in this repo at `docs/assets/canned-proposal.md` if you've prepared one). Note in the screencast description that production runs are stochastic.

## Scene 4 — apply (8s)

Keystrokes:

```bash
# Extract the embedded diff and apply it
awk '/^```diff$/{f=1;next} /^```$/{f=0} f' \
  .openexpertise/evolution/<runId>.md | git apply
git diff examples/review-branch/tools/list_dimensions.mjs
```

The one-line addition is visible: `+ { key: 'security', focus: 'injection / authz / secrets' },`.

### Fallback if `git apply` fails

The advisor's diff format isn't always perfect (path resolution, context lines, hash mismatches can all break `git apply`). Fallback: open the proposal markdown, copy the diff block, and edit `examples/review-branch/tools/list_dimensions.mjs` by hand to add the line shown above.

## Scene 5 — Run 2 (25s)

Keystrokes:

```bash
node packages/cli/dist/bin.js run examples/review-branch --tui
```

Now 4 reviewers. The `security` reviewer flags the SQL injection. Wait for completion. Capture:

- `findings: [...]` — 4 items including "SQL injection in /users/<id>"
- `risk_score: 0.85` (will vary)

Narration ("same command, now four reviewers. The security reviewer catches the injection. Risk score jumps. The graph improved itself.").

## Scene 6 — tagline overlay (5s)

Static text overlay:

> The graph improved itself. State persisted. This is OpenExpertise.

## Post-production

- Trim to ≤90s total.
- Export to `docs/assets/hero.gif` at ≤2 MB (use `agg` with `--theme monokai --speed 1.4` or similar).
- Commit the GIF separately so reverts are easy.

## Validation that the demo will work today

Before recording, verify the unmocked path runs to completion:

```bash
export ANTHROPIC_API_KEY=sk-...
node packages/cli/dist/bin.js run examples/review-branch
# (expect non-zero exit only on real Anthropic API errors)
```

If the run fails, capture the error and fix before recording — never record over a broken demo.
