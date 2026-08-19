import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { TOOL_NAMES } from '../src/contracts.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

let workspace: string
let client: Client

beforeAll(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'viper-mcp-')))
  client = new Client({ name: 'viper-plans-tests', version: '0.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: 'node',
      args: [join(packageRoot, 'build', 'index.js')],
      cwd: workspace,
    }),
  )
})

afterAll(async () => {
  await client.close()
})

function structured(result: { structuredContent?: unknown }): Record<string, unknown> {
  const content = result.structuredContent
  if (typeof content !== 'object' || content === null) throw new Error('expected structured content')
  return { ...content }
}

test('advertises exactly the five VIPER tools', async () => {
  const listed = await client.listTools()
  expect(listed.tools.map((tool) => tool.name).sort()).toEqual(Object.values(TOOL_NAMES).sort())
  for (const tool of listed.tools) {
    expect(tool.inputSchema.type).toBe('object')
    expect(tool.outputSchema?.type).toBe('object')
  }
})

test('write, list, read, edit, and delete round-trip over stdio', async () => {
  const written = await client.callTool({
    name: TOOL_NAMES.write,
    arguments: { plan: 'release', content: '# Release\n\nStep one.\n' },
  })
  expect(structured(written).success).toBe(true)
  expect(structured(written).path).toBe(join(workspace, '.opencode', 'plans', 'release', 'plan.md'))

  const listed = await client.callTool({ name: TOOL_NAMES.list, arguments: {} })
  expect(structured(listed).plans).toEqual([{ name: 'release', artifacts: ['plan'] }])

  const read = await client.callTool({ name: TOOL_NAMES.read, arguments: { plan: 'release' } })
  expect(structured(read).content).toBe('# Release\n\nStep one.\n')

  const edited = await client.callTool({
    name: TOOL_NAMES.edit,
    arguments: { plan: 'release', oldString: 'Step one.', newString: 'Step two.' },
  })
  expect(structured(edited)).toMatchObject({ success: true, replacements: 1 })

  const reread = await client.callTool({ name: TOOL_NAMES.read, arguments: { plan: 'release' } })
  expect(structured(reread).content).toBe('# Release\n\nStep two.\n')

  const deleted = await client.callTool({ name: TOOL_NAMES.delete, arguments: { plan: 'release' } })
  expect(structured(deleted).success).toBe(true)

  const empty = await client.callTool({ name: TOOL_NAMES.list, arguments: {} })
  expect(structured(empty).plans).toEqual([])
})

test('a failed call is a readable result, not a protocol error', async () => {
  const result = await client.callTool({ name: TOOL_NAMES.read, arguments: { plan: 'nothing-here' } })
  expect(result.isError).toBe(true)
  expect(structured(result)).toMatchObject({ success: false, reason: 'not_found', plan: 'nothing-here' })
})

test('an unsafe name is refused with a structured reason', async () => {
  const result = await client.callTool({
    name: TOOL_NAMES.write,
    arguments: { plan: '../escape', content: 'nope' },
  })
  expect(result.isError).toBe(true)
  expect(structured(result)).toMatchObject({ success: false, reason: 'invalid_name' })
})

test('arguments that violate the input schema never reach the handler', async () => {
  const result = await client.callTool({ name: TOOL_NAMES.write, arguments: { plan: 'demo' } })
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toContain('content')
})
