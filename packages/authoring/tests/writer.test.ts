import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeDraft, PathTraversalError } from '../src/writer.js'

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('writeDraft', () => {
  it('writes experience.yaml + supporting files to the draft dir', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    const result = await writeDraft({
      draftDir: dir,
      experienceYaml: 'name: x\nversion: 0.1.0\n',
      files: [
        { path: 'tools/a.mjs', content: 'export default async () => ({})\n' },
        { path: 'prompts/b.md', content: '# b\n' },
        { path: 'README.md', content: '# x\n' },
      ],
    })
    expect(result.files_written.sort()).toEqual(
      ['README.md', 'experience.yaml', 'prompts/b.md', 'tools/a.mjs'].sort(),
    )
    expect(readFileSync(join(dir, 'experience.yaml'), 'utf8')).toContain('name: x')
    expect(readFileSync(join(dir, 'tools/a.mjs'), 'utf8')).toContain('export default')
    expect(existsSync(join(dir, 'prompts/b.md'))).toBe(true)
  })

  it('rejects absolute paths in files[]', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    await expect(
      writeDraft({
        draftDir: dir,
        experienceYaml: 'name: x\n',
        files: [{ path: '/etc/passwd-clone', content: 'oops' }],
      }),
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('rejects parent-directory traversal', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    await expect(
      writeDraft({
        draftDir: dir,
        experienceYaml: 'name: x\n',
        files: [{ path: '../escape.txt', content: 'x' }],
      }),
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('rejects paths attempting to escape via normalization', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    await expect(
      writeDraft({
        draftDir: dir,
        experienceYaml: 'name: x\n',
        files: [{ path: 'a/../../escape.txt', content: 'x' }],
      }),
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('creates parent directories as needed', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    await writeDraft({
      draftDir: dir,
      experienceYaml: 'name: x\n',
      files: [{ path: 'deep/nested/file.txt', content: 'ok' }],
    })
    expect(readFileSync(join(dir, 'deep/nested/file.txt'), 'utf8')).toBe('ok')
  })
})
