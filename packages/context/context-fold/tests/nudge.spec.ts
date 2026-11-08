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
  nudgeAdviseRatio: 0.4,
  nudgeInfoMaxTokens: 200000,
  nudgeDemandRatio: 0.7,
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

  it('escalates the nudge wording with context usage', async () => {
    const { step } = await mounted()
    // A large window so the growth gate can fire at low ratios.
    window = 300000
    // 20% of the window: the growth threshold fires, but the wording is
    // informational - a flat "compress now" here made small models fold
    // needlessly early.
    const early = plainSession('nudge-tier-info')
    pressure = 2000
    await step(early)
    pressure = 60000
    const earlyDecision = await step(early)
    const earlyText = JSON.stringify(earlyDecision.kind === 'enter' ? earlyDecision.messages : [])
    expect(nudges(earlyDecision)).toBe(1)
    expect(earlyText).toContain('no action is needed yet')
    expect(earlyText).not.toContain('Consider calling compress')

    // 53%: advisory - the incumbent wording.
    const advise = plainSession('nudge-tier-advise')
    pressure = 2000
    await step(advise)
    pressure = 160000
    const adviseDecision = await step(advise)
    const adviseText = JSON.stringify(adviseDecision.kind === 'enter' ? adviseDecision.messages : [])
    expect(adviseText).toContain('Consider calling compress now')

    // 80%: demanding - imperative, with a named consequence for ignoring it.
    const demand = plainSession('nudge-tier-demand')
    pressure = 2000
    await step(demand)
    pressure = 240000
    const demandDecision = await step(demand)
    const demandText = JSON.stringify(demandDecision.kind === 'enter' ? demandDecision.messages : [])
    expect(demandText).toContain('Compress now, before producing more output')
    expect(demandText).toContain('Do not postpone folding')
  })

  it('stops being informational on absolute token count, not just ratio', async () => {
    const { step } = await mounted()
    // A million-token window: 25% usage is below the advise ratio, but the
    // absolute usage passed the informational cap, so the wording escalates -
    // "wait until 400k" is no useful advice for a model that size.
    window = 1000000
    const large = plainSession('nudge-tier-absolute')
    pressure = 2000
    await step(large)
    pressure = 250000
    const decision = await step(large)
    const text = JSON.stringify(decision.kind === 'enter' ? decision.messages : [])
    expect(text).toContain('Consider calling compress now')
    expect(text).not.toContain('no action is needed yet')
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

  it('does not re-nudge on the ratio path without new growth after a fold', async () => {
    const { step } = await mounted()
    const session = plainSession('nudge-ratio-rearm')
    pressure = 92000
    await step(session)
    // A fold lands, but the window stays above the ratio threshold.
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    appendFold(session, plan, [{ type: 'text', text: 'Open objectives: cadence re-arm verification' }], { summaryTokens: 8, provider: MODEL, model: MODEL })
    pressure = 91000
    expect(nudges(await step(session))).toBe(0)
    expect(nudges(await step(session))).toBe(0)
    pressure = 145000
    expect(nudges(await step(session))).toBe(1)
  })

  it('re-arms after the context shrinks without a model fold (engine compaction)', async () => {
    const { step } = await mounted()
    const session = plainSession('nudge-shrink')
    await step(session)
    pressure = 60000
    await step(session)
    // The engine's own compaction shrinks the context; no model fold exists,
    // so the fold-count signal cannot see it.
    pressure = 30000
    await step(session)
    pressure = 85000
    expect(nudges(await step(session))).toBe(1)
  })

  it('does not treat downward estimate drift as a shrink', async () => {
    const { step } = await mounted()
    window = 400000
    const session = plainSession('nudge-drift')
    await step(session)
    pressure = 60000
    await step(session) // first nudge: 60000 growth over the step-1 baseline
    pressure = 61000
    await step(session) // quiet: barely past the fired nudge
    // The pruner rewrote a result and estimates moved: pressure ticks down a
    // little. That is not an event - the baseline must survive it, or the
    // growth cadence goes silent for the rest of the session (the final
    // pressure is only 54500 above the drifted value, but 115000 above the
    // real one).
    pressure = 60500
    await step(session)
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
