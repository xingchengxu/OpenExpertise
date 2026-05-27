## Summary

<!-- 1-3 bullets describing what changed and why. -->

## Type of change

- [ ] Bug fix (no behavior change for users on the happy path)
- [ ] New feature (additive — doesn't break existing usage)
- [ ] Breaking change (existing experience.yaml or CLI usage stops working)
- [ ] Docs only
- [ ] New example / cookbook recipe
- [ ] Test-only or chore

## Test plan

- [ ] `pnpm test` passes locally (state the new total if you added tests)
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm format:check` clean
- [ ] For new examples: included a mocked-LLM e2e test in `e2e/`
- [ ] For CLI changes: manually exercised the new flag/command on the dev machine

## Checklist

- [ ] CHANGELOG.md entry under `## [Unreleased]` (if user-visible)
- [ ] Docs updated (README / `site/` / `docs/`)
- [ ] No new direct npm dependencies (or, if you added one, justification in this PR)

## Related issues

<!-- Closes #N, refs #M -->
