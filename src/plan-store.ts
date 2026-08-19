import { access, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { atomicWriteFile } from './atomic-write.js'
import {
  ARTIFACT_EXTENSION,
  type DeletePlanArgs,
  type DeletePlanResult,
  type EditPlanArgs,
  type EditPlanResult,
  isValidName,
  type ListPlansResult,
  normalizeArtifact,
  type ReadPlanArgs,
  type ReadPlanResult,
  type WritePlanArgs,
  type WritePlanResult,
} from './contracts.js'
import { digestOf, forgetUnder, recordSeen, seenDigest, withPathLock } from './read-tracker.js'
import { artifactPath, ensureContained, planDirectory, plansDirectory } from './workspace.js'

export async function writePlan(root: string, args: WritePlanArgs): Promise<WritePlanResult> {
  if (args.content.trim() === '') {
    return { success: false, reason: 'empty_content', message: 'Plan content must not be empty.' }
  }
  const target = await resolveArtifactTarget(root, args.plan, args.artifact)
  if (!target.ok) return target.failure
  const { artifact, path } = target

  return await withPathLock(path, async () => {
    try {
      await mkdir(planDirectory(root, args.plan), { recursive: true })
      await atomicWriteFile(path, args.content)
    } catch (error) {
      return ioError('write', error)
    }
    recordSeen(path, args.content)
    return { success: true, plan: args.plan, artifact, path }
  })
}

export async function readPlan(root: string, args: ReadPlanArgs): Promise<ReadPlanResult> {
  const target = await resolveArtifactTarget(root, args.plan, args.artifact)
  if (!target.ok) return target.failure
  const { artifact, path } = target

  return await withPathLock(path, async () => {
    let content: string
    try {
      content = await readFile(path, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return notFound(args.plan, artifact)
      return ioError('read', error)
    }
    recordSeen(path, content)
    return { success: true, plan: args.plan, artifact, path, content }
  })
}

export async function editPlan(root: string, args: EditPlanArgs): Promise<EditPlanResult> {
  const target = await resolveArtifactTarget(root, args.plan, args.artifact)
  if (!target.ok) return target.failure
  const { artifact, path } = target

  return await withPathLock(path, async () => {
    let current: string
    try {
      current = await readFile(path, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return notFound(args.plan, artifact)
      return ioError('read', error)
    }

    const seen = seenDigest(path)
    if (seen === undefined) {
      return {
        success: false,
        reason: 'must_read_first',
        plan: args.plan,
        artifact,
        message: `Read ${artifact} with viper-read-plan (or write it with viper-write-plan) before editing it.`,
      }
    }
    if (seen !== digestOf(current)) {
      return {
        success: false,
        reason: 'stale_read',
        plan: args.plan,
        artifact,
        message: `${artifact} changed since it was last read. Re-read it with viper-read-plan before editing.`,
      }
    }
    if (args.oldString === args.newString) {
      return {
        success: false,
        reason: 'no_change',
        plan: args.plan,
        artifact,
        message: 'oldString and newString are identical, so the edit would change nothing.',
      }
    }

    const matches = countOccurrences(current, args.oldString)
    if (matches === 0) {
      return {
        success: false,
        reason: 'old_string_not_found',
        plan: args.plan,
        artifact,
        message: `oldString does not appear in ${artifact}.`,
      }
    }
    if (matches > 1 && args.replaceAll !== true) {
      return {
        success: false,
        reason: 'ambiguous_match',
        plan: args.plan,
        artifact,
        count: matches,
        message: `oldString appears ${matches} times. Add surrounding context to make it unique, or set replaceAll.`,
      }
    }

    const updated = replaceLiteral(current, args.oldString, args.newString, args.replaceAll === true)
    try {
      await atomicWriteFile(path, updated)
    } catch (error) {
      return ioError('write', error)
    }
    recordSeen(path, updated)
    return {
      success: true,
      plan: args.plan,
      artifact,
      path,
      replacements: args.replaceAll === true ? matches : 1,
    }
  })
}

export async function listPlans(root: string): Promise<ListPlansResult> {
  const directory = plansDirectory(root)
  let names: string[]
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { success: true, plans: [] }
    return ioError('list', error)
  }

  const plans: { name: string; artifacts: string[] }[] = []
  for (const name of names.sort()) {
    if (!isValidName(name)) continue
    const contained = await ensureContained(root, planDirectory(root, name))
    if (!contained.ok) continue

    let files: string[]
    try {
      files = await readdir(contained.path)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') continue
      return ioError('list', error)
    }

    const artifacts = files
      .filter((file) => file.endsWith(ARTIFACT_EXTENSION))
      .map((file) => file.slice(0, -ARTIFACT_EXTENSION.length))
      .filter(isValidName)
      .sort()
    plans.push({ name, artifacts })
  }
  return { success: true, plans }
}

export async function deletePlan(root: string, args: DeletePlanArgs): Promise<DeletePlanResult> {
  if (!isValidName(args.plan)) return invalidName(args.plan)

  const directory = planDirectory(root, args.plan)
  const contained = await ensureContained(root, directory)
  if (!contained.ok) return unsafePath(contained.path, contained.message)

  return await withPathLock(directory, async () => {
    try {
      await access(directory)
    } catch {
      return {
        success: false,
        reason: 'plan_not_found',
        plan: args.plan,
        message: `No plan named ${args.plan} exists.`,
      }
    }
    try {
      await rm(directory, { recursive: true, force: true })
    } catch (error) {
      return ioError('delete', error)
    }
    forgetUnder(directory)
    return { success: true, plan: args.plan, path: directory }
  })
}

// ---------------------------------------------------------------------------
// Shared failures and text helpers
// ---------------------------------------------------------------------------

type ArtifactTarget =
  | { ok: true; artifact: string; path: string }
  | { ok: false; failure: ReturnType<typeof invalidName | typeof invalidArtifact | typeof unsafePath> }

/**
 * The guard every artifact-addressed operation shares: a valid plan name, a
 * normalized and valid artifact name, and a resolved path that really lives
 * beneath the plans directory.
 */
async function resolveArtifactTarget(
  root: string,
  plan: string,
  requestedArtifact: string | undefined,
): Promise<ArtifactTarget> {
  if (!isValidName(plan)) return { ok: false, failure: invalidName(plan) }

  const artifact = normalizeArtifact(requestedArtifact)
  if (!isValidName(artifact)) return { ok: false, failure: invalidArtifact(artifact) }

  const path = artifactPath(root, plan, artifact)
  const contained = await ensureContained(root, path)
  if (!contained.ok) return { ok: false, failure: unsafePath(contained.path, contained.message) }

  return { ok: true, artifact, path }
}

function invalidName(name: string): { success: false; reason: 'invalid_name'; name: string; message: string } {
  return {
    success: false,
    reason: 'invalid_name',
    name,
    message: `"${name}" is not a valid plan name. Use letters, digits, hyphens, and underscores, starting with a letter or digit.`,
  }
}

function invalidArtifact(artifact: string): {
  success: false
  reason: 'invalid_artifact'
  artifact: string
  message: string
} {
  return {
    success: false,
    reason: 'invalid_artifact',
    artifact,
    message: `"${artifact}" is not a valid artifact name. Use letters, digits, hyphens, and underscores, starting with a letter or digit.`,
  }
}

function notFound(
  plan: string,
  artifact: string,
): { success: false; reason: 'not_found'; plan: string; artifact: string; message: string } {
  return {
    success: false,
    reason: 'not_found',
    plan,
    artifact,
    message: `${plan}/${artifact} does not exist.`,
  }
}

function unsafePath(
  path: string,
  message: string,
): { success: false; reason: 'unsafe_path'; path: string; message: string } {
  return { success: false, reason: 'unsafe_path', path, message }
}

function ioError(
  operation: string,
  error: unknown,
): { success: false; reason: 'io_error'; operation: string; message: string } {
  return { success: false, reason: 'io_error', operation, message: describeError(error) }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    if (typeof code === 'string') return code
  }
  return undefined
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/**
 * Replace without `String.prototype.replace`: a plan can legitimately contain
 * `$&`, `` $` ``, or `$1`, which that method would expand inside `newString`.
 */
function replaceLiteral(source: string, oldString: string, newString: string, all: boolean): string {
  if (all) return source.split(oldString).join(newString)
  const index = source.indexOf(oldString)
  return source.slice(0, index) + newString + source.slice(index + oldString.length)
}
