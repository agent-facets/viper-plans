import { McpServer } from '@modelcontextprotocol/server'
import {
  DeletePlanInput,
  DeletePlanOutput,
  EditPlanInput,
  EditPlanOutput,
  ListPlansInput,
  ListPlansOutput,
  ReadPlanInput,
  ReadPlanOutput,
  TOOL_NAMES,
  WritePlanInput,
  WritePlanOutput,
} from './contracts.js'
import { deletePlan, editPlan, listPlans, readPlan, writePlan } from './plan-store.js'

export function createServer(root: string, version: string): McpServer {
  const server = new McpServer({ name: 'viper-plans', version })

  server.registerTool(
    TOOL_NAMES.write,
    {
      title: 'Write a VIPER plan artifact',
      description:
        'Create or replace a VIPER plan artifact under .opencode/plans/<plan>/<artifact>.md. Replaces the artifact outright, and records it as read so it can be edited afterwards.',
      inputSchema: WritePlanInput,
      outputSchema: WritePlanOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (args) => {
      const result = await writePlan(root, args)
      return result.success
        ? succeeded(`Wrote ${result.plan}/${result.artifact} to ${result.path}.`, result)
        : failed(result)
    },
  )

  server.registerTool(
    TOOL_NAMES.read,
    {
      title: 'Read a VIPER plan artifact',
      description:
        'Read a VIPER plan artifact. Reading is required before editing it, and re-reading is how a stale edit is recovered from.',
      inputSchema: ReadPlanInput,
      outputSchema: ReadPlanOutput,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const result = await readPlan(root, args)
      return result.success ? succeeded(result.content, result) : failed(result)
    },
  )

  server.registerTool(
    TOOL_NAMES.edit,
    {
      title: 'Edit a VIPER plan artifact',
      description:
        'Replace exact text inside a VIPER plan artifact. The artifact must have been read or written by this server and be unchanged since. oldString must match exactly once unless replaceAll is set.',
      inputSchema: EditPlanInput,
      outputSchema: EditPlanOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      const result = await editPlan(root, args)
      return result.success
        ? succeeded(
            `Made ${result.replacements} replacement${result.replacements === 1 ? '' : 's'} in ${result.plan}/${result.artifact}.`,
            result,
          )
        : failed(result)
    },
  )

  server.registerTool(
    TOOL_NAMES.list,
    {
      title: 'List VIPER plans',
      description: 'List every VIPER plan in the workspace with the artifacts it contains.',
      inputSchema: ListPlansInput,
      outputSchema: ListPlansOutput,
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await listPlans(root)
      if (!result.success) return failed(result)
      const text =
        result.plans.length === 0
          ? 'No plans found.'
          : result.plans.map((plan) => `${plan.name}: ${plan.artifacts.join(', ') || '(no artifacts)'}`).join('\n')
      return succeeded(text, result)
    },
  )

  server.registerTool(
    TOOL_NAMES.delete,
    {
      title: 'Delete a VIPER plan',
      description: 'Delete a VIPER plan directory and every artifact inside it. This cannot be undone.',
      inputSchema: DeletePlanInput,
      outputSchema: DeletePlanOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (args) => {
      const result = await deletePlan(root, args)
      return result.success ? succeeded(`Deleted ${result.plan} (${result.path}).`, result) : failed(result)
    },
  )

  return server
}

function succeeded<T>(text: string, structuredContent: T) {
  return { content: [{ type: 'text' as const, text }], structuredContent }
}

function failed<T extends { message: string }>(result: T) {
  return {
    content: [{ type: 'text' as const, text: result.message }],
    structuredContent: result,
    isError: true as const,
  }
}
