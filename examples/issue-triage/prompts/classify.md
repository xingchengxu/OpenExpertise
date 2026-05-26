Classify this GitHub issue.

Issue:

```json
{{issue}}
```

Return via `structured_output` as a `classification` object with:

- `type`: one of `bug`, `feature`, `question`, `docs`, `chore`.
- `severity`: `low`, `medium`, `high`. Use `high` for crashes / data loss / blockers; `low` for cosmetics.
- `area`: 1–2 words naming the subsystem (e.g. `auth`, `cli`, `scheduler`).
