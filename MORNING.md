# Morning checklist — v0.1.0 publish

> Written overnight 2026-05-27. Branch: `feat/overnight-launch-prep` (22 commits ahead of `main`).
> All gates green at commit time: **265 tests passing**, typecheck clean, lint clean, format clean, site builds, monorepo builds.

This file is your runbook. Work top-down.

---

## 1. Wake-up sanity check (5 min)

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
git status                                  # should be clean (or only untracked site WIP)
git log --oneline main..HEAD                # 22+ commits expected
pnpm clean && pnpm install && pnpm -r build # rebuild from scratch
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

**Expected:** `Tests 265 passed (265)` (or higher if anything was added overnight).

If anything fails, stop and read the error before continuing. Don't paper over.

---

## 2. Decide what to do with `feat/overnight-launch-prep`

Two paths:

### Path A — Merge to `main` locally then publish

```bash
git checkout main
git merge --no-ff feat/overnight-launch-prep -m "Merge branch 'feat/overnight-launch-prep'"

# Optional safety: rerun the gauntlet on main
pnpm clean && pnpm install && pnpm -r build
pnpm test
```

### Path B — Push the branch, open a PR, review, then merge

```bash
git push -u origin feat/overnight-launch-prep
gh pr create --base main --head feat/overnight-launch-prep \
  --title "v0.1.0 launch prep — package metadata + CHANGELOG + 12th example + registry + docs site" \
  --body "$(cat <<'BODY'
## Summary

22 commits of pre-publish prep. See \`docs/superpowers/overnight-progress.md\` Plan G for the full breakdown. Highlights:

- All 15 publishable packages have full npm metadata (description / keywords / author / repository / bugs / homepage)
- Brand new \`oe doctor\` / \`oe install\` / \`oe registry\` / \`oe installed\` commands
- 12th flagship example: \`brainstorming\` (translates the superpowers brainstorming skill)
- Lint: 16 \`any\` warnings → 0
- CHANGELOG.md v0.1.0 entry consolidates Plans 1-6 + A-G
- 10 runtime error messages rewritten with actionable WHAT/WHERE/HOW-TO-FIX hints
- VitePress docs site with examples gallery + 12 example pages + concepts + reference + operations docs
- GitHub Pages workflow for site auto-deploy

## Test plan

- [x] Tests: 227 baseline → 265 passing (+38)
- [x] typecheck / lint / format / build all clean
- [x] \`oe doctor\` smoke-runs on dev machine
- [x] \`oe registry\` lists 5 curated experiences
- [x] VitePress site builds
- [ ] Manual smoke of \`oe install gh:xingchengxu/OpenExpertise --ref main\` (requires push first)
BODY
)"
```

**Recommendation:** Path A (merge locally) — fastest path to publish. PR is nice for archive but you've already reviewed by reading this file.

---

## 3. Publish-day checklist (the actual publish)

The detailed checklist is at `docs/launch-checklist.md`. The TL;DR:

```bash
# Sanity: every publishable package on 0.1.0
for pkg in packages/*/package.json; do
  node -e "console.log(require('./${pkg}').name + ' ' + require('./${pkg}').version)"
done
# Expect: every line ends with " 0.1.0"

# Dry-run publish to inspect tarballs (no network writes)
pnpm publish -r --dry-run --no-git-checks 2>&1 | tail -40

# REAL PUBLISH — point of no return
npm whoami                                  # confirm you're logged in
pnpm publish -r --access public --no-git-checks
```

`-r` recurses all workspace packages. `--no-git-checks` because we tag separately.

**Order:** pnpm publishes in topological dependency order automatically — `schema` first, then `core`, then dispatchers, then `cli`, etc. Trust the order.

---

## 4. Tag + push

```bash
# After successful publish:
git tag -a v0.1.0 -m "OpenExpertise v0.1.0"
git push origin main
git push origin v0.1.0
```

---

## 5. GitHub release

```bash
gh release create v0.1.0 \
  --title "v0.1.0 — First public release" \
  --notes-file CHANGELOG.md \
  --latest
```

Or paste from `docs/launch-announcement.md` for a friendlier release body — the CHANGELOG is dense.

---

## 6. Launch announcements

See `docs/launch-announcement.md` for three drafts:

- **HN (Show HN)**: ~365 words, technical, comparison table, limitations called out
- **Reddit r/programming**: ~285 words, friendlier intro, two concrete examples
- **X thread**: 8 tweets, technical

**Order recommended:** HN first (highest signal/risk), then X thread once HN starts moving, then Reddit later in the day. Don't post all three at the same instant — looks like spam.

You may want to edit each draft to match your voice before posting. The drafts are starting points, not final.

---

## 7. Post-publish smoke

After the npm registry catches up (~5 min):

```bash
# Verify package is real on the public registry
npm view @openexpertise/cli
npm view @openexpertise/core
npm view @openexpertise/schema

# Fresh-machine simulation: install globally, run the doctor
mkdir /tmp/oe-smoke && cd /tmp/oe-smoke
npm init -y
npm install @openexpertise/cli
npx oe doctor                               # should pass-or-warn, exit 0
npx oe registry                             # should list 5 curated entries
npx oe install gh:xingchengxu/OpenExpertise --ref v0.1.0
# (will clone the whole repo since no subpath override; see docs/registry.md for subpath spec)
```

---

## 8. If something goes wrong

### Published a broken package

```bash
npm deprecate @openexpertise/<name>@0.1.0 "Bug X — install 0.1.1 instead"
# Fix the bug, bump to 0.1.1, republish
```

You CAN'T unpublish if anyone has installed. Deprecate + republish is the pattern.

### Pre-publish failures

- `pnpm publish` errors with "you must be logged in" → `npm login --auth-type=web`
- `pnpm publish` errors with "package already exists" → some package on `0.1.0` already published. Bump it to `0.1.1` and try again, or check `npm view` to confirm which one is conflicting.
- `pnpm publish` reports workspace:* in tarball → use `pnpm publish -r`, never raw `npm publish` from a workspace package.

### Tests fail in CI but pass locally

- Different Node version? CI uses 20/22/24; your machine may be on 26.
- Different platform? CI is Linux; your dev is macOS.
- Race condition in a parallel test? `pnpm test --shard=1/1` (single-shard).

---

## 9. What WASN'T done overnight (intentional)

These are nice-to-haves the user can decide on later. None block v0.1.0:

- **Cookbook docs** — `docs/cookbook/` with recipe-style how-tos. Scaffolding exists in `site/guide/`; expand as needed.
- **Performance benchmarks** — no harness yet. Add post-launch based on real-user reports.
- **Windows CI** — `.github/workflows/` runs Linux only. Most users on macOS/Linux; Windows can come later.
- **Multi-tenant state SQLite** — current store is single-process. Multi-process advisory locking is post-v0.1.0.
- **Telemetry / metrics export** — out of scope for v0.1.0.

---

## 10. Boundary reminders (what I did NOT do overnight)

- Did NOT push to remote.
- Did NOT publish to npm.
- Did NOT create PRs.
- Did NOT merge to `main` (you make that call).
- Did NOT touch credentials or .env files.
- Did NOT force-push, reset --hard, or destructively clean anything.

Everything overnight is local-only. The branch `feat/overnight-launch-prep` is yours to inspect, edit, squash, or discard.

---

**Good luck. The hard part is the next 24 hours after publish, not the publish itself. Sleep well first.** 😴
