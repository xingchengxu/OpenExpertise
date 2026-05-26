Write a one-page oncall summary. Sections:

1. **What happened** — 2 sentences max, in plain language.
2. **Current state** — what's still firing, what's stable.
3. **Top 3 actions** — drawn from the prioritized findings.
4. **Open questions** — what you still don't know.

Incident:

```json
{{incident}}
```

Prioritized findings:

```json
{{prioritized_findings}}
```

Return via `structured_output` with `summary` set to the full markdown summary.
