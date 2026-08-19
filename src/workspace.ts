import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ARTIFACT_EXTENSION, PLANS_DIRECTORY } from './contracts.js'

/**
 * The directory plans are stored beneath. MCP roots would be the protocol's
 * answer here, but they are deprecated as of the 2026-07-28 revision, so the
 * server takes the working directory the host launched it in — the same
 * project directory the VIPER commands read and write through their fallback
 * file operations.
 */
export async function resolveWorkspaceRoot(): Promise<string> {
  return await realpath(process.cwd())
}

export function plansDirectory(root: string): string {
  return join(root, ...PLANS_DIRECTORY)
}

export function planDirectory(root: string, plan: string): string {
  return join(plansDirectory(root), plan)
}

export function artifactPath(root: string, plan: string, artifact: string): string {
  return join(planDirectory(root, plan), `${artifact}${ARTIFACT_EXTENSION}`)
}

export type ContainmentResult = { ok: true; path: string } | { ok: false; path: string; message: string }

/**
 * Confirm a path really lives beneath the plans directory once symlinks are
 * followed. The name grammar already rules out traversal in what a caller
 * sends, so this catches the case the grammar cannot see: a plan directory or
 * artifact on disk that is a symlink out of the workspace.
 */
export async function ensureContained(root: string, target: string): Promise<ContainmentResult> {
  const plansRoot = plansDirectory(root)
  const lexical = resolve(target)
  if (lexical !== target || !isUnder(plansRoot, lexical)) {
    return { ok: false, path: target, message: `${target} is outside the plans directory` }
  }

  const [resolvedRoot, resolvedTarget] = await Promise.all([
    resolveThroughLinks(plansRoot),
    resolveThroughLinks(target),
  ])
  if (!isUnder(resolvedRoot, resolvedTarget)) {
    return {
      ok: false,
      path: target,
      message: `${target} resolves to ${resolvedTarget}, which is outside the plans directory`,
    }
  }
  return { ok: true, path: target }
}

function isUnder(parent: string, candidate: string): boolean {
  if (candidate === parent) return true
  const rel = relative(parent, candidate)
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
}

/**
 * Resolve `target` against the filesystem as far as it exists, then re-append
 * the segments that do not exist yet. `realpath` alone cannot be used because
 * a plan directory is routinely created by the very call being checked.
 */
async function resolveThroughLinks(target: string): Promise<string> {
  const pending: string[] = []
  let current = resolve(target)

  for (;;) {
    try {
      const real = await realpath(current)
      return pending.length === 0 ? real : join(real, ...pending)
    } catch {
      const parent = resolve(current, '..')
      if (parent === current) return join(current, ...pending)
      const segment = relative(parent, current)
      pending.unshift(segment)
      current = parent
    }
  }
}
