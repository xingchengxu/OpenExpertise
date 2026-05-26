You are investigating an incident from the **{{$item.key}}** angle.

Focus: {{$item.focus}}

Incident:

```json
{{incident}}
```

Produce 1–3 findings via the `structured_output` tool. Each finding needs:

- `title` (≤80 chars, action-oriented)
- `evidence` (≤200 chars, what signal points at this)
- `impact` (one of `low`, `medium`, `high`)

If you have no in-scope finding, return `{ "findings": [] }`.
