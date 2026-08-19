import { createHash } from 'node:crypto'
import { sep } from 'node:path'

/**
 * Read tracking for the edit guard, and serialization of the writes that
 * update it. Both live for the lifetime of this server process, which is
 * exactly the scope the guard protects: an edit is allowed when THIS server
 * has seen the artifact's current bytes.
 *
 * The recorded value is a digest of the content rather than an mtime, so an
 * edit is refused whenever the bytes changed — including changes a coarse
 * filesystem timestamp cannot distinguish from the read that preceded them.
 *
 * Both maps are keyed by absolute path, so two workspaces served by one
 * process never share an entry.
 */
const digests = new Map<string, string>()

interface Chain {
  tail: Promise<void>
  depth: number
}

const chains = new Map<string, Chain>()

export function digestOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function recordSeen(path: string, content: string): void {
  digests.set(path, digestOf(content))
}

export function seenDigest(path: string): string | undefined {
  return digests.get(path)
}

/** Drop every tracked artifact inside a directory that no longer exists. */
export function forgetUnder(directory: string): void {
  const prefix = directory.endsWith(sep) ? directory : `${directory}${sep}`
  for (const path of digests.keys()) {
    if (path === directory || path.startsWith(prefix)) digests.delete(path)
  }
}

/**
 * Run `operation` with no other operation on the same path in flight, so a
 * read-modify-write cycle inside this process cannot interleave with another.
 */
export async function withPathLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const existing = chains.get(path)
  const previous = existing?.tail ?? Promise.resolve()

  let release = (): void => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const chain: Chain = { tail: previous.then(() => held), depth: (existing?.depth ?? 0) + 1 }
  chains.set(path, chain)

  await previous
  try {
    return await operation()
  } finally {
    release()
    const current = chains.get(path)
    if (current) {
      current.depth -= 1
      if (current.depth === 0) chains.delete(path)
    }
  }
}
