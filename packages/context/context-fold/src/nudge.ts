/**
 * Growth and pressure nudges: transient per-step notices telling the model
 * when to consider folding.
 *
 * The notice rides `agent/pre-step` exactly like dsh's own model-switch
 * notice — appended to the step's messages for this request only, never
 * persisted to the session log. Cadence follows acp-kernel's nudge
 * discipline (https://github.com/ranxianglei/billion-context, MIT +
 * attribution term): one nudge per threshold crossing, re-armed by a fold
 * landing or another full threshold of growth.
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
  lastNudgePressure: number | undefined
  nudged: boolean
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
  const previous = states.get(id)
  const state: NudgeState = previous === undefined
    ? { baseline: pressureTokens, lastNudgePressure: undefined, nudged: false, foldCount }
    : previous
  if (foldCount !== state.foldCount) {
    // A fold landed since the last look: growth restarts from here.
    state.baseline = pressureTokens
    state.nudged = false
    state.lastNudgePressure = undefined
    state.foldCount = foldCount
  }
  states.set(id, state)

  const growth = pressureTokens - state.baseline
  const ratio = contextWindow === undefined ? undefined : pressureTokens / contextWindow
  const triggered = growth >= config.nudgeGrowthTokens
    || (ratio !== undefined && ratio >= config.pressureNudgeRatio)
  if (!triggered) return undefined
  if (state.nudged && pressureTokens - (state.lastNudgePressure ?? pressureTokens) < config.nudgeGrowthTokens) {
    return undefined
  }
  state.nudged = true
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
