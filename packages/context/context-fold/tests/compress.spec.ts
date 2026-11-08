/** The compress tool: gates, fold execution, and result rendering. */
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, foldSurface } from '@deepseek-ai/dsh-session'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveFoldRecords } from '../src/fold.ts'
import { COMPRESS_DESCRIPTION } from '../src/prompts.ts'
import { registerFoldTools, type ResolvedFoldConfig } from '../src/tools.ts'
import { addTurn, plainSession } from './fixtures.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

const CONFIG: ResolvedFoldConfig = {
  enabled: true,
  keepLast: 2,
  minFoldChars: 1,
  minSummaryChars: 20,
  decompressCapChars: 24000,
  searchLimit: 8,
  nudgeGrowthTokens: 50000,
  pressureNudgeRatio: 0.75,
  nudgeAdviseRatio: 0.4,
  nudgeDemandRatio: 0.7,
}

const SUMMARY = 'Open objectives: ship the fold feature.\n- Decision: folds are model-driven checkpoints\n- File: src/fold.ts:1'

async function mounted(config: ResolvedFoldConfig = CONFIG) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access' })
  const dispose = registerFoldTools(ctx, config)
  const call = (session: Session | undefined, arguments_: unknown) => executeToolFixture(ctx, {
    name: 'compress',
    arguments: arguments_,
    callId: ToolCallId('compress-call'),
    signal: new AbortController().signal,
    ...(session === undefined ? {} : { agent: { session } as unknown as Agent }),
  })
  return { ctx, call, dispose }
}

interface CompressValue {
  ok: boolean
  folded?: number
  savedTokens?: number
  checkpointSeq?: number
  foldId?: string
  reason?: string
  hint?: string
}

function valueOf(result: ToolExecutionResult): CompressValue {
  if (result.isError) throw new Error(`compress failed: ${JSON.stringify(result.content)}`)
  return result.value as unknown as CompressValue
}

describe('compress tool', () => {
  it('folds the planned range and records the checkpoint in the log', async () => {
    const session = plainSession('compress-happy')
    const eventsBefore = session.snapshotEvents().length
    const { call } = await mounted()
    const result = await call(session, { summary: SUMMARY })
    const value = valueOf(result)
    expect(value.ok).toBe(true)
    expect(value.folded).toBe(3)
    expect(value.savedTokens).toBeGreaterThan(0)
    expect(value.foldId).toMatch(/^[0-9a-f]{8}$/u)
    const events = session.snapshotEvents()
    expect(events.length).toBe(eventsBefore + 4)
    const records = deriveFoldRecords(events)
    expect(records).toHaveLength(1)
    // The surface no longer carries the folded originals.
    const nodes = [...foldSurface(events).nodes]
    for (const record of records) {
      for (const seq of record.shadowedSeqs) expect(nodes).not.toContain(seq)
    }
  })

  it('rejects a too-short summary before touching the log', async () => {
    const session = plainSession('compress-short')
    const eventsBefore = session.snapshotEvents().length
    const { call } = await mounted()
    const value = valueOf(await call(session, { summary: 'too short' }))
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('summary')
    expect(typeof value.hint).toBe('string')
    expect(session.snapshotEvents().length).toBe(eventsBefore)
  })

  it('returns guidance when the foldable range is under the minimum', async () => {
    const session = Session.create(SessionId('compress-small'))
    addTurn(session, 1, [
      { kind: 'user', text: 'hi' },
      { kind: 'assistant', text: 'hello' },
      { kind: 'user', text: 'again' },
      { kind: 'assistant', text: 'bye' },
    ])
    const { call } = await mounted({ ...CONFIG, minFoldChars: 100000 })
    const value = valueOf(await call(session, { summary: SUMMARY }))
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('chars')
    expect(value.hint).toContain('acp_status')
  })

  it('fails as a tool error when no agent session rides the execution', async () => {
    const { call } = await mounted()
    const result = await call(undefined, { summary: SUMMARY })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('agent')
  })

  it('renders a markdown confirmation carrying the saved tokens', async () => {
    const session = plainSession('compress-render')
    const { ctx, call } = await mounted()
    await call(session, { summary: SUMMARY })
    const definition = [...ctx.tools.definitions()].find(tool => tool.name === 'compress')
    expect(definition).toBeDefined()
    const value = valueOf(await call(session, { summary: `${SUMMARY} second fold with more text` }))
    const content = definition!.output.render({ summary: SUMMARY }, value as never)
    const text = JSON.stringify(content)
    expect(value.ok).toBe(true)
    expect(text).toContain('Folded')
    expect(text).toContain(String(value.savedTokens))
    expect(text).toContain('decompress')
  })

  it('keeps the description byte-stable (cache anchor)', async () => {
    const { ctx } = await mounted()
    const definition = [...ctx.tools.definitions()].find(tool => tool.name === 'compress')
    expect(definition?.description).toBe(COMPRESS_DESCRIPTION)
    expect(COMPRESS_DESCRIPTION).toMatchInlineSnapshot(
      '"Fold consumed conversation history into a compact summary to free context. Call this when older conversation is no longer needed verbatim - compress by need, not by percentage. Write the summary yourself: preserve full file paths with line numbers, commands, ids, verbatim user quotes labeled as history, decisions, and an Open objectives carry-forward line; drop dead-end exploration but keep its lesson in one line. The summary replaces everything older than the protected recent tail (keepLast); the first user message stays visible. Folding is reversible: decompress restores the originals and search_context finds them. One compress call per batch; make it count."',
    )
  })
})
