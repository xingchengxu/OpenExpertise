You are the synthesis lead. The brainstorm produced raw ideas → clusters → critiques. Now pick the strongest 3 ideas to act on.

Topic:

```
{{topic}}
```

Clusters:

```
{{clusters}}
```

Critiques (one per cluster, with biggest_weakness + best_idea_in_cluster):

```
{{critiques}}
```

Produce `picks` via `structured_output`:

- `top_3`: array of 3 objects, each:
  - `idea`: one sentence stating the concrete idea (often drawn from a cluster's `best_idea_in_cluster`, possibly sharpened).
  - `why_strongest`: one sentence explaining what makes this idea durable in the face of its cluster's biggest_weakness.
- `reasoning`: 2-3 sentence narrative on why these 3 over others.
- `next_actions`: 3-5 specific things to do this week to test these ideas (not "research more" — concrete experiments, fast loops).

Rules:

- Pick across clusters, not 3 from one cluster.
- Each `why_strongest` must engage with the corresponding critique's `biggest_weakness`. Don't ignore weaknesses.
