# Contributing to OpenExpertise

Thanks for the interest. This is the short-form contributor guide.

## TL;DR

- **Bugs:** open an issue with a reproduction (failing test if possible) before sending a patch.
- **Features:** open an issue first to discuss scope. Most non-trivial features land via a spec → plan → execute cycle (see below).
- **Docs / typos:** PR directly, no issue needed.
- **New experiences for the registry:** open a `📦 Submit an experience` issue — see [`docs/registry.md`](docs/registry.md).

## Setup

```bash
pnpm install
pnpm -r build
pnpm test            # 265 tests; expect green on main
```

Node 20.x or newer (Node 20 / 22 / 24 are tested in CI). `better-sqlite3` requires a working native build toolchain on first install.

## The spec → plan → execute rhythm

Non-trivial features go through three artifacts attached to the issue or PR:

1. **Spec** — what problem, what shape, what non-goals. One markdown doc in the PR description or a linked gist.
2. **Plan** — task-by-task breakdown with code blocks. Each task is small (~2-5 min of work) and ends with a test + commit.
3. **Execution** — implementation against the plan. If you use Claude Code, the `superpowers:subagent-driven-development` skill is a good fit (fresh subagent per task, two-stage review). If not, just iterate against the plan manually.

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

- OpenExpertise version (output of `oe --version` or `git rev-parse HEAD` when developing from source).
- Node version (`node --version`).
- OS.
- Reproduction: the `experience.yaml` snippet + the command you ran + the actual vs expected output.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do **not** open a public issue for security vulnerabilities.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Be kind; assume good faith; help newcomers.

## License

By contributing you agree your work will be released under the [MIT License](LICENSE) © 2026 OpenExpertise.
