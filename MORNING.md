# Morning checklist — v0.1.0 publish

> Updated 2026-05-27 after merging `feat/overnight-launch-prep` into `main`. The site agent + waves A/B/C added another ~25 commits to `main`.
> All 9 pre-publish gates green at the last smoke run: **265 tests passing**, typecheck clean, lint clean, format clean, site builds, monorepo builds, version sync across 15 packages, `publishConfig.access=public` everywhere, no `workspace:*` leaks in dry-run tarballs.

This file is your runbook. Work top-down.

---

## 1. Wake-up sanity check (1 command)

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
./scripts/pre-publish-smoke.sh
```

That runs all 9 gates in order and exits non-zero on the first failure. Expected: `All pre-publish gates green.`

If you want the old longhand:

```bash
pnpm clean && pnpm install && pnpm -r build
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

**Expected:** `Tests 265 passed (265)`.

If anything fails, stop and read the error before continuing. Don't paper over.

---

## 2. Decide whether to push `main` first or publish first

`feat/overnight-launch-prep` is already merged into local `main`. Two paths:

### Path A — Push `main` then publish (recommended)

```bash
git push origin main             # publishes the merged commit to remote
./scripts/pre-publish-smoke.sh   # re-verify after push (in case CI catches anything)
pnpm publish -r --access public --no-git-checks
```

### Path B — Publish first, then push (faster but riskier)

```bash
./scripts/pre-publish-smoke.sh
pnpm publish -r --access public --no-git-checks
git push origin main
git tag -a v0.1.0 -m "OpenExpertise v0.1.0" && git push origin v0.1.0
```

If publish fails mid-way (e.g. one package errors out), some packages may be on npm but `main` doesn't have the corresponding tag. Path A avoids that ambiguity.

Either path works — pick based on whether you want the git tag synchronized with the npm release (Path A) or want to fail fast on a bad tarball (Path B).

---

## 3. Publish-day checklist (the actual publish)

The detailed checklist is at `docs/launch-checklist.md`. The TL;DR (and `scripts/pre-publish-smoke.sh` already does the sanity checks):

```bash
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
- `pnpm publish` reports workspace:\* in tarball → use `pnpm publish -r`, never raw `npm publish` from a workspace package.

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
