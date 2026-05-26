# Contributing to OpenExpertise

Thanks for the interest. This document is the short-form contributor guide; the longer reasoning lives in `docs/superpowers/specs/`.

## TL;DR

- **Bugs:** open an issue with a reproduction (failing test if possible) before sending a patch.
- **Features:** open an issue first to discuss scope. Most new features land via a spec → plan → subagent-driven execution cycle (see below).
- **Docs / typos:** PR directly, no issue needed.

## Setup

```bash
pnpm install
pnpm -r build
pnpm test            # ~225 tests; expect green on main
```

Node 20.x or newer (Node 22 / 24 / 26 are tested in CI). `better-sqlite3` requires a working native build toolchain on first install.

## The spec → plan → execute rhythm

Non-trivial features go through three artifacts, each version-controlled:

1. **Spec** in `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md` — what problem, what shape, what non-goals.
2. **Plan** in `docs/superpowers/plans/YYYY-MM-DD-<name>.md` — task-by-task breakdown with code blocks. Each task is small (~2-5 min of work) and ends with a test + commit.
3. **Execution** via subagent-driven development (`superpowers:subagent-driven-development`) — fresh subagent per task, two-stage review (spec compliance + code quality).

You don't need to use Claude Code to contribute, but if you do, the `superpowers:brainstorming` and `superpowers:writing-plans` skills are the entry points.

For small fixes or pure-content PRs, skip this and just send the patch.

## Testing discipline

- **Every code change includes a test.** TDD when you can — write the test first, watch it fail, write the minimum code, watch it pass.
- **Mocked over real:** unit + e2e tests use scripted LLM clients and scripted subprocess runners — no real API keys or installed CLIs required.
- Run `pnpm test` before sending a PR. CI runs typecheck + lint + format + test on Node 20/22/24.

## Commit style

- One logical change per commit. Frequent commits are encouraged.
- Conventional-commit-ish prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `style:`, `refactor:`, `demo:`.
- Subject ≤ 70 chars. Body explains _why_ if not obvious.
- Don't squash unless asked.

## PR checklist

A PR is ready to merge when:

- [ ] Tests pass (`pnpm test`).
- [ ] Typecheck clean (`pnpm typecheck`).
- [ ] Lint clean (`pnpm lint` — 0 errors; warnings on test files are tolerated).
- [ ] Format clean (`pnpm format:check`).
- [ ] If the change affects an `experience.yaml` example, it passes `oe validate`.
- [ ] Existing docs updated if behavior changed.
- [ ] CHANGELOG.md updated under `## Unreleased`.

## Reporting bugs

Use the **Bug report** issue template. Minimum bar:

- OpenExpertise version (output of `git rev-parse HEAD` or `node packages/cli/dist/bin.js --version`).
- Node version (`node --version`).
- OS.
- Reproduction: the `experience.yaml` snippet + the command you ran + the actual vs expected output.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do **not** open a public issue for security vulnerabilities.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Be kind; assume good faith; help newcomers.

## License

By contributing you agree your work will be released under the [MIT License](LICENSE) © 2026 OpenExpertise.
