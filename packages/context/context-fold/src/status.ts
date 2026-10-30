/**
 * Context usage reporting for folds: pressure, window, ledger, guidance.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { deriveFoldRecords } from './fold.ts'
import type { FoldRecord } from './fold.ts'

/** Everything acp_status and nudges report, derived live. */
export interface FoldUsage {
  pressureTokens: number | undefined
  contextWindow: number | undefined
  foldCount: number
  foldedTokens: number
  records: FoldRecord[]
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * Read one session's usage: token-meter pressure (with the model-info window
 * as fallback), plus the fold ledger derived from the log.
 * @param ctx - context carrying optional tokenMeter and llm services.
 * @param session - the session to report on.
 * @returns usage with absent numbers left undefined — never guessed.
 */
export async function foldUsage(ctx: Context, session: Session): Promise<FoldUsage> {
  const records = deriveFoldRecords(session.snapshotEvents())
  const meter = ctx.get('tokenMeter') as
    | { contextPressure?: (session: Session) => { pressureTokens?: number; contextWindow?: number } }
    | undefined
  const pressure = meter?.contextPressure?.(session) ?? {}
  let contextWindow = pressure.contextWindow
  if (contextWindow === undefined) {
    const route = session.requestHeader()?.config
    const llm = ctx.get('llm') as
      | { resolveModelInfo?: (provider: string, model: string) => Promise<{ contextWindow?: number }> }
      | undefined
    if (route !== undefined && llm?.resolveModelInfo !== undefined) {
      // Advisory only: a failing lookup must not break the status report.
      contextWindow = await llm.resolveModelInfo(route.provider, route.model)
        .then(info => info.contextWindow)
        .catch(() => undefined)
    }
  }
  return {
    pressureTokens: pressure.pressureTokens,
    contextWindow,
    foldCount: records.length,
    foldedTokens: records.reduce((sum, record) => sum + record.foldedTokens, 0),
    records,
  }
}

/** One-line usage summary for receipts and nudges. */
export function usageLine(usage: FoldUsage): string {
  const used = usage.pressureTokens === undefined ? 'unknown' : `~${formatCount(usage.pressureTokens)}`
  const window = usage.contextWindow === undefined ? 'unknown' : formatCount(usage.contextWindow)
  const ratio = usage.pressureTokens !== undefined && usage.contextWindow !== undefined
    ? ` (${Math.floor((usage.pressureTokens / usage.contextWindow) * 100)}%)`
    : ''
  return `Context now: ${used} of ${window}${ratio}`
}

/**
 * Render the full status report: usage line, fold ledger oldest-first, and
 * guidance that flips at the configured pressure ratio.
 * @param usage - from {@link foldUsage}.
 * @param pressureNudgeRatio - ratio at which guidance turns to compress advice.
 * @returns markdown-ish plain text for the acp_status tool result.
 */
export function renderStatus(usage: FoldUsage, pressureNudgeRatio: number): string {
  const lines: string[] = [usageLine(usage)]
  if (usage.records.length === 0) {
    lines.push('No folds yet.')
  } else {
    lines.push(`Folds: ${String(usage.foldCount)} (folded ~${formatCount(usage.foldedTokens)} tokens)`)
    for (const record of usage.records) {
      lines.push(`- ${record.foldId.slice(0, 8)}  folded ~${formatCount(record.foldedTokens)} -> summary ~${formatCount(record.summaryTokens)}  (checkpoint seq ${String(Number(record.checkpointSeq))})`)
    }
  }
  const ratio = usage.pressureTokens !== undefined && usage.contextWindow !== undefined
    ? usage.pressureTokens / usage.contextWindow
    : undefined
  if (ratio === undefined) {
    lines.push('Guidance: window size unknown; fold by need, not by percentage.')
  } else if (ratio >= 0.9) {
    lines.push('Guidance: context is nearly full - call compress NOW on the oldest consumed ranges; keep the protected tail.')
  } else if (ratio >= pressureNudgeRatio) {
    lines.push('Guidance: context is filling - call compress on consumed ranges before it gets tight.')
  } else {
    lines.push('Guidance: healthy - keep folding by need, not by percentage.')
  }
  return lines.join('\n')
}
