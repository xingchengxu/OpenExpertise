Suggest the most likely owner for an issue with this classification.

Classification:

```json
{{classification}}
```

Owner-routing heuristic:

- `auth` → @security-team
- `cli` → @cli-team
- `scheduler` → @runtime-team
- otherwise → @triage-bot

Return via `structured_output`:

- `suggested_owner`: a single GitHub handle (with the leading `@`).
