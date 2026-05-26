# v0.1.0 Launch Checklist

Run this checklist linearly on the day of `npm publish`. Don't skip.

## T-7 days: stabilize

- [ ] All open critical / important issues either closed or labeled `wontfix-for-v0.1`.
- [ ] CI green on `main` for all 3 Node versions (20, 22, 24).
- [ ] `pnpm clean && pnpm install && pnpm -r build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` clean on a fresh clone.
- [ ] Manual smoke of `examples/review-branch` and `examples/tri-cli-orchestration` with real API keys.

## T-3 days: docs freeze

- [ ] `README.md` examples copy-pasteable and verified end-to-end.
- [ ] `docs/cli-agent.md`, `docs/mcp-server.md`, `docs/ultraexpertise.md`, `docs/comparison.md` reflect current behavior.
- [ ] `CHANGELOG.md` `## Unreleased` empty; `## [0.1.0]` finalized.
- [ ] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` present.

## T-1 day: version sync + publish dry-run

- [ ] All 14 publishable packages on `version: 0.1.0`:

  ```bash
  for pkg in packages/*/package.json; do
    node -e "console.log(require('./${pkg}').name + ' ' + require('./${pkg}').version)"
  done
  ```

  Every line should end in ` 0.1.0`. If any drifted, sync them in a single chore commit.

- [ ] Every publishable package has `publishConfig: { access: "public" }`:

  ```bash
  for pkg in packages/*/package.json; do
    name=$(node -e "console.log(require('./${pkg}').name)")
    access=$(node -e "console.log((require('./${pkg}').publishConfig||{}).access||'MISSING')")
    echo "${name}: ${access}"
  done | grep -v ' public$' || echo "All publishable packages set to public."
  ```

- [ ] `npm publish --dry-run` on each package from inside its dir; review the file list. Confirm `dist/` is included and source files are not.

  ```bash
  for dir in packages/*/; do
    echo "=== ${dir} ==="
    (cd "${dir}" && npm publish --dry-run --access public 2>&1 | tail -30)
  done
  ```

  Look for: tarball size sane (< 1 MB for non-bundle packages), no `.env` or `*.key` files, no `node_modules/` content, no `tests/` content.

- [ ] Cross-package workspace dependencies are `workspace:*` in source but should resolve to concrete versions on publish. Verify with:

  ```bash
  cd packages/cli
  npm pack --dry-run 2>&1 | grep -i workspace
  ```

  Expected: pnpm should rewrite `workspace:*` to `^0.1.0` during pack. If you see `workspace:*` in the tarball, pnpm's `publish` flow isn't being used — switch to `pnpm publish -r --no-git-checks --dry-run`.

## Publish day: the actual publish

- [ ] Make sure you're logged in:

  ```bash
  npm whoami
  ```

  Expected: your npm username. If not, `npm login --auth-type=web`.

- [ ] Two-factor auth on the npm account. If you don't have it, set it up first.

- [ ] **Publish via pnpm** (not raw `npm publish` — pnpm handles `workspace:*` rewrites):

  ```bash
  pnpm publish -r --access public --no-git-checks
  ```

  `-r` recurses through all workspace packages. `--no-git-checks` because we tag separately.

- [ ] Verify each package landed:

  ```bash
  for pkg in packages/*/package.json; do
    name=$(node -e "console.log(require('./${pkg}').name)")
    echo "${name}: $(npm view ${name} version 2>&1 | head -1)"
  done
  ```

  Every line should show `0.1.0`.

- [ ] Smoke-test from a fresh dir (NOT the repo):

  ```bash
  cd /tmp
  mkdir oe-publish-smoke
  cd oe-publish-smoke
  npm init -y
  npm install @openexpertise/cli
  npx oe --help
  ```

  Expected: CLI loads, shows help.

## Tag + release

- [ ] Tag the release commit:

  ```bash
  git tag -a v0.1.0 -m "v0.1.0 — first public release"
  git push origin v0.1.0
  ```

- [ ] Create a GitHub Release pointing at the tag. Copy the `## [0.1.0]` section of `CHANGELOG.md` into the release notes.

## Launch comms

- [ ] HN Show post: link to the GitHub repo + the `## What it is (in one sentence)` README paragraph. Highlight 3 facts: codify SOPs as YAML, persistent state, evolution loop.
- [ ] Twitter / X thread: short version of HN post + the `tri-cli-orchestration` demo image.
- [ ] r/LocalLLaMA post: emphasize `OPENAI_BASE_URL` support for vLLM / Ollama / LM Studio.
- [ ] Anthropic Discord (#projects channel if it exists): brief intro + repo link.

## Day 1-7: monitor

- [ ] Watch GitHub Issues; aim for ≤ 24h first-response.
- [ ] Watch npm download counts: <https://npm-stat.com/charts.html?package=@openexpertise/cli>.
- [ ] Triage incoming bug reports; create a v0.1.1 milestone for fixes.
- [ ] Capture the first three "I tried OpenExpertise for X" stories — they're the basis for testimonials and case studies.

## If something breaks during publish

- [ ] **Unpublish window:** npm allows unpublish within 72 hours. Use only if a published package is _actively broken_:

  ```bash
  npm unpublish @openexpertise/<pkg>@0.1.0
  ```

  After 72 hours, deprecate instead:

  ```bash
  npm deprecate @openexpertise/<pkg>@0.1.0 "broken; install 0.1.1 instead"
  ```

- [ ] If only ONE package is broken, publish the fixed version as `0.1.1` for that package only and leave the rest at `0.1.0`. The monorepo doesn't require lockstep versioning.

## Out of scope for v0.1.0

Items deliberately punted to v0.2 or v0.3 — don't try to fix these before launch:

- Streaming LLM responses (V2 non-goal; deferred).
- Session-mode CLI agents (V2 non-goal).
- `oe evolve --apply` automated diff application.
- Hero GIF in `docs/assets/`. Replace placeholder once recorded; not blocking.
- Auto-publish on tag via GitHub Actions — manual publish for v0.1.0 is fine.
- Docs site (Astro Starlight / Docusaurus) — multi-day work, post-launch.
