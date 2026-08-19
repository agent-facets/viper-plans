import { randomBytes } from 'node:crypto'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/**
 * Replace a file's contents in one step: write a sibling temporary file, then
 * rename it over the target. A reader either sees the previous content or the
 * new content, never a partial write.
 *
 * The temporary name carries the pid and random bytes because two writers
 * sharing one predictable temp path corrupt each other's output.
 */
export async function atomicWriteFile(path: string, data: string): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(temporary, data, 'utf8')
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
