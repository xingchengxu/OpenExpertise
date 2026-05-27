# Deployment

This page covers every path from source to production: local development, CI, containerized server deployment, secrets management, and the SQLite state portability model.

---

## Local development (from source)

The repo is a pnpm workspace with 15 packages. Everything is built with `tsc -b`.

```bash
git clone https://github.com/xingchengxu/OpenExpertise
cd OpenExpertise

pnpm install          # installs all workspace deps
pnpm -r build         # tsc -b across all 15 packages

# Run the CLI directly from the built output
node packages/cli/dist/bin.js run examples/hello-tool
node packages/cli/dist/bin.js --help
```

You do not need a global install for development. The `node packages/cli/dist/bin.js` path is stable as long as you have run `pnpm -r build` at least once.

::: tip After editing a package
Rebuild only the changed package and its dependents:

```bash
pnpm --filter @openexpertise/core build
pnpm --filter @openexpertise/cli build
```

:::

---

## Global install (recommended for production)

```bash
npm install -g @openexpertise/cli
oe --version
oe run examples/hello-tool
```

The global binary resolves `oe` on PATH. All other workspace packages (`@openexpertise/core`, etc.) are bundled as dependencies of `@openexpertise/cli` and do not need separate installation.

---

## CI — GitHub Actions

The project ships a workflow at `.github/workflows/ci.yml` that runs on every push to `main` and on every pull request. It tests across Node 20, 22, and 24 in parallel.

```yaml
# .github/workflows/ci.yml (full, as shipped)
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ['20', '22', '24']
    name: test (node ${{ matrix.node }})
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test
```

To add API-key-dependent live smoke tests in CI, add an environment secret (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) and a separate job or conditional step. Gate it on `github.event_name == 'push'` to avoid burning tokens on every PR.

---

## Secrets management

OpenExpertise reads API keys exclusively from environment variables. No configuration file for secrets.

| Variable            | Required for                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | `agent` nodes with Anthropic models; `oe evolve`; `oe ultra`      |
| `OPENAI_API_KEY`    | `agent` nodes with `--llm openai`; any OpenAI-compatible endpoint |
| `OPENAI_BASE_URL`   | Override the OpenAI API endpoint (vLLM, Ollama, Azure, etc.)      |

For `cli-agent` nodes, the underlying CLI (Claude Code, Codex, Gemini) is responsible for its own auth. OE spawns the binary as a subprocess and inherits the environment, so any key the CLI needs must be present in the environment that spawns `oe run`.

::: warning Never commit API keys
The `.openexpertise/` directory is already in `.gitignore`. Confirm your experience-local `.env` file (if any) is also ignored.
:::

### Example: pass secrets via environment in CI

```yaml
- name: Run experience
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: oe run examples/review-branch
```

---

## Server / container deployment

### Minimal Dockerfile

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install --frozen-lockfile && pnpm -r build

FROM node:22-slim AS runtime
WORKDIR /app
# Only copy the built packages needed at runtime
COPY --from=build /app/packages/cli/dist ./packages/cli/dist
COPY --from=build /app/packages/cli/package.json ./packages/cli/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/schema/dist ./packages/schema/dist
COPY --from=build /app/packages/node-kinds-tool/dist ./packages/node-kinds-tool/dist
COPY --from=build /app/packages/node-kinds-agent/dist ./packages/node-kinds-agent/dist
COPY --from=build /app/packages/node-kinds-skill/dist ./packages/node-kinds-skill/dist
COPY --from=build /app/packages/node-kinds-dataset/dist ./packages/node-kinds-dataset/dist
COPY --from=build /app/packages/node-kinds-experience/dist ./packages/node-kinds-experience/dist
COPY --from=build /app/packages/node-kinds-cli-agent/dist ./packages/node-kinds-cli-agent/dist
COPY --from=build /app/packages/llm-openai/dist ./packages/llm-openai/dist
COPY --from=build /app/packages/evolution/dist ./packages/evolution/dist
COPY --from=build /app/packages/authoring/dist ./packages/authoring/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/examples ./examples

ENV NODE_ENV=production
ENTRYPOINT ["node", "packages/cli/dist/bin.js"]
```

::: tip Simpler alternative
Build the full workspace in the container and use the monorepo `node packages/cli/dist/bin.js` invocation path. The Dockerfile above shows a multi-stage approach for smaller images; for most internal deployments a single-stage build is fine.
:::

### Persistent state via volume mount

SQLite state is stored under the experience directory at `.openexpertise/state.sqlite`. To persist state across container restarts, mount the `.openexpertise/` directory as a volume:

```yaml
# docker-compose.yml
services:
  oe-runner:
    image: my-registry/openexpertise:latest
    volumes:
      - ./state/review-branch:/app/examples/review-branch/.openexpertise
    environment:
      ANTHROPIC_API_KEY: '${ANTHROPIC_API_KEY}'
    command: ['run', 'examples/review-branch', '--evolve']
```

The volume ensures that:

- `state.sqlite` accumulates findings across runs (merge strategies like `array_append` depend on this).
- `runs/*.jsonl` files are preserved for post-run `oe inspect` and `oe evolve`.
- Cache files survive restarts, so resumed runs skip already-completed nodes.

### Custom SQLite path

Use `state.store` in `experience.yaml` to point the SQLite file at a path outside the experience directory — useful for shared state across deployments or when the experience files are read-only:

```yaml
state:
  store: /mnt/persistent/my-experience.sqlite
  schema:
    findings: { type: array, items: { type: object }, merge: array_append }
```

---

## Self-hosted LLMs (vLLM, Ollama)

Point the OpenAI client at any OpenAI-compatible endpoint:

```bash
export OPENAI_API_KEY=anything-the-server-accepts
export OPENAI_BASE_URL=http://your-vllm-host:8000/v1
oe run examples/oncall-runbook --llm openai
```

No code change needed. The `@openexpertise/llm-openai` client passes `OPENAI_BASE_URL` directly to the OpenAI SDK.

---

## Scaling considerations

| Concern                | Guidance                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrent runs**    | Each `oe run` opens its own SQLite file. Multiple concurrent runs of the same experience write to the same `state.sqlite`; SQLite WAL mode handles concurrent reads safely, but avoid concurrent writes to the same field. Use different experience directories or `state.store` paths for true isolation. |
| **Long-running nodes** | `cli-agent` nodes default to a 10-minute timeout (`timeout_ms: 600000`). Increase per-node via `timeout_ms:` in YAML.                                                                                                                                                                                      |
| **429 rate limits**    | Anthropic and OpenAI clients retry with exponential backoff (4 attempts, base 1 s, doubles each attempt). For high-concurrency flows, set `--concurrency 1` or `runtime.concurrency: 1` until you've measured your quota headroom.                                                                         |
| **Large JSONL logs**   | Event logs grow proportionally to run complexity. Rotate or archive `.openexpertise/runs/` periodically. There is no built-in retention policy in V1.                                                                                                                                                      |

---

## See also

- [Architecture overview](/operations/architecture)
- [Guide: Concurrency and 429 retry](/guide/concurrency)
- [Guide: Resume and cache](/guide/resume-cache)
- [Guide: Self-hosted LLMs](/guide/self-hosted-llm)
- [CLI: `oe doctor`](/reference/cli/doctor)
