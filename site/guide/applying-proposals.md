# Applying proposals

Review, extract, and apply the diff blocks that the evolution advisor generates — safely.

## When you need this

- `oe evolve` produced a `.md` file with proposals and you want to apply one or more of them.
- You want to apply only selected proposals, not all of them.
- A `git apply` failed because the context lines don't match and you need to extract and edit the patch manually.
- You want to understand the safety boundary between the advisor and your codebase.

## The minimal example

````bash
# 1. Generate proposals
oe evolve examples/review-branch --run-id abc123

# 2. View all proposals
oe diff examples/review-branch

# 3. Read the Markdown file directly
cat examples/review-branch/.openexpertise/evolution/abc123.md

# 4. Extract and apply the first diff block
awk '/^```diff/{found=1; next} found && /^```/{found=0; next} found' \
  examples/review-branch/.openexpertise/evolution/abc123.md \
  | git apply --check
````

If `--check` passes, apply it:

````bash
awk '/^```diff/{found=1; next} found && /^```/{found=0; next} found' \
  examples/review-branch/.openexpertise/evolution/abc123.md \
  | git apply
````

## How it works

`oe evolve` calls `EvolutionAdvisor.renderMarkdown()` which writes a Markdown file where each proposal section has a fenced `diff` block:

````markdown
## 1. Add `security` dimension _(add-dataset-case, confidence: high)_

The run's state diff shows raw SQL string interpolation in the diff field,
suggesting a security reviewer was missing.

```diff
--- a/examples/review-branch/tools/seed-dimensions.mjs
+++ b/examples/review-branch/tools/seed-dimensions.mjs
@@ -7,6 +7,9 @@ export default async function seedDimensions(_args) {
     { key: 'performance', focus: 'N+1 queries and missing indexes' },
     { key: 'style', focus: 'naming and formatting' },
+    { key: 'security', focus: 'injection, auth, and data exposure vulnerabilities' },
   ]
```
````

`oe diff` (`packages/cli/src/commands/diff.ts`) lists all `.md` files in `.openexpertise/evolution/`, sorts them by filename, and prints the first 20 lines of each as a preview.

**The `awk` extraction pattern** — the one-liner extracts lines between the first ` ```diff ` and its closing ` ``` `:

````bash
awk '/^```diff/{found=1; next} found && /^```/{found=0; next} found' proposal.md
````

If a proposal file has multiple diff blocks (multiple proposals), this extracts the first one. For later proposals, use a more targeted `awk` with a counter, or open the file in an editor and copy the relevant block.

**`add-dataset-case` proposals** use a JSON array instead of a unified diff. These are row insertions, not line patches. Apply them by editing the relevant file (dataset JSON, seed tool, etc.) and appending the rows:

```json
[{ "key": "security", "focus": "injection and auth vulnerabilities" }]
```

**The safety boundary** — the advisor never modifies your files. `oe evolve` only writes to `.openexpertise/evolution/`. Everything else — reading the proposal, deciding whether to apply it, running `git apply` — is your responsibility. This is by design: the advisor is advisory, not autonomous.

## Variations

**Apply all proposals from a file at once** (only safe if you've read them all):

```bash
# Extract all diff blocks and concatenate
python3 -c "
import re, sys
md = open(sys.argv[1]).read()
diffs = re.findall(r'\`\`\`diff\n(.*?)\`\`\`', md, re.DOTALL)
print(''.join(diffs))
" examples/review-branch/.openexpertise/evolution/abc123.md | git apply
```

**Dry-run check first:**

```bash
... | git apply --check
```

Returns exit code 0 if the patch would apply cleanly.

**Apply with fuzz** if context lines are stale:

```bash
... | git apply --fuzz=3
```

**Skip a proposal** — simply don't extract it. The file remains in `.openexpertise/evolution/` for future reference; it is never auto-applied.

**Delete processed proposals** after applying to keep the directory clean:

```bash
rm examples/review-branch/.openexpertise/evolution/abc123.md
```

## Gotchas

- **Context lines in the diff may be stale.** If you have already applied other proposals or made manual edits, the context lines in a later proposal's diff may not match. Fix this by editing the patch to use current context.
- **`add-node` proposals reference line numbers in `experience.yaml`** — if the file has been reformatted or reordered, the patch may not apply. In that case, apply the change manually using the proposal's `rationale` and `diff` as guidance.
- **Never pipe to `git apply` without `--check` first** on a dirty tree — a partial application is harder to recover from than a clean rejection.
- **The `.openexpertise/evolution/` directory is not gitignored by default.** Commit proposal files to track what was proposed and when, or add the directory to `.gitignore` if you prefer not to track them.

## See also

- [The evolution advisor](/guide/evolution-advisor) — how proposals are generated
- [Author → run → evolve loop](/guide/closed-loop)
- [`oe evolve` CLI reference](/reference/cli/evolve)
- [`oe diff` CLI reference](/reference/cli/diff)
