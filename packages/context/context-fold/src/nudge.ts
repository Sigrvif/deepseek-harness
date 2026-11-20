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
 * SUBSTANTIAL context shrink WITHOUT a model fold (the engine's own
 * compaction, a large editor exclusion) re-arms everything: the world changed
 * under us. Small downward drift of the pressure estimate is not a shrink:
 * the tool-result pruner rewrites oversized results and token estimates move
 * between steps, so any downward tick re-arming the baseline would silence
 * the growth cadence for the rest of a long session (observed: exactly one
 * growth nudge after a fold, then none for the remainder of a 100k-token
 * run). A shrink counts only when it is large enough to be an event.
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

/** A downward pressure move smaller than this is estimate drift, not an event. */
const EXTERNAL_SHRINK_MIN_TOKENS = 2_000
/** …and it must also move the pressure by at least this fraction to re-arm. */
const EXTERNAL_SHRINK_RATIO = 0.1

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
  // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
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
  } else if (state.lastPressure - pressureTokens >= EXTERNAL_SHRINK_MIN_TOKENS
    && state.lastPressure - pressureTokens >= state.lastPressure * EXTERNAL_SHRINK_RATIO) {
    // The context shrank substantially with no model fold - engine compaction
    // or a large editor exclusion. Everything re-arms: one fresh nudge is
    // allowed if still tight. Smaller downward moves are estimate drift (see
    // the module comment); they leave the baseline and the gate alone.
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
  return nudgeMessage(
    `${usage} ${nudgeInstruction(ratio, pressureTokens, config)}`,
    `context ${ratio === undefined ? 'growth' : 'pressure'} nudge`,
  )
}

/**
 * The reminder's urgency follows the measured usage. A flat "compress now"
 * at 15% of a large window made literal-minded small models fold needlessly
 * early, while the same gentle wording high in the window got ignored — so
 * the wording escalates: informational while the window is mostly free AND
 * the absolute usage is still small (a million-token window must escalate at
 * real token counts, not wait for 40% of itself), advisory once either bound
 * is crossed, demanding past the demand ratio, and urgent near the limit.
 */
function nudgeInstruction(ratio: number | undefined, pressureTokens: number, config: ResolvedFoldConfig): string {
  if (ratio !== undefined && ratio >= 0.9) {
    return 'Call compress NOW: fold the oldest consumed ranges into a summary you write, keeping the protected tail.'
  }
  if (ratio !== undefined && ratio >= config.nudgeDemandRatio) {
    return 'Compress now, before producing more output: call compress on the oldest '
      + 'consumed ranges (one compress call per batch). Do not postpone folding — '
      + 'waiting makes the eventual cleanup lossier. acp_status shows details.'
  }
  const informational = ratio !== undefined
    && ratio < config.nudgeAdviseRatio
    && pressureTokens < config.nudgeInfoMaxTokens
  if (informational) {
    return 'Context is accumulating; no action is needed yet. When it builds up, '
      + 'you can call compress to fold consumed ranges into summaries you write — '
      + 'the originals stay readable via decompress. acp_status shows details.'
  }
  return 'Consider calling compress now: fold the oldest consumed ranges into a '
    + 'summary you write (one compress call per batch). acp_status shows details.'
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
