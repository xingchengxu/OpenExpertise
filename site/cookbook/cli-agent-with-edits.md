---
title: CLI agent with file edits
description: Use a cli-agent node to let Claude Code, Codex, or Gemini CLI make real file edits during a flow.
---

# CLI agent with file edits

## Problem

You want an AI coding CLI — Claude Code, Codex, or Gemini — to actually edit files on disk during a flow: fix a bug, apply a refactor, write a stub. A plain `agent` node produces structured text; a `cli-agent` node with edit access lets the CLI's native file-edit tools do the real work.

## Solution

```yaml
state:
  schema:
    branch_name: { type: string }
    diff: { type: string }
    review: { type: object }
    edit_summary: { type: string }

graph:
  nodes:
    - id: get_diff
      kind: tool
      impl: ./tools/git_diff.mjs
      writes: [diff, branch_name]

    - id: review
      kind: agent
      prompt: ./prompts/review.md
      reads: [diff]
      schema:
        type: object
        properties:
          issues:
            type: array
            items:
              type: object
              properties:
                file: { type: string }
                line: { type: number }
                description: { type: string }
                fix: { type: string }
              required: [file, description, fix]
        required: [issues]
        additionalProperties: false
      writes: [review]

    - id: apply_fixes
      kind: cli-agent
      provider: claude-code # or codex / gemini
      prompt: |
        You are fixing code issues found in a review.
        Branch: {{branch_name}}
        Issues to fix (JSON):
        {{review}}

        For each issue, use your Edit or Write tools to apply the fix in the file at the line indicated.
        After all edits, summarize what you changed in one paragraph.
      reads: [branch_name, review]
      allow_file_edits: true # opt-in: without this, file-edit tools are blocked
      working_dir: '.' # relative to the experience root
      schema:
        type: object
        properties:
          edit_summary: { type: string }
        required: [edit_summary]
        additionalProperties: false
      writes: [edit_summary]

    - id: commit
      kind: tool
      impl: ./tools/git_commit.mjs
      reads: [branch_name, edit_summary]

  edges:
    - { from: get_diff, to: review }
    - { from: review, to: apply_fixes, when: 'length($.review.issues) > 0' }
    - { from: apply_fixes, to: commit }
```

## Walkthrough

<div v-pre>

`kind: cli-agent` wraps a CLI agent session. The `provider` key selects which CLI to invoke: `claude-code`, `codex`, or `gemini`. The prompt is a Mustache template — `{{branch_name}}` and `{{review}}` are interpolated from state at dispatch time.

</div>

`allow_file_edits: true` explicitly opts in to letting the CLI agent use its native file-manipulation tools (Edit, Write, Bash with write access). Without it, those tool calls are blocked at the sandbox level — the agent can still _read_ files. This is the safest default: you know exactly which nodes in the graph can mutate the filesystem.

The `when:` guard on the edge from `review` to `apply_fixes` skips the edit step entirely if the review found no issues. This avoids launching a CLI session unnecessarily.

`apply_fixes` still declares a `schema` for its output. The CLI session must end with a structured JSON response matching the schema; the runtime validates it with AJV. This gives you a typed `edit_summary` in state that the `commit` tool can embed in the commit message.

## Variations

- **Multi-CLI chain:** Feed the output of a `claude-code` edit into a `codex` verification step — see [Example: tri-cli-orchestration](/examples/tri-cli-orchestration).
- **Scoped sandbox:** Set `working_dir` to a subdirectory to restrict file access to a subset of the repo. The CLI still runs from the repo root for `git` commands, but file-edit tool calls outside `working_dir` are rejected.
- **Human-in-the-loop before edits:** Insert a `kind: tool` node that prints a diff preview and prompts for confirmation (`process.stdin`) before `apply_fixes` runs.

## See also

- [Guide: cli-agent node](/guide/cli-agent-usage)
- [Concepts: node-cli-agent](/concepts/node-cli-agent)
- [Example: review-branch](/examples/review-branch)
- [Example: tri-cli-orchestration](/examples/tri-cli-orchestration)
