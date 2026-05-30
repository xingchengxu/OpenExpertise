import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initCommand, TEMPLATES } from '../src/commands/init.js'
import type { Logger } from 'pino'

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger

describe('oe init --template', () => {
  it('lists all 4 templates with --list-templates', async () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      writes.push(String(c))
      return true
    })
    const code = await initCommand({ name: 'unused', listTemplates: true, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(0)
    const all = writes.join('')
    for (const t of TEMPLATES) {
      expect(all).toContain(t)
    }
  })

  it('scaffolds tool-only by default (backwards-compatible)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
    const target = join(base, 'my-flow')
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      writes.push(String(c))
      return true
    })
    const code = await initCommand({ name: target, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(0)
    expect(existsSync(join(target, 'experience.yaml'))).toBe(true)
    expect(existsSync(join(target, 'tools/hello.mjs'))).toBe(true)
    const yaml = readFileSync(join(target, 'experience.yaml'), 'utf8')
    expect(yaml).toContain(`name: ${target.split('/').pop()}`)
    // next-steps hints
    expect(writes.join('')).toContain('oe graph')
    rmSync(base, { recursive: true, force: true })
  })

  it('scaffolds the agent template', async () => {
    const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
    const target = join(base, 'agent-flow')
    const code = await initCommand({ name: target, template: 'agent', logger: mockLogger })
    expect(code).toBe(0)
    expect(existsSync(join(target, 'experience.yaml'))).toBe(true)
    expect(existsSync(join(target, 'prompts/classify.md'))).toBe(true)
    rmSync(base, { recursive: true, force: true })
  })

  it('scaffolds the cli-agent template', async () => {
    const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
    const target = join(base, 'cli-agent-flow')
    const code = await initCommand({ name: target, template: 'cli-agent', logger: mockLogger })
    expect(code).toBe(0)
    const yaml = readFileSync(join(target, 'experience.yaml'), 'utf8')
    expect(yaml).toContain('kind: cli-agent')
    expect(yaml).toContain('provider: claude-code')
    rmSync(base, { recursive: true, force: true })
  })

  it('scaffolds the full-pipeline template', async () => {
    const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
    const target = join(base, 'full-flow')
    const code = await initCommand({ name: target, template: 'full-pipeline', logger: mockLogger })
    expect(code).toBe(0)
    expect(existsSync(join(target, 'tools/load_input.mjs'))).toBe(true)
    expect(existsSync(join(target, 'tools/save_output.mjs'))).toBe(true)
    expect(existsSync(join(target, 'prompts/classify.md'))).toBe(true)
    expect(existsSync(join(target, 'fixtures/input.txt'))).toBe(true)
    rmSync(base, { recursive: true, force: true })
  })

  it('rejects unknown template names', async () => {
    const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
    const target = join(base, 'bogus')
    const code = await initCommand({ name: target, template: 'nope' as never, logger: mockLogger })
    expect(code).toBe(1)
    rmSync(base, { recursive: true, force: true })
  })

  it('refuses to overwrite an existing directory', async () => {
    const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
    const target = join(base, 'existing')
    // create it first
    await initCommand({ name: target, logger: mockLogger })
    // second call should fail
    const code = await initCommand({ name: target, logger: mockLogger })
    expect(code).toBe(1)
    rmSync(base, { recursive: true, force: true })
  })

  it('each scaffolded experience.yaml validates as legal YAML and the parser accepts it', async () => {
    const { parseExperienceYaml } = await import('@openexpertise/schema')
    for (const t of TEMPLATES) {
      const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
      const target = join(base, `flow-${t}`)
      const code = await initCommand({ name: target, template: t, logger: mockLogger })
      expect(code).toBe(0)
      const yaml = readFileSync(join(target, 'experience.yaml'), 'utf8')
      const spec = parseExperienceYaml(yaml)
      expect(spec.name).toBe(`flow-${t}`)
      expect(spec.graph.nodes.length).toBeGreaterThanOrEqual(1)
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('scaffolded experience.yaml has yaml-language-server header and experience.schema.json is valid', async () => {
    const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
    const target = join(base, 'editor-test')
    const code = await initCommand({ name: target, template: 'tool-only', logger: mockLogger })
    expect(code).toBe(0)

    // First line must be the yaml-language-server header
    const yaml = readFileSync(join(target, 'experience.yaml'), 'utf8')
    const firstLine = yaml.split('\n')[0]
    expect(firstLine).toContain('yaml-language-server: $schema=./experience.schema.json')

    // Schema file must exist and parse to an object with a $schema key
    const schemaPath = join(target, 'experience.schema.json')
    expect(existsSync(schemaPath)).toBe(true)
    const schemaObj = JSON.parse(readFileSync(schemaPath, 'utf8'))
    expect(schemaObj).toHaveProperty('$schema')

    rmSync(base, { recursive: true, force: true })
  })

  it('header is injected for all templates', async () => {
    for (const t of TEMPLATES) {
      const base = mkdtempSync(join(tmpdir(), 'oe-init-test-'))
      const target = join(base, `hdr-${t}`)
      const code = await initCommand({ name: target, template: t, logger: mockLogger })
      expect(code).toBe(0)
      const yaml = readFileSync(join(target, 'experience.yaml'), 'utf8')
      expect(yaml.split('\n')[0]).toContain(
        'yaml-language-server: $schema=./experience.schema.json',
      )
      expect(existsSync(join(target, 'experience.schema.json'))).toBe(true)
      rmSync(base, { recursive: true, force: true })
    }
  })
})
