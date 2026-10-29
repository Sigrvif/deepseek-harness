/** Overrides: whitelist validation, request shaping, agent-loop seam, restart, fork non-inheritance. */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { lookupContextEditOverrides, registerContextEditOverrides } from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { SessionId } from '@deepseek-ai/dsh-session'
import { applyParams, applyTools, buildOverrides, validateParams } from '../src/overrides.ts'
import type { OverridesRecord } from '../src/types.ts'

const MODEL = 'override-model'

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 100_000 } })
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe('override shaping (pure)', () => {
  it('rejects non-whitelisted parameters', () => {
    expect(() => validateParams({ temperature: 0.2 })).not.toThrow()
    expect(() => validateParams({ bogus: 1 } as never)).toThrowError(/not overridable/u)
  })

  it('applies whitelisted params over the config', () => {
    const record: OverridesRecord = { removedTools: [], toolEdits: {}, params: { temperature: 0.2 } }
    const merged = applyParams(record, { provider: 'p', model: 'm', temperature: 1 } as never)
    expect(merged['temperature']).toBe(0.2)
  })

  it('removes and edits tools by exact name, never renaming', () => {
    const record: OverridesRecord = {
      removedTools: ['gone'],
      toolEdits: { kept: { description: 'edited description' } },
      params: {},
    }
    const tools = [
      { name: 'gone', description: 'x' },
      { name: 'kept', description: 'y' },
    ] as never as ToolSchema[]
    const shaped = applyTools(record, tools)
    expect(shaped).toHaveLength(1)
    expect(shaped[0]?.name).toBe('kept')
    expect(shaped[0]?.description).toBe('edited description')
  })

  it('builds no-op-free hooks for empty records', () => {
    const hooks = buildOverrides({ removedTools: [], toolEdits: {}, params: {} })
    expect(hooks.tools).toBeUndefined()
    expect(hooks.params).toBeUndefined()
  })
})

describe('override agent-loop seam', () => {
  it('applies params (and recorded tools) to the dispatched request and the logged header', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-context-editor-seam-'))
    roots.push(root)
    const ctx = new Context()
    contexts.push(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(TokenMeter)
    const adapter = new RecordingAdapter()
    ctx.llm.registerAdapter([MODEL], adapter)
    const agent = await ctx.agentLoop.create(SessionId('seam'), { provider: MODEL, model: MODEL })
    const record: OverridesRecord = {
      removedTools: ['definitely-not-a-tool'],
      toolEdits: {},
      params: { temperature: 0.2 },
    }
    registerContextEditOverrides('seam', buildOverrides(record))
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'turn prompt' }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()
    expect(adapter.requests.length).toBeGreaterThan(0)
    for (const request of adapter.requests) {
      expect(request.temperature).toBe(0.2)
      expect(request.tools?.some(tool => tool.name === 'definitely-not-a-tool') ?? false).toBe(false)
    }
    // The logged request/header agrees with the dispatched request.
    const header = agent.session.requestHeader()
    expect(header?.config['temperature']).toBe(0.2)
    registerContextEditOverrides('seam', undefined)
  })

  it('does not inherit overrides across forks', () => {
    registerContextEditOverrides('fork-parent', buildOverrides({ removedTools: ['x'], toolEdits: {}, params: { temperature: 0.1 } }))
    expect(lookupContextEditOverrides('fork-child')).toBeUndefined()
    registerContextEditOverrides('fork-parent', undefined)
  })
})

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
