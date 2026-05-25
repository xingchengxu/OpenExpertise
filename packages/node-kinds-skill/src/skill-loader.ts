import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute, join } from 'node:path'
import matter from 'gray-matter'

export interface SkillFrontmatter {
  name?: string
  description?: string
  [k: string]: unknown
}

export interface LoadedSkill {
  dir: string
  frontmatter: SkillFrontmatter
  body: string
}

export function loadSkillFile(skillDir: string, experienceDir?: string): LoadedSkill {
  const abs = isAbsolute(skillDir)
    ? skillDir
    : experienceDir
      ? resolve(experienceDir, skillDir)
      : resolve(skillDir)
  const skillMdPath = join(abs, 'SKILL.md')
  if (!existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found in skill directory: ${abs} (looked for ${skillMdPath})`)
  }
  const source = readFileSync(skillMdPath, 'utf8')
  const parsed = matter(source)
  return {
    dir: abs,
    frontmatter: parsed.data as SkillFrontmatter,
    body: parsed.content,
  }
}
