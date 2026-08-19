import { expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { type } from 'arktype'
import { TOOL_NAMES } from '../src/contracts.js'

const run = promisify(execFile)
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const PackResult = type({ filename: 'string', files: type({ path: 'string' }).array() }).array()

async function packTarball(destination: string): Promise<{ tarball: string; paths: string[] }> {
  const { stdout } = await run('npm', ['pack', '--json', '--pack-destination', destination], {
    cwd: packageRoot,
    maxBuffer: 10_000_000,
  })
  const packed = PackResult.assert(JSON.parse(stdout))
  const first = packed[0]
  if (first === undefined) throw new Error('npm pack produced no tarball')
  return { tarball: join(destination, first.filename), paths: first.files.map((file) => file.path) }
}

test(
  'the published tarball carries the built server and nothing else',
  async () => {
    const destination = await realpath(await mkdtemp(join(tmpdir(), 'viper-pack-')))
    const { paths } = await packTarball(destination)

    expect(paths).toContain('package.json')
    expect(paths).toContain('README.md')
    expect(paths).toContain('LICENSE')
    expect(paths).toContain('build/index.js')
    expect(paths).toContain('build/index.d.ts')

    const unexpected = paths.filter(
      (path) =>
        path.startsWith('src/') ||
        path.startsWith('tests/') ||
        path.startsWith('commands/') ||
        path.startsWith('skills/') ||
        path === 'facet.json' ||
        path === 'biome.json' ||
        path === 'mise.toml' ||
        path === 'bun.lock',
    )
    expect(unexpected).toEqual([])
  },
  { timeout: 120_000 },
)

test(
  'the installed package runs its bin with no access to this source tree',
  async () => {
    const destination = await realpath(await mkdtemp(join(tmpdir(), 'viper-pack-')))
    const { tarball } = await packTarball(destination)

    const consumer = await realpath(await mkdtemp(join(tmpdir(), 'viper-consumer-')))
    await run('npm', ['install', '--no-audit', '--no-fund', '--silent', tarball], {
      cwd: consumer,
      maxBuffer: 10_000_000,
    })

    const workspace = await realpath(await mkdtemp(join(tmpdir(), 'viper-installed-')))
    const client = new Client({ name: 'viper-plans-package-tests', version: '0.0.0' })
    await client.connect(
      new StdioClientTransport({
        command: join(consumer, 'node_modules', '.bin', 'viper-plans-mcp'),
        cwd: workspace,
      }),
    )

    try {
      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(Object.values(TOOL_NAMES).sort())

      const written = await client.callTool({
        name: TOOL_NAMES.write,
        arguments: { plan: 'installed', content: 'from the registry tarball\n' },
      })
      expect(written.structuredContent).toMatchObject({
        success: true,
        path: join(workspace, '.opencode', 'plans', 'installed', 'plan.md'),
      })
    } finally {
      await client.close()
    }
  },
  { timeout: 300_000 },
)
