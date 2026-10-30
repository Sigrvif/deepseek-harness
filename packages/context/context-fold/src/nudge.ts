/**
 * Growth and pressure nudges: per-step notices telling the model when to
 * consider folding.
 *
 * The notice rides `agent/pre-step` like dsh's own model-switch notice; those
 * messages persist as durable user-role snapshots, so every nudge leaves one
 * short notice row in the log (bounded below by the cadence, swept up by later
 * folds). Cadence follows acp-kernel's nudge discipline
 * (https://github.com/ranxianglei/billion-context, MIT + attribution term):
 * at most one nudge per full threshold of NEW growth - a fold landing re-arms
 * the baseline but not the growth gate (the model just acted), while a
 * context shrink WITHOUT a model fold (the engine's own compaction, editor
 * exclusions) re-arms everything: the world changed under us.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContextFormed, UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { deriveFoldRecords } from './fold.ts'
import type { ResolvedFoldConfig } from './tools.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'context-fold': { kind: 'context-fold' } & ContextFormed
  }
}

interface NudgeState {
  baseline: number
  lastPressure: number
  /** Pressure at the last fired nudge; absent until the first nudge or after an external-shrink reset. */
  lastNudgePressure: number | undefined
  foldCount: number
}

const states = new Map<string, NudgeState>()

function formatTokens(value: number): string {
  return value.toLocaleString('en-US')
}

function nudgeMessage(text: string, summary: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'context-fold', form: 'notice', summary },
  })
}

function decide(
  session: Session,
  config: ResolvedFoldConfig,
  pressureTokens: number,
  contextWindow: number | undefined,
): UserMessage | undefined {
  const foldCount = deriveFoldRecords(session.snapshotEvents()).length
  const id = String(session.id)
  const state: NudgeState = states.get(id) ?? {
    baseline: pressureTokens,
    lastPressure: pressureTokens,
    lastNudgePressure: undefined,
    foldCount,
  }
  if (foldCount !== state.foldCount) {
    // A model fold landed: growth restarts from the folded-down pressure, but
    // the growth gate stays armed - a window still above the ratio after the
    // fold must not nudge every step.
    state.baseline = pressureTokens
    state.foldCount = foldCount
  } else if (pressureTokens < state.lastPressure) {
    // The context shrank with no model fold - engine compaction or an editor
    // exclusion. Everything re-arms: one fresh nudge is allowed if still tight.
    state.baseline = pressureTokens
    state.lastNudgePressure = undefined
  }
  state.lastPressure = pressureTokens
  states.set(id, state)

  const growth = pressureTokens - state.baseline
  const ratio = contextWindow === undefined ? undefined : pressureTokens / contextWindow
  const triggered = growth >= config.nudgeGrowthTokens
    || (ratio !== undefined && ratio >= config.pressureNudgeRatio)
  if (!triggered) return undefined
  if (state.lastNudgePressure !== undefined
    && pressureTokens - state.lastNudgePressure < config.nudgeGrowthTokens) {
    return undefined
  }
  state.lastNudgePressure = pressureTokens

  const usage = contextWindow === undefined
    ? `Context has grown by ~${formatTokens(growth)} tokens since the last fold.`
    : `Context usage: ~${formatTokens(pressureTokens)} of ${formatTokens(contextWindow)} (${Math.floor((pressureTokens / contextWindow) * 100)}%), grown ~${formatTokens(Math.max(0, growth))} since the last fold.`
  const urgent = ratio !== undefined && ratio >= 0.9
  return nudgeMessage(
    `${usage} ${urgent
      ? 'Call compress NOW: fold the oldest consumed ranges into a summary you write, keeping the protected tail.'
      : 'Consider calling compress now: fold the oldest consumed ranges into a summary you write (one compress call per batch). acp_status shows details.'}`,
    `context ${ratio === undefined ? 'growth' : 'pressure'} nudge`,
  )
}

/**
 * Install the fold nudge listener on a context.
 * @param ctx - plugin context; the optional tokenMeter service supplies pressure.
 * @param config - resolved fold configuration.
 * @returns disposer removing the listener.
 */
export function installNudge(ctx: Context, config: ResolvedFoldConfig): () => void {
  return ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const meter = ctx.get('tokenMeter') as
      | { contextPressure?: (session: Session) => { pressureTokens?: number; contextWindow?: number } }
      | undefined
    const pressure = meter?.contextPressure?.(agent.session)
    if (pressure?.pressureTokens === undefined) return decision
    const notice = decide(agent.session, config, pressure.pressureTokens, pressure.contextWindow)
    if (notice === undefined) return decision
    return { ...decision, messages: [...decision.messages, notice] }
  })
}
