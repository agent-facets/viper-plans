import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findVersionDrift } from '../scripts/check-version.js'
import { readPackageVersion } from '../src/version.js'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

test('the package, facet, and README agree on one version', async () => {
  expect(await findVersionDrift()).toEqual([])
})

test('a release tag that does not match the package version is drift', async () => {
  const problems = await findVersionDrift('9.9.9')
  expect(problems).toHaveLength(1)
  expect(problems[0]).toContain('expected 9.9.9')
})

test('the server reports the packaged version', async () => {
  const manifest: unknown = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'))
  const version = await readPackageVersion()
  expect(manifest).toMatchObject({ version })
})
