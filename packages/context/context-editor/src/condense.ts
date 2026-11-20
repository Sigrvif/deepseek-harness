/** Selective condensation: summarize a chosen message range through the official
 * compaction event protocol (start → summary → framed checkpoint → end), the same
 * durable shape BasicCompactionEngine writes (spec §4.1, plugin-parity feature). */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { compactCheckpointSource, CompactionId } from '@deepseek-ai/dsh-compaction'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { estimateMessage } from '@deepseek-ai/dsh-token-meter/estimate'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { applyOperations } from './edits.ts'
import { messageOf } from './projection.ts'

// fork(context-editor): replicated framing constants — the upstream ones live in
// a source-only subpath that cannot be imported from packaged node_modules.
const SUMMARY_OPEN_TAG = '<compacted-summary>'
const SUMMARY_CLOSE_TAG = '</compacted-summary>'
const CHECKPOINT_PREAMBLE =
  'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.'

function frameSummary(summary: readonly ContentBlock[]): ContentBlock[] {
  return [
    { type: 'text', text: `${CHECKPOINT_PREAMBLE}\n\n${SUMMARY_OPEN_TAG}` },
    ...summary,
    { type: 'text', text: SUMMARY_CLOSE_TAG },
  ]
}

function turnOpen(events: readonly SessionEvent[]): boolean {
  let open = false
  for (const event of events) {
    if (event.type === 'turn/start') open = true
    else if (event.type === 'turn/end') open = false
  }
  return open
}

async function readEvents(ctx: Context, sessionId: SessionId): Promise<readonly SessionEvent[]> {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) {
    // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
    return live.snapshotEvents()
  }
  if (await ctx.sessionPersistence.stat(sessionId) === undefined) {
    throw new RemoteError('context-editor/session-not-found', `unknown session '${sessionId}'`, { sessionId })
  }
  const handle = await ctx.sessionPersistence.open(sessionId, 'read')
  try {
    return (await handle.read()).events
  } finally {
    await handle.close()
  }
}

/**
 * Condense [startSeq, endSeq] into one framed checkpoint user message.
 * @param ctx - the host context.
 * @param sessionId - the session id whose log is condensed.
 * @param startSeq - first log seq of the range to summarize.
 * @param endSeq - last log seq of the range to summarize.
 * @param instruction - optional steering text placed above the summarization prompt.
 * @returns the compaction id of the written compaction event group.
 */
export async function condenseRange(
  ctx: Context,
  sessionId: SessionId,
  startSeq: number,
  endSeq: number,
  instruction?: string,
): Promise<{ compactionId: CompactionId }> {
  const events = await readEvents(ctx, sessionId)
  if (turnOpen(events)) {
    throw new RemoteError('context-editor/busy', `session '${sessionId}' has an open turn`, { sessionId })
  }
  const region: SessionEvent[] = []
  for (let seq = startSeq; seq <= endSeq; seq += 1) {
    const event = events[seq]
    if (event !== undefined && messageOf(event) !== undefined) region.push(event)
  }
  if (region.length === 0) {
    throw new RemoteError('context-editor/bad-range', `range ${String(startSeq)}..${String(endSeq)} covers no message events`, { sessionId, startSeq, endSeq })
  }
  let route: { provider: string; model: string } | undefined
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'request/header') continue
    const config = event.data.header.config as { provider?: string; model?: string }
    if (typeof config.provider === 'string' && typeof config.model === 'string') {
      route = { provider: config.provider, model: config.model }
    }
    break
  }
  if (route === undefined) {
    throw new RemoteError('context-editor/bad-range', `session '${sessionId}' has no recorded model route to summarize with`, { sessionId, startSeq, endSeq })
  }
  const regionMessages = region.map(event => messageOf(event))
    .filter((message): message is Message => message !== undefined)
  const messages: GenerateOptions['messages'] = [
    ...regionMessages,
    createUserMessage({
      content: [{
        type: 'text',
        text: `${instruction === undefined ? '' : `${instruction}\n\n`}Condense the conversation above into a durable summary. Preserve task state, decisions, and open questions; drop stale detail.`,
      }],
      source: { kind: 'user' },
    }),
  ]
  const options: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages,
    purpose: 'compaction',
    sessionId,
  }
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
  const summaryBlocks = assembler.blocks()
  const summaryText = summaryBlocks.map(block => block.type === 'text' ? block.text : '').join('')
  if (summaryText.trim() === '') {
    throw new RemoteError('context-editor/bad-range', 'the summarization request produced no summary', { sessionId, startSeq, endSeq })
  }
  const compactionId = CompactionId(randomUUID())
  const shadowedSeqs = region.map(event => event.seq)
  const shadowedTokenCount = regionMessages.reduce((sum, message) => sum + estimateMessage(message), 0)
  await applyOperations(ctx, sessionId, (current, append) => {
    void current
    const startEvent = append({
      type: 'compaction/start',
      data: { compactionId, turn: null },
    })
    const summaryEvent = append({
      type: 'compaction/summary',
      data: {
        compactionId,
        summary: summaryBlocks,
        shadowedRange: { start: startSeq, end: endSeq },
        shadowedSeqs,
        shadowedTokenCount,
        provider: route.provider,
        model: route.model,
        rawOutput: summaryBlocks,
        llmStreamCall: true,
      },
    })
    append({
      type: 'user/message',
      data: createUserMessage({
        content: frameSummary(summaryBlocks),
        source: compactCheckpointSource(compactionId),
      }),
      surfaceOp: { op: 'replace', startSeq, endSeq },
      sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...shadowedSeqs],
    })
    append({ type: 'compaction/end', data: { compactionId } })
  })
  return { compactionId }
}
