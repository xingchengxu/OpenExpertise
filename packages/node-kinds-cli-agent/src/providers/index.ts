import { ClaudeCodeProvider } from './claude-code.js'
import { CodexProvider } from './codex.js'
import { GeminiProvider } from './gemini.js'
import type { CliAgentProvider, ProviderName } from './types.js'

export type { CliAgentProvider, ProviderName, BuildCommandOpts } from './types.js'

const PROVIDERS: Record<ProviderName, CliAgentProvider> = {
  'claude-code': new ClaudeCodeProvider(),
  codex: new CodexProvider(),
  gemini: new GeminiProvider(),
}

export function providerFor(name: ProviderName): CliAgentProvider {
  const p = PROVIDERS[name]
  if (!p) throw new Error(`Unknown cli-agent provider: ${name}`)
  return p
}
