/** The decompress tool: capped original recovery from the fold ledger. */
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
import { appendFold, deriveFoldRecords, planFold } from '../src/fold.ts'
import { registerFoldTools, type ResolvedFoldConfig } from '../src/tools.ts'
import { MODEL, addTurn, plainSession } from './fixtures.ts'

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
}

const SUMMARY = 'Open objectives: ship the fold feature. Decision: folds are checkpoints. File: src/fold.ts:1'

async function mounted(config: ResolvedFoldConfig = CONFIG) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access' })
  registerFoldTools(ctx, config)
  const call = (session: Session | undefined, arguments_: unknown) => executeToolFixture(ctx, {
    name: 'decompress',
    arguments: arguments_,
    callId: ToolCallId('decompress-call'),
    signal: new AbortController().signal,
    ...(session === undefined ? {} : { agent: { session } as unknown as Agent }),
  })
  return { ctx, call }
}

interface DecompressValue {
  ok: boolean
  foldId?: string
  messageCount?: number
  content?: string
  reason?: string
  hint?: string
}

function valueOf(result: ToolExecutionResult): DecompressValue {
  if (result.isError) throw new Error(`decompress failed: ${JSON.stringify(result.content)}`)
  return result.value as unknown as DecompressValue
}

function foldedSession(id: string, summary = SUMMARY, foldedText?: string) {
  const session = foldedText === undefined
    ? plainSession(id)
    : (() => {
      const created = Session.create(SessionId(id))
      addTurn(created, 1, [
        { kind: 'user', text: 'first user message stays visible' },
        { kind: 'assistant', text: foldedText },
        { kind: 'user', text: 'second user message' },
        { kind: 'assistant', text: 'assistant answer two with enough body text to fold' },
        { kind: 'user', text: 'recent user message' },
        { kind: 'assistant', text: 'recent assistant answer' },
      ])
      return created
    })()
  const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
  appendFold(session, plan, [{ type: 'text', text: summary }], { summaryTokens: 8, provider: MODEL, model: MODEL })
  return { session, plan }
}

describe('decompress tool', () => {
  it('returns the shadowed originals without touching the surface', async () => {
    const { session } = foldedSession('decompress-roundtrip', SUMMARY, 'The codeword is PINEAPPLE, recorded in this folded original')
    const { call } = await mounted()
    const value = valueOf(await call(session, {}))
    expect(value.ok).toBe(true)
    expect(value.foldId).toMatch(/^[0-9a-f]{8}$/u)
    expect(value.messageCount).toBe(3)
    expect(value.content).toContain('PINEAPPLE')
    expect(value.content).toContain('[user]')
    // The surface stays folded: the checkpoint still hides the originals.
    const nodes = [...foldSurface(session.snapshotEvents()).nodes]
    for (const record of deriveFoldRecords(session.snapshotEvents())) {
      for (const seq of record.shadowedSeqs) expect(nodes).not.toContain(seq)
    }
  })

  it('resolves the newest fold when no foldId is given, and matches short ids', async () => {
    const { session } = foldedSession('decompress-newest')
    const { call } = await mounted()
    const newest = valueOf(await call(session, {}))
    const byShort = valueOf(await call(session, { foldId: newest.foldId }))
    expect(byShort.ok).toBe(true)
    expect(byShort.foldId).toBe(newest.foldId)
  })

  it('lists candidates for an unknown fold id', async () => {
    const { session } = foldedSession('decompress-unknown')
    const { call } = await mounted()
    const value = valueOf(await call(session, { foldId: 'deadbeef' }))
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('deadbeef')
    expect(value.hint).toContain('acp_status')
  })

  it('truncates oversized originals with a notice naming search_context', async () => {
    const long = `The codeword is PINEAPPLE. ${'filler text '.repeat(400)}`
    const { session } = foldedSession('decompress-cap', SUMMARY, long)
    const { call } = await mounted({ ...CONFIG, decompressCapChars: 500 })
    const value = valueOf(await call(session, {}))
    expect(value.ok).toBe(true)
    expect(value.content!.length).toBeLessThanOrEqual(700)
    expect(value.content).toContain('search_context')
    expect(value.content).toContain('truncated')
  })

  it('answers guidance when the session has no folds yet', async () => {
    const session = plainSession('decompress-empty')
    const { call } = await mounted()
    const value = valueOf(await call(session, {}))
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('no folds')
  })

  it('fails as a tool error without an agent session', async () => {
    const { call } = await mounted()
    const result = await call(undefined, {})
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('agent')
  })
})
