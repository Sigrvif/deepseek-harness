/** Keyword search over fold summaries, fold originals, and visible messages. */
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { appendFold, deriveFoldRecords, planFold } from '../src/fold.ts'
import { searchContext } from '../src/search.ts'
import type { SearchHit } from '../src/search.ts'
import { registerFoldTools, type ResolvedFoldConfig } from '../src/tools.ts'
import { MODEL, addTurn, plainSession } from './fixtures.ts'

function folded(session: Session, summary: string) {
  const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
  appendFold(session, plan, [{ type: 'text', text: summary }], { summaryTokens: 8, provider: MODEL, model: MODEL })
}

function searchOf(session: Session, query: string, limit = 8): SearchHit[] {
  const events = session.snapshotEvents()
  return searchContext(query, deriveFoldRecords(events), events, limit)
}

describe('searchContext', () => {
  it('ranks the fold whose summary matches the query first', () => {
    const session = plainSession('search-rank')
    folded(session, 'Open objectives: wire the QUASAR telemetry export')
    const hits = searchOf(session, 'quasar telemetry')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.kind).toBe('fold')
    expect(hits[0]!.snippet.toLowerCase()).toContain('quasar')
  })

  it('surfaces the fold covering an original that matched, not the shadowed seq', () => {
    const session = Session.create(SessionId('search-original'))
    addTurn(session, 1, [
      { kind: 'user', text: 'first user message stays visible' },
      { kind: 'assistant', text: 'The registry key is BANANA-42, note it down' },
      { kind: 'user', text: 'second user message' },
      { kind: 'assistant', text: 'assistant answer two with enough body text to fold' },
      { kind: 'user', text: 'recent user message' },
      { kind: 'assistant', text: 'recent assistant answer' },
    ])
    folded(session, 'Summary that does not mention the key at all')
    const hits = searchOf(session, 'banana-42')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.kind).toBe('fold')
    expect(hits[0]!.foldId).toMatch(/^[0-9a-f]{8}$/u)
    const record = deriveFoldRecords(session.snapshotEvents())[0]!
    expect(record.shadowedSeqs).not.toContain(hits[0]!.seq)
  })

  it('matches visible messages by their current content', () => {
    const session = plainSession('search-visible')
    const hits = searchOf(session, 'recent assistant answer')
    expect(hits.some(hit => hit.kind === 'message' && hit.snippet.includes('recent assistant answer'))).toBe(true)
  })

  it('respects the limit and reports no hits for unrelated queries', () => {
    const session = plainSession('search-limit')
    folded(session, 'Open objectives: wire the QUASAR telemetry export')
    expect(searchOf(session, 'the', 1)).toHaveLength(1)
    expect(searchOf(session, 'zzzznothing')).toEqual([])
  })
})

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
  nudgeInfoMaxTokens: 200000,
  nudgeDemandRatio: 0.7,
}

describe('search_context tool', () => {
  it('renders fold and message hits with ids and snippets', async () => {
    const session = plainSession('search-tool')
    folded(session, 'Open objectives: wire the QUASAR telemetry export')
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(SessionProjections)
    await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access' })
    registerFoldTools(ctx, CONFIG)
    const result: ToolExecutionResult = await executeToolFixture(ctx, {
      name: 'search_context',
      arguments: { query: 'quasar telemetry' },
      callId: ToolCallId('search-call'),
      signal: new AbortController().signal,
      agent: { session } as unknown as Agent,
    })
    if (result.isError) throw new Error(`search_context failed: ${JSON.stringify(result.content)}`)
    const value = result.value as unknown as { ok: boolean; hits: SearchHit[]; text: string }
    expect(value.ok).toBe(true)
    expect(value.hits[0]!.kind).toBe('fold')
    expect(value.text).toContain('[fold ')
    expect(value.text.toLowerCase()).toContain('quasar')
  })

  it('answers friendly guidance when nothing matches', async () => {
    const session = plainSession('search-tool-empty')
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(SessionProjections)
    await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access' })
    registerFoldTools(ctx, CONFIG)
    const result = await executeToolFixture(ctx, {
      name: 'search_context',
      arguments: { query: 'zzzznothing' },
      callId: ToolCallId('search-call'),
      signal: new AbortController().signal,
      agent: { session } as unknown as Agent,
    })
    if (result.isError) throw new Error(`search_context failed: ${JSON.stringify(result.content)}`)
    const value = result.value as unknown as { ok: boolean; text: string }
    expect(value.ok).toBe(true)
    expect(value.text.toLowerCase()).toContain('no matches')
  })
})
