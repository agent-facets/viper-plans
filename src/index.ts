#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createServer } from './server.js'
import { readPackageVersion } from './version.js'
import { resolveWorkspaceRoot } from './workspace.js'

const root = await resolveWorkspaceRoot()
const version = await readPackageVersion()

const handle = serveStdio(() => createServer(root, version))

// stdout carries JSON-RPC; anything this process says goes to stderr.
console.error(`viper-plans MCP server ${version} serving plans in ${root}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void handle.close().finally(() => process.exit(0))
  })
}
