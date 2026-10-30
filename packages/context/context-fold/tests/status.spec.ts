/** Usage reporting: foldUsage wiring, renderStatus formatting, acp_status tool. */
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import type { FoldRecord } from '../src/fold.ts'
import { foldUsage, renderStatus } from '../src/status.ts'
import type { FoldUsage } from '../src/status.ts'
import { registerFoldTools, type ResolvedFoldConfig } from '../src/tools.ts'
import { MODEL, plainSession } from './fixtures.ts'
import { appendFold, planFold } from '../src/fold.ts'

const RECORD_A: FoldRecord = {
  foldId: 'aaaaaaaa-1111-2222-3333-444444444444',
  checkpointSeq: 40 as FoldRecord['checkpointSeq'],
  shadowedSeqs: [],
  summaryText: 'first fold summary',
  foldedTokens: 20000,
  summaryTokens: 350,
}

const RECORD_B: FoldRecord = {
  foldId: 'bbbbbbbb-1111-2222-3333-444444444444',
  checkpointSeq: 80 as FoldRecord['checkpointSeq'],
  shadowedSeqs: [],
  summaryText: 'second fold summary',
  foldedTokens: 25000,
  summaryTokens: 400,
}

const USAGE: FoldUsage = {
  pressureTokens: 12000,
  contextWindow: 131072,
  foldCount: 2,
  foldedTokens: 45000,
  records: [RECORD_A, RECORD_B],
}

describe('renderStatus', () => {
  it('formats usage, the fold ledger oldest-first, and healthy guidance', () => {
    const text = renderStatus(USAGE, 0.75)
    expect(text).toContain('12,000')
    expect(text).toContain('131,072')
    expect(text).toContain('aaaaaaaa')
    expect(text.indexOf('aaaaaaaa')).toBeLessThan(text.indexOf('bbbbbbbb'))
    expect(text).toContain('healthy')
  })

  it('reports an idle ledger and an unknown window honestly', () => {
    const text = renderStatus({ pressureTokens: 500, contextWindow: undefined, foldCount: 0, foldedTokens: 0, records: [] }, 0.75)
    expect(text).toContain('No folds yet')
    expect(text).toContain('unknown')
  })

  it('flips to compress guidance at the pressure ratio and escalates wording near the limit', () => {
    const filling = renderStatus({ ...USAGE, pressureTokens: 100000, contextWindow: 131072 }, 0.75)
    expect(filling).toContain('compress')
    const critical = renderStatus({ ...USAGE, pressureTokens: 128000, contextWindow: 131072 }, 0.75)
    expect(critical.toLowerCase()).toContain('now')
    expect(critical).not.toContain('healthy')
  })
})

describe('foldUsage', () => {
  it('reads pressure from the token meter and records from the log', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('tokenMeter', {
      contextPressure: () => ({ pressureTokens: 32100, contextWindow: 131072 }),
    } as unknown as TokenMeter)
    const session = plainSession('status-usage')
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    appendFold(session, plan, [{ type: 'text', text: 'Open objectives: status wiring' }], { summaryTokens: 9, provider: MODEL, model: MODEL })
    const usage = await foldUsage(ctx, session)
    expect(usage.pressureTokens).toBe(32100)
    expect(usage.contextWindow).toBe(131072)
    expect(usage.foldCount).toBe(1)
    expect(usage.foldedTokens).toBe(plan.foldedTokens)
  })

  it('leaves numbers absent when nothing has been measured', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const session = plainSession('status-empty')
    const usage = await foldUsage(ctx, session)
    expect(usage.pressureTokens).toBeUndefined()
    expect(usage.contextWindow).toBeUndefined()
    expect(usage.records).toEqual([])
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
}

async function mounted() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access' })
  ctx.provide('tokenMeter', {
    contextPressure: () => ({ pressureTokens: 32100, contextWindow: 131072 }),
  } as unknown as TokenMeter)
  registerFoldTools(ctx, CONFIG)
  const call = (name: string, session: Session, arguments_: unknown) => executeToolFixture(ctx, {
    name,
    arguments: arguments_,
    callId: ToolCallId(`${name}-call`),
    signal: new AbortController().signal,
    agent: { session } as unknown as Agent,
  })
  return { ctx, call }
}

describe('acp_status tool', () => {
  it('renders the usage report with the fold ledger', async () => {
    const session = plainSession('status-tool')
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    appendFold(session, plan, [{ type: 'text', text: 'Open objectives: status wiring' }], { summaryTokens: 9, provider: MODEL, model: MODEL })
    const { call } = await mounted()
    const result: ToolExecutionResult = await call('acp_status', session, {})
    if (result.isError) throw new Error(`acp_status failed: ${JSON.stringify(result.content)}`)
    const value = result.value as unknown as { ok: boolean; text: string }
    expect(value.ok).toBe(true)
    expect(value.text).toContain('32,100')
    expect(value.text).toContain(plan.foldId.slice(0, 8))
  })

  it('compress receipts carry a one-line usage suffix', async () => {
    const session = plainSession('status-compress-suffix')
    const { call } = await mounted()
    const result = await call('compress', session, {
      summary: 'Open objectives: usage suffix on receipts. Decision: folds are checkpoints. File: src/fold.ts:1',
    })
    if (result.isError) throw new Error(`compress failed: ${JSON.stringify(result.content)}`)
    const value = result.value as unknown as { ok: boolean; usage?: string }
    expect(value.ok).toBe(true)
    expect(value.usage).toContain('32,100')
  })
})
