import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeArtifact } from '../src/contracts.js'
import { deletePlan, editPlan, listPlans, readPlan, writePlan } from '../src/plan-store.js'
import { artifactPath, ensureContained, planDirectory, plansDirectory } from '../src/workspace.js'

let root: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'viper-plans-')))
})

describe('names and artifacts', () => {
  test('normalizeArtifact defaults and strips one .md', () => {
    expect(normalizeArtifact(undefined)).toBe('plan')
    expect(normalizeArtifact('plan.md')).toBe('plan')
    expect(normalizeArtifact('notes')).toBe('notes')
    expect(normalizeArtifact('notes.md.md')).toBe('notes.md')
  })

  test('rejects a traversal plan name', async () => {
    const result = await writePlan(root, { plan: '../escape', content: 'x' })
    expect(result).toEqual({
      success: false,
      reason: 'invalid_name',
      name: '../escape',
      message: expect.stringContaining('not a valid plan name'),
    })
  })

  test('rejects a traversal artifact name', async () => {
    const result = await writePlan(root, { plan: 'demo', artifact: '../escape', content: 'x' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('invalid_artifact')
  })

  test('read and write agree on a .md suffix', async () => {
    await writePlan(root, { plan: 'demo', artifact: 'plan.md', content: 'body' })
    const read = await readPlan(root, { plan: 'demo', artifact: 'plan.md' })
    expect(read.success).toBe(true)
    if (!read.success) throw new Error('unreachable')
    expect(read.content).toBe('body')
    expect(read.artifact).toBe('plan')
  })
})

describe('writePlan', () => {
  test('creates the plan directory and the artifact', async () => {
    const result = await writePlan(root, { plan: 'demo', content: '# Plan\n' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unreachable')
    expect(result.path).toBe(artifactPath(root, 'demo', 'plan'))
    expect(await readFile(result.path, 'utf8')).toBe('# Plan\n')
  })

  test('rejects whitespace-only content', async () => {
    const result = await writePlan(root, { plan: 'demo', content: '   \n' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('empty_content')
  })

  test('replaces existing content and leaves no temporary file behind', async () => {
    await writePlan(root, { plan: 'demo', content: 'first' })
    await writePlan(root, { plan: 'demo', content: 'second' })
    expect(await readFile(artifactPath(root, 'demo', 'plan'), 'utf8')).toBe('second')
    expect(await readdir(planDirectory(root, 'demo'))).toEqual(['plan.md'])
  })

  test('concurrent writes to one artifact all land intact', async () => {
    const bodies = Array.from({ length: 8 }, (_, index) => `body-${index}\n`)
    const results = await Promise.all(bodies.map((content) => writePlan(root, { plan: 'demo', content })))
    expect(results.every((result) => result.success)).toBe(true)
    expect(bodies).toContain(await readFile(artifactPath(root, 'demo', 'plan'), 'utf8'))
    expect(await readdir(planDirectory(root, 'demo'))).toEqual(['plan.md'])
  })
})

describe('readPlan', () => {
  test('reports a missing artifact', async () => {
    const result = await readPlan(root, { plan: 'missing' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('not_found')
  })
})

describe('editPlan', () => {
  test('requires a read before editing', async () => {
    await mkdir(planDirectory(root, 'demo'), { recursive: true })
    await writeFile(artifactPath(root, 'demo', 'plan'), 'alpha beta', 'utf8')

    const result = await editPlan(root, { plan: 'demo', oldString: 'alpha', newString: 'gamma' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('must_read_first')
  })

  test('a write counts as a read', async () => {
    await writePlan(root, { plan: 'demo', content: 'alpha beta' })
    const result = await editPlan(root, { plan: 'demo', oldString: 'alpha', newString: 'gamma' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unreachable')
    expect(result.replacements).toBe(1)
    expect(await readFile(result.path, 'utf8')).toBe('gamma beta')
  })

  test('refuses an edit when the content changed since it was seen', async () => {
    await writePlan(root, { plan: 'demo', content: 'alpha' })
    await writeFile(artifactPath(root, 'demo', 'plan'), 'changed underneath', 'utf8')

    const result = await editPlan(root, { plan: 'demo', oldString: 'changed', newString: 'other' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('stale_read')
  })

  test('rejects an identical replacement', async () => {
    await writePlan(root, { plan: 'demo', content: 'alpha' })
    const result = await editPlan(root, { plan: 'demo', oldString: 'alpha', newString: 'alpha' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('no_change')
  })

  test('reports a missing oldString', async () => {
    await writePlan(root, { plan: 'demo', content: 'alpha' })
    const result = await editPlan(root, { plan: 'demo', oldString: 'zeta', newString: 'omega' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('old_string_not_found')
  })

  test('refuses an ambiguous match and reports the count', async () => {
    await writePlan(root, { plan: 'demo', content: 'x x x' })
    const result = await editPlan(root, { plan: 'demo', oldString: 'x', newString: 'y' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('ambiguous_match')
    if (result.reason !== 'ambiguous_match') throw new Error('unreachable')
    expect(result.count).toBe(3)
  })

  test('replaceAll replaces every occurrence', async () => {
    await writePlan(root, { plan: 'demo', content: 'x x x' })
    const result = await editPlan(root, { plan: 'demo', oldString: 'x', newString: 'y', replaceAll: true })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unreachable')
    expect(result.replacements).toBe(3)
    expect(await readFile(result.path, 'utf8')).toBe('y y y')
  })

  test('replacement text is literal, not a regex expansion', async () => {
    await writePlan(root, { plan: 'demo', content: 'cost: PLACEHOLDER' })
    const result = await editPlan(root, { plan: 'demo', oldString: 'PLACEHOLDER', newString: '$& $1 $`' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unreachable')
    expect(await readFile(result.path, 'utf8')).toBe('cost: $& $1 $`')
  })

  test('reports a missing artifact before the read guard', async () => {
    const result = await editPlan(root, { plan: 'demo', oldString: 'a', newString: 'b' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('not_found')
  })
})

describe('listPlans', () => {
  test('returns an empty list when nothing has been written', async () => {
    expect(await listPlans(root)).toEqual({ success: true, plans: [] })
  })

  test('lists plans and artifacts in a stable order, ignoring stray entries', async () => {
    await writePlan(root, { plan: 'beta', content: 'b' })
    await writePlan(root, { plan: 'alpha', content: 'a' })
    await writePlan(root, { plan: 'alpha', artifact: 'notes', content: 'n' })
    await writeFile(join(plansDirectory(root), 'loose.md'), 'ignored', 'utf8')
    await writeFile(join(planDirectory(root, 'alpha'), 'notes.txt'), 'ignored', 'utf8')
    await mkdir(join(plansDirectory(root), '.hidden'), { recursive: true })

    expect(await listPlans(root)).toEqual({
      success: true,
      plans: [
        { name: 'alpha', artifacts: ['notes', 'plan'] },
        { name: 'beta', artifacts: ['plan'] },
      ],
    })
  })
})

describe('deletePlan', () => {
  test('removes the plan directory and clears its read tracking', async () => {
    await writePlan(root, { plan: 'demo', content: 'alpha' })
    const deleted = await deletePlan(root, { plan: 'demo' })
    expect(deleted.success).toBe(true)
    expect(await listPlans(root)).toEqual({ success: true, plans: [] })

    await writePlan(root, { plan: 'demo', content: 'alpha' })
    await writeFile(artifactPath(root, 'demo', 'plan'), 'recreated elsewhere', 'utf8')
    const edit = await editPlan(root, { plan: 'demo', oldString: 'recreated', newString: 'x' })
    expect(edit.success).toBe(false)
    if (edit.success) throw new Error('unreachable')
    expect(edit.reason).toBe('stale_read')
  })

  test('reports a missing plan', async () => {
    const result = await deletePlan(root, { plan: 'missing' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('unreachable')
    expect(result.reason).toBe('plan_not_found')
  })
})

describe('containment', () => {
  test('accepts a path inside the plans directory', async () => {
    const result = await ensureContained(root, artifactPath(root, 'demo', 'plan'))
    expect(result.ok).toBe(true)
  })

  test('rejects a plan directory that symlinks out of the workspace', async () => {
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'viper-outside-')))
    await mkdir(plansDirectory(root), { recursive: true })
    await symlink(outside, planDirectory(root, 'escape'))

    const contained = await ensureContained(root, artifactPath(root, 'escape', 'plan'))
    expect(contained.ok).toBe(false)

    const write = await writePlan(root, { plan: 'escape', content: 'nope' })
    expect(write.success).toBe(false)
    if (write.success) throw new Error('unreachable')
    expect(write.reason).toBe('unsafe_path')
  })
})
