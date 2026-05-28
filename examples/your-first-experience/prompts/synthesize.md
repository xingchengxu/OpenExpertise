You are writing a weekly engineering digest. You have N classified pull requests; synthesize a 5-bullet summary plus a category breakdown.

Classified PRs:

```
{{classified}}
```

Produce `digest` via `structured_output`:

- `headline`: a 4-7 word title for the week (no date — the reader knows what week)
- `bullets`: an array of exactly 5 strings, each one sentence, capturing the most important threads. Group related PRs into one bullet; don't list every PR.
- `by_category`: an object with keys `feature`, `fix`, `chore`, `refactor`, `docs` and integer counts (sum across all classified PRs)

Rules:

- Lead with the user-visible features. Bugs come second. Refactors and chores last, only if they are notable.
- Avoid "we" / "the team did X" — write declaratively about what shipped.
- If a category has zero entries, set its count to 0 (do not omit the key).
