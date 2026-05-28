---
title: Submit your experience to the registry
description: Use oe submit to add your experience to the curated registry with auto-detected GitHub metadata and a pre-filled submission issue.
---

# Submit your experience to the registry

## What `oe submit` does

- **Validates your `experience.yaml`.** The same checks as `oe validate` run first. The submit will abort before opening any issue if the YAML is malformed or missing required fields.
- **Auto-detects GitHub metadata.** It reads `git remote get-url origin` to extract `owner` and `repo`, and scans for an annotated tag at HEAD to use as `ref`. You can override any of these with flags.
- **Generates the canonical registry entry.** The JSON object that would be appended to the community `registry.json` is assembled locally before any network call.
- **Opens a pre-filled GitHub issue.** A browser tab opens with the entry JSON and the submission checklist pre-populated. A maintainer reviews and merges from there — no PR required from you.

## Quick start

```bash
# In your experience directory
git tag v0.1.0 && git push --tags        # MUST be a tag — installs need to be reproducible
oe submit --tags <comma,separated>
```

The `ref` must resolve to a tag. A bare branch name is rejected because `oe install` needs a reproducible ref that will not drift. If you don't have a tag at HEAD, create one first.

## What gets generated

`oe submit` prints the entry it would open before opening the browser:

```json
{
  "name": "your-experience",
  "owner": "your-gh-username",
  "repo": "your-repo",
  "ref": "v0.1.0",
  "description": "What it does in one sentence",
  "tags": ["incident-response", "oncall"]
}
```

This is the exact shape appended to `registry.json` when the issue is approved and merged by a maintainer.

## Required vs optional

| Field            | Source                                       | Required?   |
| ---------------- | -------------------------------------------- | ----------- |
| `name`           | `experience.yaml` `name:` field, or `--name` | ✓           |
| `owner` / `repo` | `git remote get-url origin`                  | ✓ (auto)    |
| `ref`            | Tag at HEAD, or `--ref`                      | ✓           |
| `description`    | `experience.yaml` `description:`             | recommended |
| `tags`           | `--tags`                                     | recommended |
| `subpath`        | Auto-detected if not at repo root            | optional    |

If `owner`/`repo` detection fails (e.g., SSH remote with a non-standard format), pass `--owner` and `--repo` explicitly.

## Pre-submit checklist

The GitHub issue template includes this checklist. Verify all items before submitting to speed up review:

- Working `experience.yaml` at the root (or at the `subpath` if it's a mono-repo).
- `README.md` with prerequisites and at least one example `oe run` command that a new user can copy-paste.
- A mocked-LLM or smoke test in `e2e/` or `tests/` — reviewers will run it.
- Pinned `ref` — a git tag is strongly preferred over a commit SHA.
- OSI-approved license file in the repo root.
- The experience works against `@openexpertise/cli@^0.1.0` (the current stable range).
- You're committing to maintain the experience as OE evolves — experiences that break across minor versions will be flagged in the registry.

## Dry-run before submitting

Run with `--dry-run` to preview the generated JSON without opening a browser or creating any issue:

```bash
oe submit --tags x,y --dry-run                # print entry, do NOT open issue
oe submit --tags x,y --output entry.json      # write JSON to file (for manual PR)
```

`--output` is useful if you want to open a pull request against the registry repo directly instead of using the issue template.

## Variations

- **Overriding auto-detected fields.** Use `--name my-experience`, `--ref v0.2.0`, or `--description "One-sentence description"` to override any field that `oe submit` would normally infer from the repo or YAML.
- **Submitting from a subpath.** In a mono-repo with multiple experiences under `experiences/triage/` and `experiences/review/`, run `oe submit` from inside the subdirectory. The `subpath` field is auto-detected and included in the registry entry so that `oe install` checks out the right path.
- **CI-assisted submission.** Use `--dry-run --output entry.json` in CI to produce the registry entry automatically on every tagged release, then file the issue via `gh issue create` in the same workflow.

## See also

- [Registry documentation](/docs/registry.md) — full registry schema and review process
- [Guide: Your first experience](/guide/first-experience) — the tutorial ends with `oe submit`
- [Submit an experience (issue template)](https://github.com/xingchengxu/OpenExpertise/issues/new?template=experience_submission.md) — the canonical issue URL
