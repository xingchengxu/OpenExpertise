# From inside Claude Code — /ultraexpertise

Run `oe ultra` without leaving your Claude Code session — install once, invoke anywhere.

## When you need this

- You are already in a Claude Code conversation and want to author an experience without switching to a terminal.
- You want Claude Code to walk you through open questions interactively after the draft lands.
- You want schema validation errors explained in plain English rather than raw AJV output.
- You are exploring whether a given workflow is a good fit for OpenExpertise before committing.

## The minimal example

Install the slash command once:

```bash
mkdir -p ~/.claude/commands
cp packages/skill-experience-creator/commands/ultraexpertise.md ~/.claude/commands/
```

Then in any Claude Code session:

```
/ultraexpertise Review my repo for OWASP Top 10 issues
```

Claude Code runs `oe ultra` with the task text, reports back the slug and draft path, lists open questions, and tells you whether validation passed.

## How it works

The file at `packages/skill-experience-creator/commands/ultraexpertise.md` is a Claude Code slash command definition. When invoked, Claude Code reads the markdown, substitutes `$ARGUMENTS` with whatever you typed after `/ultraexpertise`, and executes the instructions as a system prompt.

The command instructs Claude to:

1. **Check that `oe` is on PATH.** If not, it suggests building from the workspace: `pnpm -r build && node packages/cli/dist/bin.js ultra "..."`.
2. **Pick the draft root.** If an `experience.yaml` is nearby the slash command defaults to `.openexpertise/drafts/`; otherwise it uses `./openexpertise-drafts/`.
3. **Run `oe ultra "<task>" --draft-root <dir>`.** The full output — slug, phases, node kinds, open questions, validation result — is surfaced back to you in the chat.
4. **Summarize next steps.** `oe run <draft path>`, the `mv` to promote, and any `open_questions[]` items that need answering.
5. **Explain validation failures.** If validation fails, Claude reads the generated `experience.yaml` and describes the schema error in plain English, with an offer to fix it.

Claude will not run `oe ultra` if neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY` is set — it checks first and asks you to set the right key.

## Variations

**No `oe` binary yet — use the workspace path:**

If the CLI hasn't been installed globally, Claude Code falls back to:

```bash
node $(pwd)/packages/cli/dist/bin.js ultra "Your task here"
```

**Force a provider:**

Type a flag inline:

```
/ultraexpertise --llm openai Classify support tickets by priority
```

Claude Code passes it through to `oe ultra`.

**After the draft lands, ask follow-up questions in the same session:**

```
The draft has a fetch_pr node — what env var should I set for the GitHub token?
```

Claude knows the draft structure and can advise without re-running the command.

## Gotchas

- **The command file must be in `~/.claude/commands/`**, not `~/.claude/` or a project-local directory, for Claude Code to discover it as a slash command.
- **Claude Code will not auto-promote the draft.** Promoting (`mv draft examples/slug`) is always a user action — the command explicitly forbids it.
- **Editing the generated draft in the same session is advisory only.** Claude can point out problems and suggest fixes; applying them requires you to edit the file manually or run `oe ultra` again.
- **$ARGUMENTS is the raw text after `/ultraexpertise`.** Quotes are not required but avoid unescaped single quotes in your task description.

## See also

- [oe ultra — LLM authors for you](/guide/authoring-ultra) — the underlying CLI command
- [MCP server](/guide/mcp-server) — the `oe_ultra` MCP tool (for Codex, Gemini, and other MCP clients)
- [Skills + SKILL.md](/guide/skills) — the `SKILL.md` format the slash command is built on
