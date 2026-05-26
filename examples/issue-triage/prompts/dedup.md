Determine whether the new issue duplicates any of the similar issues below.

New issue:

```json
{{issue}}
```

Similar past issues:

```json
{{similar_issues}}
```

Return via `structured_output`:

- `is_duplicate`: boolean.
- `duplicate_of`: optional issue ID of the closest match, only if `is_duplicate=true`.
