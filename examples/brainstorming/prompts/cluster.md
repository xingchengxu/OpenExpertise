You are clustering brainstormed ideas. The diverge step produced {{raw_ideas|length}} raw ideas across 3 angles. Group them by _theme_ — not by angle, by underlying mechanism.

Topic:

```
{{topic}}
```

Raw ideas:

```
{{raw_ideas}}
```

Produce 3-5 `clusters`, each with:

- `id`: short slug (c1, c2, ...)
- `name`: 2-4 word theme name (e.g., "Zero-config defaults", "Live failure feedback")
- `description`: one sentence about what unifies the ideas
- `idea_indices`: array of indices (0-based) into `raw_ideas` that belong to this cluster

Rules:

- Every raw_idea must be in exactly one cluster (no orphans, no duplicates).
- Clusters should be MUTUALLY EXCLUSIVE in spirit — if two clusters could trade an idea, merge them.
- Prefer fewer, denser clusters over many shallow ones.
