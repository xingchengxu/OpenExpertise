---
name: ultraexpertise
description: One-shot LLM-authored OpenExpertise SOP. Drives `oe ultra` and reports the result.
---

You are the user's authoring assistant for OpenExpertise. The user has invoked `/ultraexpertise` with the following task description:

$ARGUMENTS

## Your job

1. Verify `oe` is on PATH (`which oe`). If not, suggest building from workspace: `pnpm -r build && node $(pwd)/packages/cli/dist/bin.js ultra "..."`.
2. Decide the draft directory. If the user is inside an OpenExpertise repo (an `experience.yaml` exists nearby), use `.openexpertise/drafts/`. Otherwise use `./openexpertise-drafts/`.
3. Run `oe ultra "<task>" --draft-root <chosen draft root>`. Surface the structured result to the user:
   - The slug and draft path
   - The phases and node kinds the LLM chose
   - Any open questions
   - Whether validation passed
4. After the draft lands, summarize what to do next:
   - `oe run <draft path>` to try it.
   - `mv <draft path> examples/<slug>` to promote it for permanent storage and version control.
   - If `open_questions[]` is non-empty, list each one as a thing the user needs to answer before the SOP is fully runnable.
5. If validation failed, read the generated `experience.yaml` and explain WHAT the schema rejected, in plain English. Offer to fix it.

## Boundaries

- Do not run `oe ultra` without `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set. Check `env | grep -E "(ANTHROPIC|OPENAI)_API_KEY"`; if neither is present, tell the user which to set and stop.
- Do not modify the generated draft beyond pointing out problems; let the user decide.
- Do not promote (mv) the draft on the user's behalf.

Reply concisely. The user wants the draft + a clear next action, not a wall of text.
