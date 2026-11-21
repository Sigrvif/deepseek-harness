/**
 * The on-demand MCP broker: three indirection tools (`mcp_search_tools`,
 * `mcp_describe_tool`, `mcp_execute_tool`) that rank, explain, and run the
 * servers' `mcp__<server>__<raw>` tools. Small models otherwise face one
 * tool per server capability — 30+ entries for 2–3 servers — and drown in
 * them.
 *
 * Hiding is a per-agent deny restriction (the browser-use mask pattern):
 * `tools.restrict({ deny })` requires a scoped context, so each agent gets a
 * mask scope on its first step (keyed by the agent object, refreshed on
 * `tools/change`), denying whichever side broker mode currently hides — the
 * servers' `mcp__*` tools while broker is on and servers are connected, the
 * broker's own trio otherwise. Restrictions shape the agent's tool view; the
 * ROOT view is untouched, which is exactly what the catalog and the nested
 * execution read: `mcp_execute_tool` looks the hidden definition up in the
 * root view and calls its `execute` directly, so no pipeline re-entry, no
 * duplicate durable events, and no UNKNOWN_TOOL from the mask.
 *
 * @module
 */

import { registerContextEditOverrides } from '@deepseek-ai/dsh-agent-loop'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cosmokit'

/** Prefix every server-registered MCP tool carries (`mcp__<server>__<raw>`). */
export const MCP_TOOL_PREFIX = 'mcp__'

/** The broker's own tool names. */
export const BROKER_TOOL_NAMES = ['mcp_search_tools', 'mcp_describe_tool', 'mcp_execute_tool'] as const

/** One search hit. */
export interface McpSearchHit {
  /** Exact model-facing tool name to pass to describe/execute. */
  tool: string
  /** The server namespace between the `mcp__` underscores. */
  server: string
  description: string
}

/** How many hits one search returns. */
export const SEARCH_LIMIT = 8

/**
 * Lexical ranking over tool name + description: query tokens matched in the
 * name weigh triple (names are the model's own handle), description matches
 * weigh single. Zero-dependency on purpose — catalogs are tens of entries,
 * not corpora.
 * @param query - free text from the model.
 * @param hits - the candidate catalog.
 * @returns the candidates sorted best-first, every one of them (callers slice).
 */
export function rankTools(query: string, hits: readonly McpSearchHit[]): McpSearchHit[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9_]+/).filter(token => token.length > 1)
  const scored = hits.map((hit) => {
    if (tokens.length === 0) return { hit, score: 0 }
    const name = hit.tool.toLowerCase()
    const description = hit.description.toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (name.includes(token)) score += 3
      if (description.includes(token)) score += 1
    }
    return { hit, score }
  })
  return scored
    .filter(entry => tokens.length === 0 || entry.score > 0)
    .sort((a, b) => b.score - a.score || a.hit.tool.localeCompare(b.hit.tool))
    .map(entry => entry.hit)
}

/**
 * Which registered tool names the session should NOT see, pure for tests.
 * @param registeredNames - every root-visible tool name.
 * @param brokerOn - the volatile broker flag's current value.
 * @returns the deny list: the servers' tools while broker covers them, the
 *   broker's trio otherwise (nothing to broker, or direct tools restored).
 */
export function brokerDenyNames(registeredNames: readonly string[], brokerOn: boolean): string[] {
  const serverTools = registeredNames.filter(name => name.startsWith(MCP_TOOL_PREFIX))
  if (brokerOn && serverTools.length > 0) return serverTools
  return registeredNames.filter(name => (BROKER_TOOL_NAMES as readonly string[]).includes(name))
}

/** Split `mcp__<server>__<raw>` into its server namespace. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function serverOf(tool: string): string {
  return tool.slice(MCP_TOOL_PREFIX.length).split('__')[0] ?? ''
}

/** Render a definition's canonical value the way the normal pipeline would. */
function renderedText(definition: ToolDefinition, args: unknown, value: unknown): string {
  const blocks: readonly ContentBlock[] = definition.output.render(args, value as never)
  const text = blocks.map(block => block.type === 'text' ? block.text : '').join('').trim()
  return text === '' ? JSON.stringify(value ?? null) : text
}

/** A tools view that reads the root contribution (unaffected by agent masks). */
interface RootToolsView {
  definitions(): readonly ToolDefinition[]
  register(definition: ToolDefinition): () => void
  restrict(restriction: { deny: string[] }): () => void
}

/**
 * Register the three broker tools and run the per-agent deny masks behind
 * the live volatile flag. The deny rail is the agent's own scoped context:
 * `agent.ctx.tools.restrict({ deny })` (the subagent toolFilter pattern) —
 * restrictions bind to the agent's scope, and the root view the broker's
 * catalog and nested execute read stays untouched.
 * @param ctx - host context carrying the tools service.
 * @param broker - the live volatile flag.
 * @returns disposer removing the tools and every mask.
 */
export function installBroker(ctx: Context, broker: Volatile<boolean>): () => void {
  const rootTools = (): RootToolsView => (ctx.tools)
  // session id -> deny names currently registered for it.
  const overrides = new Map<string, { names: string[] }>()

  const denyFor = (): string[] => brokerDenyNames(rootTools().definitions().map(definition => definition.name), broker.get())

  /**
   * Shape one session's request tool list through the context-edit override
   * registry (the Context Editor's production rail): broker on hides the
   * servers' `mcp__*` tools, off hides the trio, nothing to hide clears the
   * override. The registry stays untouched on the execution side, so the
   * nested dispatch in mcp_execute_tool resolves the hidden definitions.
   */
  const ensureOverride = (sessionId: string): void => {
    const standing = overrides.get(sessionId)
    const names = denyFor()
    if (names.length === 0) {
      if (standing !== undefined) {
        overrides.delete(sessionId)
        registerContextEditOverrides(sessionId, undefined)
      }
      return
    }
    if (standing !== undefined
      && standing.names.length === names.length
      && standing.names.every((name, index) => name === names[index])) return
    registerContextEditOverrides(sessionId, {
      tools: tools => tools.filter(tool => !names.includes(tool.name)),
    })
    overrides.set(sessionId, { names })
  }

  const searchTool: ToolDefinition = {
    name: 'mcp_search_tools',
    description: 'Search the configured MCP servers\' tools by free-text query. '
      + 'Returns the exact tool names with short descriptions. '
      + 'Flow: call mcp_search_tools, then mcp_describe_tool on the best match to see its arguments, then mcp_execute_tool to run it.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, e.g. "echo", "browser navigate", "read breakpoints". Empty lists every tool.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: (value as { text: string }).text }],
    },
    execute(args: unknown, _exec: ToolRunContext) {
      const { query } = args as { query?: string }
      const hits = rootTools().definitions()
        .filter(definition => definition.name.startsWith(MCP_TOOL_PREFIX))
        .map(definition => ({ tool: definition.name, server: serverOf(definition.name), description: definition.description }))
      if (hits.length === 0) {
        return Promise.resolve({ text: 'No MCP servers are configured (or none are connected). Nothing to search.' })
      }
      const ranked = rankTools(query ?? '', hits).slice(0, SEARCH_LIMIT)
      if (ranked.length === 0) {
        return Promise.resolve({ text: `No MCP tools match ${JSON.stringify(query ?? '')}. Try shorter or more literal terms; an empty query lists every tool.` })
      }
      const lines = ranked.map(hit => `- ${hit.tool} — ${hit.description}`)
      return Promise.resolve({ text: ['Matching MCP tools (call mcp_describe_tool on one to see its arguments):', ...lines].join('\n') })
    },
  }

  const describeTool: ToolDefinition = {
    name: 'mcp_describe_tool',
    description: 'Show one MCP tool\'s full argument schema. Pass the exact tool name from mcp_search_tools. '
      + 'Call this before mcp_execute_tool so the arguments match the schema.',
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Exact tool name, e.g. mcp__everything__echo.' },
      },
      required: ['tool'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: (value as { text: string }).text }],
    },
    execute(args: unknown, _exec: ToolRunContext) {
      const { tool } = args as { tool: string }
      const known = rootTools().definitions().filter(definition => definition.name.startsWith(MCP_TOOL_PREFIX))
      const definition = known.find(candidate => candidate.name === tool)
      if (definition === undefined) {
        const suggestions = known.map(candidate => candidate.name).slice(0, 6).join(', ')
        return Promise.resolve({ text: `Unknown MCP tool ${JSON.stringify(tool)}.${suggestions === '' ? ' No MCP tools are connected.' : ` Known tools: ${suggestions}.`}` })
      }
      return Promise.resolve({
        text: [`Tool: ${definition.name}`, definition.description, 'Arguments (JSON Schema):', JSON.stringify(definition.parameters, null, 2),
          'Run it with mcp_execute_tool using this exact tool name.'].join('\n'),
      })
    },
  }

  const executeTool: ToolDefinition = {
    name: 'mcp_execute_tool',
    description: 'Run one MCP tool by its exact name with a JSON arguments object. '
      + 'Describe the tool first; arguments must match its schema. Only mcp__-prefixed tools are executable here.',
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Exact tool name from mcp_search_tools, e.g. mcp__everything__echo.' },
        arguments: { type: 'object', description: 'The tool\'s arguments, matching the schema mcp_describe_tool showed.' },
      },
      required: ['tool', 'arguments'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: (value as { text: string }).text }],
    },
    async execute(args: unknown, exec: ToolRunContext) {
      const { tool, arguments: innerArguments } = args as { tool: string; arguments?: Record<string, unknown> }
      if (!tool.startsWith(MCP_TOOL_PREFIX)) {
        return { text: `Only mcp__-prefixed MCP tools run through this broker; ${JSON.stringify(tool)} is not one. Search with mcp_search_tools.` }
      }
      const definition = rootTools().definitions().find(candidate => candidate.name === tool)
      if (definition === undefined) {
        return { text: `Unknown MCP tool ${JSON.stringify(tool)}. Search with mcp_search_tools for the current names.` }
      }
      const parsed: unknown = (innerArguments ?? {})
      const innerExec = { ...exec, name: tool, arguments: parsed } as ToolRunContext
      const value = await definition.execute(parsed, innerExec)
      return { text: renderedText(definition, parsed, value) }
    },
  }

  // fork(mcp-manager, 2.4.35): the trio registers only while it can serve —
  // broker mode on AND at least one server tool mounted. A root-scope
  // registration with zero servers put three meta-tools into EVERY preset,
  // including minimal, whose roster is bash + read_image + working_directory
  // by design; upstream with no servers configured exposes no MCP tools at
  // all. Server fibers mount and dispose through the supervisor's sync, and
  // the pre-step hook below re-syncs before every request, so live edits and
  // the settings toggle converge on the next step.
  let trioDisposers: (() => void)[] = []
  const serverToolsLive = (): boolean => rootTools().definitions()
    .some(definition => definition.name.startsWith(MCP_TOOL_PREFIX))
  const syncTrioRegistration = (): void => {
    const shouldRegister = broker.get() && serverToolsLive()
    if (shouldRegister === (trioDisposers.length > 0)) return
    for (const dispose of trioDisposers) dispose()
    trioDisposers = []
    if (!shouldRegister) return
    trioDisposers = [
      rootTools().register(searchTool),
      rootTools().register(describeTool),
      rootTools().register(executeTool),
    ]
  }
  syncTrioRegistration()

  ctx.on('agent/pre-step', async ({ agent }, next) => {
    try {
      syncTrioRegistration()
      const sessionId = (agent as { session?: { id?: string } }).session?.id
      if (sessionId !== undefined) ensureOverride(sessionId)
    } catch (error) {
      // An override failure must never stall a turn: the request proceeds
      // with the unmasked (direct) tool list.
      ctx.logger.error(`mcp-manager: broker filter failed: ${errorMessage(error)}`)
    }
    return next()
  })
  return () => {
    for (const dispose of trioDisposers) dispose()
    trioDisposers = []
    for (const sessionId of overrides.keys()) registerContextEditOverrides(sessionId, undefined)
    overrides.clear()
  }
}
