/** The MCP broker: ranking, the deny rule, and the search/describe/execute flow. */
import { Context } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile, type Volatile } from '@deepseek-ai/cosmokit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { lookupContextEditOverrides } from '@deepseek-ai/dsh-agent-loop'
import { brokerDenyNames, installBroker, rankTools, SEARCH_LIMIT } from '../src/broker.ts'
import * as managerModule from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

const SIGNAL = new AbortController().signal

/** A fake MCP server tool with an echo contract. */
function echoDefinition(): ToolDefinition {
  return {
    name: 'mcp__everything__echo',
    description: 'Echo a message back through the everything server.',
    parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: (value as { text: string }).text }],
    },
    async execute(args: unknown) {
      const { message } = args as { message: string }
      return { text: `Echo: ${message}` }
    },
  }
}

async function mounted(broker: Volatile<boolean> = createVolatile(true), withServerTools = true) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  if (withServerTools) ctx.tools.register(echoDefinition())
  const disposeBroker = installBroker(ctx, broker)
  const sessionId = 'session-broker-test'
  const agent = { session: { id: sessionId, snapshotEvents: () => [] } } as unknown as Agent
  const step = () => agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { modelSelection: { provider: 'p', model: 'm' }, messages: [createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } })], turn: 1, step: 1, signal: SIGNAL },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
  /** The request tool list after the session's broker override shapes it. */
  const visible = (): string[] => {
    const all = ctx.tools.schemas().map(tool => tool.name)
    const override = lookupContextEditOverrides(sessionId)
    return override?.tools === undefined ? all : override.tools(all.map(name => ({ name })) as never).map(row => row.name)
  }
  return { ctx, broker, disposeBroker, agent, step, visible, sessionId, dispose: disposeBroker }
}

/** Pull one broker tool definition and run it like the pipeline would. */
async function callBroker(ctx: Context, agent: Agent, name: string, args: unknown): Promise<{ text: string }> {
  const definition = ctx.tools.get(name)
  if (definition === undefined) throw new Error(`broker tool ${name} not visible to the agent`)
  const value = await definition.execute(args, {
    token: 't', callId: `call-${name}`, name, arguments: args, agent, signal: SIGNAL,
  } as never)
  return value as { text: string }
}

describe('rankTools', () => {
  const catalog = [
    { tool: 'mcp__everything__echo', server: 'everything', description: 'Echo a message back.' },
    { tool: 'mcp__web__navigate', server: 'web', description: 'Navigate the browser to a URL.' },
    { tool: 'mcp__everything__get_env', server: 'everything', description: 'Read an environment variable.' },
  ]
  it('weights name matches over description matches', () => {
    expect(rankTools('echo', catalog)[0]!.tool).toBe('mcp__everything__echo')
  })
  it('matches description words too', () => {
    expect(rankTools('navigate browser', catalog)[0]!.tool).toBe('mcp__web__navigate')
  })
  it('drops candidates with zero overlap and keeps every hit on an empty query', () => {
    expect(rankTools('zzz', catalog)).toHaveLength(0)
    expect(rankTools('', catalog)).toHaveLength(catalog.length)
  })
})

describe('brokerDenyNames', () => {
  const names = ['mcp__a__x', 'mcp__b__y', 'mcp_search_tools', 'mcp_describe_tool', 'mcp_execute_tool', 'bash', 'read']
  it('denies the server tools while broker covers them', () => {
    expect(brokerDenyNames(names, true)).toEqual(['mcp__a__x', 'mcp__b__y'])
  })
  it('denies the broker trio when broker is off', () => {
    expect(brokerDenyNames(names, false)).toEqual(['mcp_search_tools', 'mcp_describe_tool', 'mcp_execute_tool'])
  })
  it('denies the broker trio when no server tools are registered', () => {
    expect(brokerDenyNames(names.filter(name => !name.startsWith('mcp__a') && !name.startsWith('mcp__b')), true))
      .toEqual(['mcp_search_tools', 'mcp_describe_tool', 'mcp_execute_tool'])
  })
})

describe('installBroker', () => {
  // fork(mcp-manager, 2.4.35): a root-scope registration with zero servers
  // put the trio into every preset, including minimal; it now follows the
  // mounted server tools.
  it('registers the trio only while a server tool is mounted', async () => {
    const { ctx, step, visible } = await mounted(createVolatile(true), false)
    await step()
    expect(visible()).not.toContain('mcp_search_tools')
    const dispose = ctx.tools.register(echoDefinition())
    await step()
    expect(visible()).toContain('mcp_search_tools')
    dispose()
    await step()
    expect(visible()).not.toContain('mcp_search_tools')
  })

  it('hides server tools and shows exactly the broker trio on the first step', async () => {
    const { step, visible } = await mounted()
    await step()
    const names = visible()
    expect(names).toContain('mcp_search_tools')
    expect(names).toContain('mcp_describe_tool')
    expect(names).toContain('mcp_execute_tool')
    expect(names).not.toContain('mcp__everything__echo')
    expect(names.filter(name => name.startsWith('mcp__everything'))).toHaveLength(0)
    expect(SEARCH_LIMIT).toBe(8)
  })

  it('search finds the echo tool and describe returns its schema', async () => {
    const { ctx, agent, step } = await mounted()
    await step()
    const search = await callBroker(ctx, agent, 'mcp_search_tools', { query: 'echo' })
    expect(search.text).toContain('mcp__everything__echo')
    const describe = await callBroker(ctx, agent, 'mcp_describe_tool', { tool: 'mcp__everything__echo' })
    expect(describe.text).toContain('"message"')
    expect(describe.text).toContain('Echo a message back')
  })

  it('execute runs the hidden tool through its own definition', async () => {
    const { ctx, agent, step } = await mounted()
    await step()
    const result = await callBroker(ctx, agent, 'mcp_execute_tool', { tool: 'mcp__everything__echo', arguments: { message: 'hello from dslrh' } })
    expect(result.text).toBe('Echo: hello from dslrh')
  })

  it('refuses to execute non-MCP tools through the broker', async () => {
    const { ctx, agent, step } = await mounted()
    await step()
    const result = await callBroker(ctx, agent, 'mcp_execute_tool', { tool: 'bash', arguments: {} })
    expect(result.text).toContain('Only mcp__-prefixed')
  })

  it('flipping broker off restores direct visibility and hides the trio on the next step', async () => {
    const { broker, step, visible } = await mounted()
    await step()
    expect(visible()).toContain('mcp_search_tools')
    updateVolatile(broker, createVolatile(false))
    await step()
    const names = visible()
    expect(names).toContain('mcp__everything__echo')
    expect(names).not.toContain('mcp_search_tools')
  })

  it('manager apply registers the broker without config and resolves the default', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    ctx.tools.register(echoDefinition())
    // The service's domain wait is irrelevant here: apply registers the broker
    // synchronously; the storage stub never opens (regression pin: mounting
    // the plugin WITHOUT a config object must resolve the volatile default
    // instead of crashing — the superpowers-bootstrap bug class).
    ctx.provide('storageDomain', { open: () => new Promise(() => {}) } as never)
    await ctx.plugin(managerModule)
    const agent = { session: { id: 'session-apply', snapshotEvents: () => [] } } as unknown as Agent
    await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'p', model: 'm' }, messages: [createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } })], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] as never[] }),
    )
    const all = ctx.tools.schemas().map(tool => tool.name)
    const override = lookupContextEditOverrides('session-apply')
    expect(override).toBeDefined()
    const names = override!.tools!(all.map(name => ({ name })) as never).map(row => row.name)
    expect(names).toContain('mcp_search_tools')
    expect(names).not.toContain('mcp__everything__echo')
  })
})
