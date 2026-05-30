import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { renderMermaid, renderMermaidHtml } from '@openexpertise/cli/render-mermaid'
import type { ToolHandler } from './types.js'

// Mirror the CLI `oe graph` resolver: accept a directory (→ <dir>/experience.yaml)
// or a yaml file directly.
function resolveExperienceYaml(input: string): string {
  const abs = resolve(input)
  if (abs.endsWith('.yaml') || abs.endsWith('.yml')) return abs
  return join(abs, 'experience.yaml')
}

export const graphTool: ToolHandler = {
  name: 'oe_graph',
  description:
    "Render an experience's DAG as a Mermaid flowchart (phase subgraphs, per-kind node " +
    'shapes/colors, for_each + conditional-when edge labels). Pure transform; no API key. ' +
    'Returns { mermaid } (paste into a GitHub README — Mermaid renders natively), or ' +
    '{ mermaid, html } when html=true (a self-contained page).',
  inputSchema: {
    type: 'object',
    required: ['experience_path'],
    properties: {
      experience_path: {
        type: 'string',
        description: 'Path to the experience directory or its experience.yaml',
      },
      direction: {
        type: 'string',
        enum: ['TD', 'LR'],
        description: 'Flowchart direction (default TD top-down; LR is left-to-right)',
      },
      html: {
        type: 'boolean',
        description: 'When true, also return a self-contained HTML page rendering the diagram',
      },
    },
  },
  async call(args) {
    const p = args['experience_path']
    if (typeof p !== 'string') throw new Error('experience_path is required')

    const yamlPath = resolveExperienceYaml(p)
    if (!existsSync(yamlPath)) {
      throw new Error(
        `experience.yaml not found at ${yamlPath}. Pass a directory containing experience.yaml or the yaml file directly.`,
      )
    }
    const source = readFileSync(yamlPath, 'utf8')
    const spec = parseExperienceYaml(source)

    const direction = args['direction']
    const mermaid = renderMermaid(
      spec,
      direction === 'TD' || direction === 'LR' ? { direction } : {},
    )
    if (args['html'] === true) {
      return { mermaid, html: renderMermaidHtml(spec, mermaid) }
    }
    return { mermaid }
  },
}
