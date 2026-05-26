# experience-creator

An OpenExpertise authoring skill for Claude Code. Drop into your global skills folder, then ask Claude to create an experience.

## Install

```bash
mkdir -p ~/.claude/skills
cp -R packages/skill-experience-creator ~/.claude/skills/experience-creator
```

(From the OpenExpertise repo root.)

## Use

In Claude Code, just describe what you want:

> Create an OpenExpertise experience for my team's PR review process.

The skill picks up the request, walks through the design (purpose, unit of work, state schema, node kinds), drafts `experience.yaml` + scaffold files, validates with `oe validate`, and offers a dry-run.

## What's inside

| Path                              | What it is                                                             |
| --------------------------------- | ---------------------------------------------------------------------- |
| `SKILL.md`                        | The skill entry point Claude reads.                                    |
| `references/api-reference.md`     | Complete `experience.yaml` field reference (every kind, every option). |
| `references/patterns.md`          | Copy-paste shapes for common topologies.                               |
| `references/lessons.md`           | Hard-won gotchas from V1 development.                                  |
| `assets/templates/*.yaml`         | Five starter templates.                                                |
| `assets/examples/`                | Two full worked examples, with mappings to techniques.                 |
| `scripts/validate-experience.mjs` | Standalone validator usable independently of the `oe` CLI.             |

## Slash command

The package also ships a Claude Code slash command at `commands/ultraexpertise.md`. After installing:

```bash
mkdir -p ~/.claude/commands
cp packages/skill-experience-creator/commands/ultraexpertise.md ~/.claude/commands/
```

You can then type `/ultraexpertise <task description>` inside any Claude Code session and the assistant will drive `oe ultra` for you, surfacing the analysis + draft path + open questions.
