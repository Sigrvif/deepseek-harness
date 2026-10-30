/** Growth and pressure nudges on agent/pre-step. */
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { afterEach, describe, expect, it } from 'vitest'
import { appendFold, planFold } from '../src/fold.ts'
import { installNudge } from '../src/nudge.ts'
import type { ResolvedFoldConfig } from '../src/tools.ts'
import { MODEL, plainSession } from './fixtures.ts'

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

const SIGNAL = new AbortController().signal

let pressure = 0
let window = 100000

async function mounted() {
  const ctx = new Context()
  contexts.push(ctx)
  pressure = 0
  window = 100000
  ctx.provide('tokenMeter', {
    contextPressure: () => ({ pressureTokens: pressure, contextWindow: window }),
  } as unknown as TokenMeter)
  const dispose = installNudge(ctx, CONFIG)
  const step = (session: ReturnType<typeof plainSession>) =>
    agentEvents(ctx, { session } as unknown as Agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'p', model: 'm' }, messages: [], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] as UserMessage[] }),
    )
  return { ctx, step, dispose }
}

function nudges(decision: PreStepDecision): number {
  if (decision.kind !== 'enter') throw new Error(`expected enter decision, got ${decision.kind}`)
  return decision.messages.length
}

describe('installNudge', () => {
  it('stays silent below the growth threshold', async () => {
    const { step } = await mounted()
    const session = plainSession('nudge-quiet')
    await step(session)
    pressure = 30000
    expect(nudges(await step(session))).toBe(0)
  })

  it('nudges once when growth crosses the threshold, not again without new growth', async () => {
    const { step } = await mounted()
    const session = plainSession('nudge-growth')
    await step(session)
    pressure = 60000
    const decision = await step(session)
    expect(nudges(decision)).toBe(1)
    const text = JSON.stringify(decision.kind === 'enter' ? decision.messages : [])
    expect(text).toContain('compress')
    expect(nudges(await step(session))).toBe(0)
    pressure = 65000
    expect(nudges(await step(session))).toBe(0)
  })

  it('re-arms after another full threshold of growth', async () => {
    const { step } = await mounted()
    const session = plainSession('nudge-rearm')
    await step(session)
    pressure = 60000
    await step(session)
    pressure = 115000
    expect(nudges(await step(session))).toBe(1)
  })

  it('fires on pressure ratio alone and escalates near the limit', async () => {
    const { step } = await mounted()
    const filling = plainSession('nudge-ratio')
    pressure = 80000
    const fillingDecision = await step(filling)
    expect(nudges(fillingDecision)).toBe(1)
    expect(JSON.stringify(fillingDecision.kind === 'enter' ? fillingDecision.messages : [])).not.toContain('NOW')

    const critical = plainSession('nudge-critical')
    pressure = 92000
    const criticalDecision = await step(critical)
    expect(nudges(criticalDecision)).toBe(1)
    expect(JSON.stringify(criticalDecision.kind === 'enter' ? criticalDecision.messages : [])).toContain('NOW')
  })

  it('resets the baseline when a fold lands', async () => {
    const { step } = await mounted()
    const session = plainSession('nudge-fold')
    await step(session)
    pressure = 60000
    await step(session)
    // A fold lands; pressure after folding sits at the folded-down level.
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    appendFold(session, plan, [{ type: 'text', text: 'Open objectives: nudge reset verification' }], { summaryTokens: 8, provider: MODEL, model: MODEL })
    pressure = 60000
    expect(nudges(await step(session))).toBe(0)
    // Growth accrues from the new baseline.
    pressure = 115000
    expect(nudges(await step(session))).toBe(1)
  })

  it('never nudges when the meter has no measurement', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    installNudge(ctx, CONFIG)
    const session = plainSession('nudge-unmeasured')
    const decision = await agentEvents(ctx, { session } as unknown as Agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'p', model: 'm' }, messages: [], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] as UserMessage[] }),
    )
    expect(nudges(decision)).toBe(0)
  })
})
