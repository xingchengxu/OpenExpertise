import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, cpSync, rmSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { Logger } from 'pino'
import { findByName } from '../registry-data.js'

export interface InstallOpts {
  spec: string
  ref?: string
  logger: Logger
}

interface ResolvedSpec {
  name: string
  owner: string
  repo: string
  ref: string
  subpath?: string
}

function parseSpec(spec: string, overrideRef?: string): ResolvedSpec {
  // gh:user/repo[@ref]
  if (spec.startsWith('gh:')) {
    const rest = spec.slice(3)
    const atIdx = rest.indexOf('@')
    let ownerRepo: string, ref: string
    if (atIdx === -1) {
      ownerRepo = rest
      ref = overrideRef ?? 'main'
    } else {
      ownerRepo = rest.slice(0, atIdx)
      ref = overrideRef ?? rest.slice(atIdx + 1)
    }
    const [owner, repo] = ownerRepo.split('/')
    if (!owner || !repo) {
      throw new Error(`invalid gh spec "${spec}". Format: gh:owner/repo[@ref].`)
    }
    return { name: repo, owner, repo, ref }
  }
  // curated name
  const entry = findByName(spec)
  if (!entry) {
    throw new Error(
      `experience "${spec}" not found in the registry. Try \`oe registry\` to list curated experiences, or use \`oe install gh:owner/repo\` for any GitHub repo.`,
    )
  }
  return {
    name: entry.name,
    owner: entry.owner,
    repo: entry.repo,
    ref: overrideRef ?? entry.ref,
    ...(entry.subpath !== undefined ? { subpath: entry.subpath } : {}),
  }
}

export async function installCommand(opts: InstallOpts): Promise<number> {
  const resolved = parseSpec(opts.spec, opts.ref)
  const destBase = resolve('.openexpertise', 'experiences')
  const dest = join(destBase, resolved.name)

  if (existsSync(dest)) {
    opts.logger.error(
      { dest },
      `already installed at ${dest}. Remove the directory first to reinstall.`,
    )
    return 1
  }

  mkdirSync(destBase, { recursive: true })

  const cloneUrl = `https://github.com/${resolved.owner}/${resolved.repo}.git`
  opts.logger.info({ url: cloneUrl, ref: resolved.ref }, 'cloning')

  const tmp = mkdtempSync(join(tmpdir(), 'oe-install-'))
  try {
    const cloneResult = spawnSync(
      'git',
      ['clone', '--depth=1', '--branch', resolved.ref, cloneUrl, tmp],
      { encoding: 'utf8', timeout: 60_000 },
    )
    if (cloneResult.status !== 0) {
      opts.logger.error(
        { stderr: cloneResult.stderr },
        `git clone failed (ref "${resolved.ref}" may not exist as a branch/tag — try \`--ref <sha>\` or check the repo).`,
      )
      return 1
    }

    const sourcePath = resolved.subpath ? join(tmp, resolved.subpath) : tmp
    if (!existsSync(sourcePath)) {
      opts.logger.error(
        { subpath: resolved.subpath },
        `subpath "${resolved.subpath}" not found in the cloned repo.`,
      )
      return 1
    }

    // Verify experience.yaml exists
    if (!existsSync(join(sourcePath, 'experience.yaml'))) {
      opts.logger.error(
        { sourcePath },
        `experience.yaml not found at the source. This may not be a valid OE experience.`,
      )
      return 1
    }

    cpSync(sourcePath, dest, { recursive: true })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  opts.logger.info({ dest }, `installed. Run with: oe run ${dest}`)
  return 0
}
