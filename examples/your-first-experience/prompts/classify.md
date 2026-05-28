You are classifying merged pull requests for a weekly engineering digest.

Pull request:

- Number: #{{$item.number}}
- Title: {{$item.title}}
- Body: {{$item.body}}
- Author: {{$item.author}}
- Merged at: {{$item.merged_at}}

Produce `classified` via `structured_output`:

- `number`: the PR number ({{$item.number}}, copy as-is)
- `category`: one of `feature`, `fix`, `chore`, `refactor`, `docs`
  - `feature` — new user-visible capability
  - `fix` — corrects existing behavior
  - `chore` — dependency bumps, build config, non-functional housekeeping
  - `refactor` — internal restructuring without behavior change
  - `docs` — README / docs site / comments
- `summary`: one sentence (≤ 120 chars) describing the change in plain language

Output exactly one element in the `classified` array.
