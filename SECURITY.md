# Security Policy

## Supported versions

OpenExpertise is pre-1.0. Only the latest `main` branch is supported for security fixes. Once we tag the first stable release the table below will be updated.

| Version | Supported          |
| ------- | ------------------ |
| main    | ✓                  |
| < 1.0   | best-effort        |

## Reporting a vulnerability

Please report security issues via **[GitHub Security Advisories](https://github.com/xingchengxu/OpenExpertise/security/advisories/new)** so we can coordinate a fix before public disclosure.

If you prefer email, send to **security@openexpertise.dev**. Encrypt with the maintainer key (linked from the GitHub profile) for highly sensitive reports.

### What to include

- A short description of the issue.
- Steps to reproduce.
- The version / commit SHA where you observed it.
- Impact assessment (data exposure, code execution, denial of service, etc.).

### What to expect

- **Acknowledgement** within 3 business days.
- **First-pass assessment** within 7 business days.
- **Fix or mitigation** depending on severity:
  - Critical (RCE / data exfiltration): aim for ≤ 14 days.
  - High (privilege escalation, persistent DoS): aim for ≤ 30 days.
  - Medium / Low: rolled into the next regular release.
- **Public disclosure** coordinated with the reporter; default 90 days from initial report, sooner if a patch is shipping.

We credit reporters in the changelog unless you ask not to be named.

## Out of scope

The following are NOT considered security issues:

- Misuse of the `cli-agent` node kind to invoke external CLIs that themselves have unsafe defaults — that's the CLI's responsibility, not ours. We document any necessary hardening flags in `docs/cli-agent.md`.
- Self-inflicted leaks from a user-authored `tool` node (e.g. logging an API key). Inspect your own code.
- Resource exhaustion from a user-authored experience with unbounded `for_each` or `repeat:` — bounds are the author's responsibility. We're considering an `oe run --max-budget` flag for v2.

## Trust model in one paragraph

OpenExpertise runs **untrusted YAML graphs and trusted code modules** in a single Node.js process. The trust model is: the user wrote (or reviewed) the YAML, and trusts every `tool`/`skill` module on disk. Loading an experience from a stranger's repo means loading their code — treat it like `npm install`.
