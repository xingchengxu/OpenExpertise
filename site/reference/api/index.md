---
title: Programmatic API — Overview
---

# Programmatic API

OpenExpertise is designed to be used both from the CLI and as a library. Every action the CLI takes is available as a composable TypeScript function or class. This page lists all public packages and explains when to reach for each one.

## Workspace package map

| Package | What it exports | When to import |
|---|---|---|
| `@openexpertise/schema` | `parseExperienceYaml`, `validateExperienceSpec`, all schema types | Parsing and validating `experience.yaml` without running anything |
| `@openexpertise/core` | `runExperience`, `LLMClient`, `NodeDispatcher`, `DispatcherRegistry`, `StateStore`, `EventBus`, `RunContext` | Building a custom runner, embedding OE in your own app |
| `@openexpertise/node-kinds-tool` | `ToolDispatcher` | Registering the `tool` node kind in a custom `DispatcherRegistry` |
| `@openexpertise/node-kinds-agent` | `AgentDispatcher`, `AnthropicLLMClient` | Registering the `agent` node kind; Anthropic-backed LLM client |
| `@openexpertise/node-kinds-skill` | `SkillDispatcher` | Registering the `skill` node kind |
| `@openexpertise/node-kinds-dataset` | `DatasetDispatcher` | Registering the `dataset` node kind |
| `@openexpertise/node-kinds-experience` | `ExperienceDispatcher` | Registering the `experience` node kind (sub-experience composition) |
| `@openexpertise/node-kinds-cli-agent` | `CliAgentDispatcher` | Registering the `cli-agent` node kind (Claude Code / Codex / Gemini) |
| `@openexpertise/llm-openai` | `OpenAILLMClient` | Using an OpenAI-compatible endpoint instead of Anthropic |
| `@openexpertise/evolution` | `EvolutionAdvisor`, `EvolutionProposal` | Generating YAML improvement proposals after a run |
| `@openexpertise/authoring` | `UltraExpertise`, `AnalysisOutput`, `SynthesisOutput` | LLM-assisted `experience.yaml` authoring |
| `@openexpertise/mcp-server` | MCP server entry point | Exposing OE as an MCP tool to Claude Code |
| `@openexpertise/tui` | TUI dashboard entry point | Embedding the terminal dashboard in another CLI |
| `@openexpertise/cli` | CLI entry point | Usually invoked via `oe`; rarely imported directly |
| `@openexpertise/skill-experience-creator` | Skill definition files | The bundled SKILL.md skill used by `oe ultra` |

## Quick start

```ts
import { runExperience } from '@openexpertise/core'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher, AnthropicLLMClient } from '@openexpertise/node-kinds-agent'
import { readFileSync } from 'node:fs'

const spec = parseExperienceYaml(readFileSync('experience.yaml', 'utf8'))

const client = new AnthropicLLMClient()
const dispatchers = new DispatcherRegistry()
dispatchers.register(new ToolDispatcher())
dispatchers.register(new AgentDispatcher({ client }))

const result = await runExperience({
  spec,
  experienceDir: process.cwd(),
  dispatchers,
})

console.log(result.status, result.finalState)
```

## In this section

- [runExperience](/reference/api/run-experience) — the top-level async entry point
- [LLMClient](/reference/api/llm-client) — the provider-neutral LLM abstraction
- [NodeDispatcher](/reference/api/node-dispatcher) — interface every node kind implements
- [EvolutionAdvisor](/reference/api/evolution-advisor) — post-run improvement proposals
- [UltraExpertise](/reference/api/ultra-expertise) — LLM-driven authoring pipeline
- [StateStore](/reference/api/state-store) — SQLite blackboard wrapper
- [EventBus](/reference/api/event-bus) — structured run events
