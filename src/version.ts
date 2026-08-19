import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type } from 'arktype'

const PackageManifest = type({ version: 'string >= 1' })

/**
 * The package's own version, read from the manifest that ships beside the
 * compiled output. Reading it keeps package.json the only place the version
 * is written; the server, the facet's declaration, and the release tag are all
 * checked against it.
 */
export async function readPackageVersion(): Promise<string> {
  const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  const manifest = PackageManifest.assert(JSON.parse(await readFile(manifestPath, 'utf8')))
  return manifest.version
}
