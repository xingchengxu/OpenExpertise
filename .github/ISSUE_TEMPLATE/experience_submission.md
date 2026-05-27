---
name: "\U0001F4E6 Submit an experience to the registry"
about: Add your OpenExpertise experience to the curated registry
title: 'registry: add <experience-name>'
labels: 'registry'
---

## Experience

- **Name (for `oe install <name>`):** `<short-kebab-case>`
- **GitHub repo:** `https://github.com/<owner>/<repo>`
- **Pinned ref (tag preferred):** `v0.1.0` / `main` / specific SHA
- **Subpath (if monorepo):** `examples/<name>` or leave blank
- **One-line description:** `<≤120 chars>`
- **Tags:** `<comma-separated>`

## Checklist

- [ ] The repo contains a working `experience.yaml` at the root or subpath above.
- [ ] The repo has a README with at minimum: what the flow does, prereqs, and one example run command.
- [ ] The repo has a mocked-LLM or smoke test in `e2e/` or `tests/`.
- [ ] The pinned ref is a tag or specific SHA (not just `main` — those drift).
- [ ] License is OSI-approved (MIT / Apache-2.0 / etc.).
- [ ] The flow works against `@openexpertise/cli@^0.1.0`.

## How will this be useful

<!-- 1-2 sentences on the use case. -->

## Maintainer commitment

<!-- Are you committing to keep this updated as OE evolves? Linked at-least once a month, etc. -->
