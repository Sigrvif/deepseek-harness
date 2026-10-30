/** Model-driven context folds: planning, checkpoint-protocol appends, and
 * event-sourced fold records.
 *
 * A fold is a compaction checkpoint the MODEL asked for: it calls `compress`,
 * writes the summaries itself, and this module replaces the planned message
 * range with one framed checkpoint user message through the session's own
 * surface replacement machinery. The append-only log keeps the shadowed
 * originals forever, so `decompress` and `search_context` read them back
 * without any parallel state store — the log is the single source of truth.
 * The design adopts billion-context's model-driven compression behavior
 * natively (see src/prompts.ts for attribution). */

import { randomUUID } from 'node:crypto'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { CompactionId, compactCheckpointSource } from '@deepseek-ai/dsh-compaction'
import type { Session, SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session'
import { foldSurface } from '@deepseek-ai/dsh-session'
import { estimateMessage } from '@deepseek-ai/dsh-token-meter/estimate'

// fork(context-fold): framing tags replicate the compaction checkpoint framing
// (upstream constants live in a source-only subpath) so every checkpoint on
// the surface reads consistently; the preamble states the model-fold contract.
const SUMMARY_OPEN_TAG = '<compacted-summary>'
const SUMMARY_CLOSE_TAG = '</compacted-summary>'
const FOLD_PREAMBLE =
  'This section was folded by the model to free context: it replaces the messages below with the summary that follows. Treat the summary as established background and build on it without restating it. The originals remain recoverable through the decompress tool.'

function frameFold(summaryBlocks: readonly ContentBlock[]): ContentBlock[] {
  return [
    { type: 'text', text: `${FOLD_PREAMBLE}\n\n${SUMMARY_OPEN_TAG}` },
    ...summaryBlocks,
    { type: 'text', text: SUMMARY_CLOSE_TAG },
  ]
}

/** Safe indexed read over the complete log. */
function eventAt(events: readonly SessionEvent[], seq: SessionSeq | undefined): SessionEvent | undefined {
  if (seq === undefined) return undefined
  return events[Number(seq)]
}

/** The message a surface event carries, if any (mirrors the editor's projection helper). */
export function messageOf(event: SessionEvent | undefined): Message | undefined {
  if (event === undefined) return undefined
  if (event.type === 'user/message') return event.data as unknown as Message
  if (event.type === 'assistant/message' || event.type === 'tool/result'
    || event.type === 'system/message' || event.type === 'developer/message') {
    return (event.data as { message?: Message }).message
  }
  return undefined
}

function textChars(message: Message): number {
  let chars = 0
  for (const block of message.content) {
    if (typeof (block as { text?: unknown }).text === 'string') {
      chars += (block as { text: string }).text.length
    }
  }
  return chars
}

/** Hard refusal from fold planning. */
export class FoldError extends Error {
  constructor(
    readonly code: 'fold/nothing-foldable' | 'fold/too-small',
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message)
  }
}

/** A validated fold range ready to append. */
export interface FoldPlan {
  foldId: string
  startSeq: SessionSeq
  endSeq: SessionSeq
  shadowedSeqs: SessionSeq[]
  foldedTokens: number
  skipped: string[]
}

interface ToolCallShape { type: string; id: string }

function callBlocks(message: Message): ToolCallShape[] {
  return message.content
    .filter((block): block is ContentBlock & ToolCallShape => block.type === 'tool-call')
    .map(block => ({ type: block.type, id: String(block.id) }))
}

/**
 * Plan a prefix fold over the visible surface: everything older than the last
 * `keepLast` visible messages, minus the pinned first user message, adjusted
 * so no tool call/result pair is split and no pending call is folded.
 * @param events - complete session log in seq order.
 * @param options - keepLast tail to protect (clamped ≥ 1) and minFoldChars gate.
 * @returns the fold plan; throws {@link FoldError} on hard refusals.
 */
export function planFold(
  events: readonly SessionEvent[],
  options: { keepLast: number; minFoldChars: number },
): FoldPlan {
  const { nodes } = foldSurface(events)
  const keepLast = Math.max(1, options.keepLast)
  const nothingFoldable = (): FoldError => new FoldError(
    'fold/nothing-foldable',
    `no foldable messages: ${String(nodes.length)} visible, keepLast ${String(keepLast)}`,
  )
  let endIdx = nodes.length - keepLast - 1
  if (endIdx < 0) throw nothingFoldable()
  // Leading system/developer nodes are the pinned prompt prefix — the surface
  // refuses to rewrite them, and folding them is never wanted (found on the
  // wire: node 0 of a real session is the system prompt). The first user
  // message after them (the task statement) stays visible too — billion-context
  // pins the same message, and strict providers expect it present.
  let startIdx = 0
  while (startIdx <= endIdx) {
    const role = messageOf(eventAt(events, nodes[startIdx]))?.role
    if (role === 'system' || role === 'developer') startIdx += 1
    else break
  }
  if (messageOf(eventAt(events, nodes[startIdx]))?.role === 'user') startIdx += 1
  if (startIdx > endIdx) throw nothingFoldable()

  const nodeIndex = new Map<number, number>()
  nodes.forEach((seq, index) => nodeIndex.set(Number(seq), index))
  const resultSeqByCallId = new Map<string, SessionSeq>()
  for (const event of events) {
    if (event.type !== 'tool/result') continue
    const toolCallId = (event.data as { message?: { toolCallId?: unknown } }).message?.toolCallId
    if (typeof toolCallId === 'string') resultSeqByCallId.set(toolCallId, event.seq)
  }

  // Pair safety, iterated to a fixed point: shrink below an assistant message
  // whose call has no result anywhere (a pending call), extend past a result
  // whose call stays inside (an orphaned result would 400 upstream).
  let changed = true
  while (changed) {
    changed = false
    for (let index = startIdx; index <= endIdx; index += 1) {
      const message = messageOf(eventAt(events, nodes[index]))
      if (message?.role !== 'assistant') continue
      if (callBlocks(message).some(call => !resultSeqByCallId.has(call.id))) {
        endIdx = index - 1
        changed = true
        break
      }
    }
    if (changed) continue
    const last = messageOf(eventAt(events, nodes[endIdx]))
    if (last?.role === 'assistant') {
      for (const call of callBlocks(last)) {
        const resultSeq = resultSeqByCallId.get(call.id)
        if (resultSeq === undefined) continue
        const resultIdx = nodeIndex.get(Number(resultSeq))
        if (resultIdx !== undefined && resultIdx > endIdx) {
          endIdx = resultIdx
          changed = true
        }
      }
    }
  }
  if (endIdx < startIdx) throw nothingFoldable()

  const windowSeqs = nodes.slice(startIdx, endIdx + 1)
  // Window endpoints are node-ORDER bounds; after earlier replacements a
  // node's seq can exceed a later node's, so the skip scan spans the seq span.
  const startSeq = windowSeqs[0] as SessionSeq
  const endSeq = windowSeqs[windowSeqs.length - 1] as SessionSeq
  const nodeSet = new Set(nodes.map(Number))
  const skipped: string[] = []
  for (let seq = Math.min(Number(startSeq), Number(endSeq)); seq <= Math.max(Number(startSeq), Number(endSeq)); seq += 1) {
    if (!nodeSet.has(seq)) skipped.push(`seq ${String(seq)} is not a visible surface node (protocol event or already shadowed)`)
  }
  const messages = windowSeqs
    .map(seq => messageOf(eventAt(events, seq)))
    .filter((message): message is Message => message !== undefined)
  if (messages.length === 0) throw nothingFoldable()
  const chars = messages.reduce((sum, message) => sum + textChars(message), 0)
  if (chars < options.minFoldChars) {
    throw new FoldError(
      'fold/too-small',
      `foldable range is ${String(chars)} chars, under the configured minimum of ${String(options.minFoldChars)}`,
      { chars },
    )
  }
  const foldedTokens = messages.reduce((sum, message) => sum + estimateMessage(message), 0)
  return {
    foldId: randomUUID(),
    startSeq,
    endSeq,
    shadowedSeqs: [...windowSeqs],
    foldedTokens,
    skipped,
  }
}

/**
 * Append a fold as the compaction checkpoint protocol: lifecycle events, the
 * model-written summary record, the framed checkpoint message replacing the
 * planned range, and the close. Legal mid-turn — the engine's own compaction
 * appends the same shape during the loop.
 * @param session - live or detached session to append to.
 * @param plan - a {@link planFold} plan computed from this session's log.
 * @param summaryBlocks - the model-written summary content.
 * @param meta - summary token estimate and the conversation route that wrote it.
 * @returns the protocol start event and checkpoint message seqs.
 */
export function appendFold(
  session: Session,
  plan: FoldPlan,
  summaryBlocks: readonly ContentBlock[],
  meta: { summaryTokens: number; provider: string; model: string },
): { startEventSeq: SessionSeq; checkpointSeq: SessionSeq } {
  const compactionId = CompactionId(plan.foldId)
  const startEvent = session.append('compaction/start', { compactionId, turn: null })
  const summaryEvent = session.append('compaction/summary', {
    compactionId,
    origin: 'model-fold',
    summary: [...summaryBlocks],
    shadowedRange: { start: plan.startSeq, end: plan.endSeq },
    shadowedSeqs: [...plan.shadowedSeqs],
    shadowedTokenCount: plan.foldedTokens,
    foldedTokens: plan.foldedTokens,
    summaryTokens: meta.summaryTokens,
    provider: meta.provider,
    model: meta.model,
  })
  const checkpoint = session.append('user/message', createUserMessage({
    content: frameFold(summaryBlocks),
    source: compactCheckpointSource(compactionId),
  }), {
    surfaceOp: { op: 'replace', startSeq: plan.startSeq, endSeq: plan.endSeq },
    sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...plan.shadowedSeqs],
  })
  session.append('compaction/end', { compactionId, turn: null })
  return { startEventSeq: startEvent.seq, checkpointSeq: checkpoint.seq }
}

/** One model-driven fold, derived from the log alone. */
export interface FoldRecord {
  foldId: string
  checkpointSeq: SessionSeq
  shadowedSeqs: SessionSeq[]
  summaryText: string
  foldedTokens: number
  summaryTokens: number
}

/**
 * Derive every model fold from the session log: `compaction/summary` events
 * carrying the `model-fold` origin, joined with their checkpoint messages.
 * Engine compactions (no origin marker) are ignored; an incomplete protocol
 * tail contributes nothing until its checkpoint lands.
 * @param events - complete session log in seq order.
 * @returns folds oldest-first.
 */
export function deriveFoldRecords(events: readonly SessionEvent[]): FoldRecord[] {
  const summaryByFoldId = new Map<string, SessionEvent>()
  const checkpointSeqByFoldId = new Map<string, SessionSeq>()
  for (const event of events) {
    if (event.type === 'compaction/summary') {
      const data = event.data as { compactionId?: unknown; origin?: unknown }
      if (data.origin === 'model-fold' && typeof data.compactionId === 'string') {
        summaryByFoldId.set(data.compactionId, event)
      }
    } else if (event.type === 'user/message') {
      const source = (event.data as { source?: { kind?: unknown; compactionId?: unknown } }).source
      if (source?.kind === 'compact-checkpoint' && typeof source.compactionId === 'string'
        && summaryByFoldId.has(source.compactionId)) {
        checkpointSeqByFoldId.set(source.compactionId, event.seq)
      }
    }
  }
  const records: FoldRecord[] = []
  for (const [foldId, event] of summaryByFoldId) {
    const checkpointSeq = checkpointSeqByFoldId.get(foldId)
    if (checkpointSeq === undefined) continue
    const data = event.data as {
      summary?: ContentBlock[]
      shadowedSeqs?: unknown
      foldedTokens?: unknown
      summaryTokens?: unknown
    }
    records.push({
      foldId,
      checkpointSeq,
      shadowedSeqs: Array.isArray(data.shadowedSeqs) ? data.shadowedSeqs.map(seq => seq as SessionSeq) : [],
      summaryText: (data.summary ?? [])
        .map(block => (typeof (block as { text?: unknown }).text === 'string' ? (block as { text: string }).text : ''))
        .join(''),
      foldedTokens: typeof data.foldedTokens === 'number' ? data.foldedTokens : 0,
      summaryTokens: typeof data.summaryTokens === 'number' ? data.summaryTokens : 0,
    })
  }
  return records.sort((left, right) => Number(left.checkpointSeq) - Number(right.checkpointSeq))
}
