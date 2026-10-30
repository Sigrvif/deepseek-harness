/**
 * The four context-fold tools. This module owns registration and the
 * model-facing result contracts; fold mechanics live in ./fold.ts.
 *
 * `compress` executes mid-turn by design: the model calls it like any tool,
 * the fold lands as checkpoint events on the session log, and the NEXT request
 * sees the folded surface. Gates (too-small ranges, degenerate summaries)
 * return guidance values — never thrown errors — so the model can retry.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { estimateMessage } from '@deepseek-ai/dsh-token-meter/estimate'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { appendFold, deriveFoldRecords, FoldError, messageOf, planFold } from './fold.ts'
import type { FoldPlan, FoldRecord } from './fold.ts'
import {
  COMPRESS_DESCRIPTION,
  COMPRESS_KEEP_LAST_PARAMETER_DESCRIPTION,
  COMPRESS_SUMMARY_PARAMETER_DESCRIPTION,
  DECOMPRESS_DESCRIPTION,
} from './prompts.ts'

/** Every fold knob, resolved from plugin config (Task 8) or constructed directly in tests. */
export interface ResolvedFoldConfig {
  enabled: boolean
  keepLast: number
  minFoldChars: number
  minSummaryChars: number
  decompressCapChars: number
  searchLimit: number
  nudgeGrowthTokens: number
  pressureNudgeRatio: number
}

/** The compress tool's canonical value: a fold receipt or gate guidance. */
export interface CompressValue {
  ok: boolean
  folded?: number
  savedTokens?: number
  checkpointSeq?: number
  foldId?: string
  reason?: string
  hint?: string
}

function gateValue(error: FoldError): CompressValue {
  if (error.code === 'fold/too-small') {
    return {
      ok: false,
      reason: error.message,
      hint: 'Wait until more consumed history exists, or lower the protected tail with keepLast, then try again; acp_status shows current usage.',
    }
  }
  return {
    ok: false,
    reason: error.message,
    hint: 'Nothing older than the protected tail is foldable yet; call acp_status to see usage and what can be folded.',
  }
}

/** The decompress tool's canonical value. */
export interface DecompressValue {
  ok: boolean
  foldId?: string
  messageCount?: number
  content?: string
  reason?: string
  hint?: string
}

/** Markdown rendering of one fold's original messages, in fold order. */
function renderFoldOriginals(
  events: readonly SessionEvent[],
  record: FoldRecord,
  cap: number,
): { content: string; truncated: boolean } {
  const lines: string[] = []
  for (const seq of record.shadowedSeqs) {
    const message = messageOf(events[Number(seq)])
    if (message === undefined) continue
    const text = message.content
      .map(block => (typeof (block as { text?: unknown }).text === 'string' ? (block as { text: string }).text : ''))
      .join('')
    lines.push(`[${message.role}] ${text}`)
  }
  const full = lines.join('\n')
  if (full.length <= cap) return { content: full, truncated: false }
  return {
    content: `${full.slice(0, cap)}\n\n[fold ${record.foldId.slice(0, 8)} truncated at ${String(cap)} chars - use search_context to find specific content within the fold]`,
    truncated: true,
  }
}

function decompressTool(config: ResolvedFoldConfig): ToolDefinition {
  return defineTool({
    name: 'decompress',
    description: DECOMPRESS_DESCRIPTION,
    parameters: {
      foldId: { type: 'string', description: 'Fold id from acp_status or a compress receipt (short form works); omit for the newest fold.' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          foldId: { type: 'string' },
          messageCount: { type: 'number' },
          content: { type: 'string' },
          reason: { type: 'string' },
          hint: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args: { foldId?: string }, value: DecompressValue): ContentBlock[] => {
        if (!value.ok) return [{ type: 'text', text: `${value.reason ?? 'decompress was refused'}\n\n${value.hint ?? ''}` }]
        return [{ type: 'text', text: value.content ?? '' }]
      },
    },
    async execute(args: { foldId?: string }, exec): Promise<DecompressValue> {
      const session = exec.agent?.session
      if (session === undefined) {
        throw new Error('context-fold decompress: no agent session on the execution context; decompress runs only inside an agent turn')
      }
      const events = session.snapshotEvents()
      const records = deriveFoldRecords(events)
      if (records.length === 0) {
        return { ok: false, reason: 'no folds recorded for this session yet - nothing to decompress', hint: 'Call acp_status to see usage; compress creates folds.' }
      }
      let target: FoldRecord
      if (args.foldId === undefined) {
        target = records[records.length - 1] as FoldRecord
      } else {
        const given = args.foldId.trim().toLowerCase()
        const candidates = given.length >= 8
          ? records.filter(record => record.foldId.toLowerCase().startsWith(given))
          : []
        if (candidates.length !== 1) {
          return {
            ok: false,
            reason: `fold id '${args.foldId}' matches ${String(candidates.length)} folds`,
            hint: `Available folds: ${records.map(record => record.foldId.slice(0, 8)).join(', ')}. Call acp_status for the full ledger.`,
          }
        }
        target = candidates[0] as FoldRecord
      }
      const { content } = renderFoldOriginals(events, target, config.decompressCapChars)
      return {
        ok: true,
        foldId: target.foldId.slice(0, 8),
        messageCount: target.shadowedSeqs.length,
        content,
      }
    },
  })
}

function compressTool(config: ResolvedFoldConfig): ToolDefinition {
  return defineTool({
    name: 'compress',
    description: COMPRESS_DESCRIPTION,
    parameters: {
      summary: { type: 'string', required: true, description: COMPRESS_SUMMARY_PARAMETER_DESCRIPTION },
      keepLast: { type: 'integer', description: COMPRESS_KEEP_LAST_PARAMETER_DESCRIPTION },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          folded: { type: 'number' },
          savedTokens: { type: 'number' },
          checkpointSeq: { type: 'number' },
          foldId: { type: 'string' },
          reason: { type: 'string' },
          hint: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args: { summary: string }, value: CompressValue): ContentBlock[] => {
        if (!value.ok) {
          return [{ type: 'text', text: `${value.reason ?? 'the fold was refused'}\n\n${value.hint ?? ''}` }]
        }
        return [{
          type: 'text',
          text: `Folded ${String(value.folded ?? 0)} messages into fold ${value.foldId ?? '?'} (saved ~${String(value.savedTokens ?? 0)} tokens). The originals stay recoverable with decompress; acp_status shows current usage.`,
        }]
      },
    },
    async execute(args: { summary: string; keepLast?: number }, exec): Promise<CompressValue> {
      const session: Session | undefined = exec.agent?.session
      if (session === undefined) {
        throw new Error('context-fold compress: no agent session on the execution context; compress runs only inside an agent turn')
      }
      const text = args.summary.trim()
      if (text.length < config.minSummaryChars) {
        return {
          ok: false,
          reason: `summary is ${String(text.length)} chars, under the ${String(config.minSummaryChars)}-char minimum - nothing was folded`,
          hint: 'Rewrite the summary as a durable record: file paths with line numbers, commands, ids, decisions, verbatim user quotes labeled as history, and an Open objectives carry-forward line.',
        }
      }
      let plan: FoldPlan
      try {
        plan = planFold(session.snapshotEvents(), {
          keepLast: args.keepLast ?? config.keepLast,
          minFoldChars: config.minFoldChars,
        })
      } catch (error) {
        if (error instanceof FoldError) return gateValue(error)
        throw error
      }
      const route = session.requestHeader()?.config
      const summaryTokens = estimateMessage(createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      }))
      const summaryBlocks: ContentBlock[] = [{ type: 'text', text }]
      const { checkpointSeq } = appendFold(session, plan, summaryBlocks, {
        summaryTokens,
        provider: route?.provider ?? 'unknown',
        model: route?.model ?? 'unknown',
      })
      return {
        ok: true,
        folded: plan.shadowedSeqs.length,
        savedTokens: Math.max(0, plan.foldedTokens - summaryTokens),
        checkpointSeq: Number(checkpointSeq),
        foldId: plan.foldId.slice(0, 8),
      }
    },
  })
}

/**
 * Register the context-fold tools on a context.
 * @param ctx - host context carrying the tools service.
 * @param config - resolved fold configuration.
 * @returns disposer unregistering everything this call registered.
 */
export function registerFoldTools(ctx: Context, config: ResolvedFoldConfig): () => void {
  const disposers: Array<() => void> = [
    ctx.tools.register(compressTool(config)),
    ctx.tools.register(decompressTool(config)),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}
