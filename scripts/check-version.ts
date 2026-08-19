import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type } from 'arktype'

export const PACKAGE_NAME = '@agent-facets/viper-plans-mcp'
export const SERVER_NAME = 'viper-plans'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const PackageManifest = type({ name: 'string', version: 'string' })
const FacetManifest = type({
  version: 'string',
  servers: type.Record('string', 'unknown'),
})
const StdioServer = type({
  type: "'stdio'",
  command: 'string',
  args: 'string[]',
})

/**
 * Confirm every place the package version appears still agrees with
 * package.json: the facet version, the exact version the facet's server
 * declaration launches, and the README's example. Pass `expected` (from a
 * release tag) to require a specific version as well.
 */
export async function findVersionDrift(expected?: string): Promise<string[]> {
  const problems: string[] = []

  const pkg = PackageManifest.assert(JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')))
  const facet = FacetManifest.assert(JSON.parse(await readFile(join(repositoryRoot, 'facet.json'), 'utf8')))
  const readme = await readFile(join(repositoryRoot, 'README.md'), 'utf8')
  const version = pkg.version

  if (pkg.name !== PACKAGE_NAME) {
    problems.push(`package.json name is ${pkg.name}, expected ${PACKAGE_NAME}`)
  }
  if (expected !== undefined && expected !== version) {
    problems.push(`package.json version is ${version}, expected ${expected}`)
  }
  if (facet.version !== version) {
    problems.push(`facet.json version is ${facet.version}, expected ${version}`)
  }

  const declaration = StdioServer(facet.servers[SERVER_NAME])
  if (declaration instanceof type.errors) {
    problems.push(`facet.json servers.${SERVER_NAME} is not an stdio declaration: ${declaration.summary}`)
  } else {
    const expectedArgs = ['-y', `${PACKAGE_NAME}@${version}`]
    if (declaration.command !== 'npx' || declaration.args.join(' ') !== expectedArgs.join(' ')) {
      problems.push(
        `facet.json servers.${SERVER_NAME} launches "${declaration.command} ${declaration.args.join(' ')}", expected "npx ${expectedArgs.join(' ')}"`,
      )
    }
  }

  for (const match of readme.matchAll(new RegExp(`${PACKAGE_NAME}@([0-9][^"' \`\\n]*)`, 'g'))) {
    if (match[1] !== version) {
      problems.push(`README.md references ${PACKAGE_NAME}@${match[1]}, expected ${version}`)
    }
  }

  return problems
}

if (import.meta.main) {
  const tagIndex = process.argv.indexOf('--tag')
  const rawTag = tagIndex === -1 ? undefined : process.argv[tagIndex + 1]
  if (tagIndex !== -1 && rawTag === undefined) {
    console.error('--tag requires a value')
    process.exit(2)
  }

  const problems = await findVersionDrift(rawTag?.replace(/^v/, ''))
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`)
    process.exit(1)
  }
  console.log('✓ package, facet, and README versions agree')
}
