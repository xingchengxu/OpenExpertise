<!-- Thanks for contributing! Fill in what's relevant; delete what isn't. -->

## What this changes

<!-- One paragraph. What problem does this solve, and how does this patch solve it? -->

## How to verify

<!-- Concrete steps a reviewer can run locally. -->

```bash
pnpm test
# or for a single test:
pnpm exec vitest run path/to/relevant.test.ts
```

## Checklist

- [ ] Tests added / updated (failing tests come BEFORE the fix where reasonable).
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean (0 errors).
- [ ] `pnpm format:check` clean (run `pnpm format` to auto-fix).
- [ ] If this changes an example, `oe validate examples/<name>` passes.
- [ ] If this changes user-visible behavior, docs updated.
- [ ] `CHANGELOG.md` updated under `## Unreleased`.

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (describe migration path below)
- [ ] Docs / tooling / chore

## Linked issue

Fixes #<issue-number> _(or "n/a" for trivial changes)_.

## Notes for the reviewer

<!-- Anything the diff alone won't make obvious: why this approach, what's intentionally out of scope, what to look at first. -->
