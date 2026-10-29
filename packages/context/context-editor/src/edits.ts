/** Edit operations over the session surface: validated replacement appends, live and cold.
 *
 * Markers ride the EVENT data (`contextEdit: {mode}`) because message sources are
 * type-constrained per role (assistant must stay `model`, tool must stay `tool`).
 * The model-side skip for excluded replacements lives in core derivation (Task 5). */

import type { Context } from '@deepseek-ai/cordis'
import { Session } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { messageOf } from './projection.ts'

const TEXTUAL = new Set(['text', 'reasoning'])

/** The fork's replacement marker on replacement event data. */
export interface ContextEditMarker {
  mode: 'edited' | 'excluded'
}

function dataRecord(event: SessionEvent): Record<string, unknown> {
  return event.data as Record<string, unknown>
}

function marker(mode: ContextEditMarker['mode']): Record<string, unknown> {
  return { contextEdit: { mode } }
}

function turnOpen(events: readonly SessionEvent[]): boolean {
  let open = false
  for (const event of events) {
    if (event.type === 'turn/start') open = true
    else if (event.type === 'turn/end') open = false
  }
  return open
}

function editContent(message: Message, text: string, blockIndex: number | undefined): ContentBlock[] {
  const content = message.content
  if (blockIndex !== undefined) {
    const block = content[blockIndex]
    if (block === undefined || !TEXTUAL.has(block.type)) {
      throw new RemoteError('context-editor/bad-range', `block ${String(blockIndex)} is not text-editable`, { sessionId: '', startSeq: blockIndex, endSeq: -1 })
    }
    return content.map((candidate, index) => index === blockIndex ? { ...candidate, text } : candidate)
  }
  const first = content.findIndex(candidate => TEXTUAL.has(candidate.type))
  const textBlock = { type: 'text', text } as ContentBlock
  if (first === -1) return [...content, textBlock]
  return content.flatMap((candidate, index) =>
    index === first ? [textBlock] : TEXTUAL.has(candidate.type) ? [] : [candidate])
}

/** Drop the replay signature of exactly the edited block; other blocks keep theirs. */
function stripEditedSignature(source: Message['source'], blockIndex: number, content: readonly ContentBlock[]): Message['source'] {
  const record = source as { replayState?: { blocks?: { type?: string; signature?: string }[] } }
  const blocks = record.replayState?.blocks
  if (blocks?.[blockIndex] === undefined) return source
  const nextBlocks = blocks.map((block, index) => index === blockIndex
    ? { type: content[blockIndex]?.type ?? block.type }
    : block)
  return {
    ...source,
    replayState: { ...record.replayState, blocks: nextBlocks },
  } as Message['source']
}

function replacementFor(
  target: SessionEvent,
  sessionId: SessionId,
  targetSeq: number,
  edit: { text: string; blockIndex?: number },
): { type: SessionEvent['type']; data: Record<string, unknown>; surfaceOp: { op: 'replace'; startSeq: number; endSeq: number }; sourceEventSeqs?: number[] } {
  const message = messageOf(target)
  if (message === undefined) {
    throw new RemoteError('context-editor/bad-range', `event ${String(targetSeq)} is not a message`, { sessionId, startSeq: targetSeq, endSeq: targetSeq })
  }
  const data = dataRecord(target)
  const edited: Message = {
    ...message,
    content: editContent(message, edit.text, edit.blockIndex),
  }
  if (edit.blockIndex !== undefined) edited.source = stripEditedSignature(edited.source, edit.blockIndex, edited.content)
  const surfaceOp = { op: 'replace' as const, startSeq: targetSeq, endSeq: targetSeq }
  if (target.type === 'user/message') {
    return { type: target.type, data: { ...edited, ...marker('edited') }, surfaceOp, sourceEventSeqs: [targetSeq] }
  }
  if (target.type === 'tool/result') {
    // The content-only rule compares the whole data record: no marker key here.
    return {
      type: target.type,
      data: { turn: data['turn'] ?? 0, step: data['step'] ?? 1, message: edited },
      surfaceOp, sourceEventSeqs: [targetSeq],
    }
  }
  if (target.type === 'assistant/message' || target.type === 'system/message' || target.type === 'developer/message') {
    return {
      type: target.type,
      data: { turn: data['turn'] ?? 0, step: data['step'] ?? 1, message: edited, ...marker('edited') },
      surfaceOp, sourceEventSeqs: [targetSeq],
    }
  }
  throw new RemoteError('context-editor/bad-range', `event ${String(targetSeq)} is not a message`, { sessionId, startSeq: targetSeq, endSeq: targetSeq })
}

function rangeReplacement(startSeq: number, endSeq: number): { type: SessionEvent['type']; data: Record<string, unknown>; surfaceOp: { op: 'replace'; startSeq: number; endSeq: number }; sourceEventSeqs: number[] } {
  const sources: number[] = []
  for (let seq = startSeq; seq <= endSeq; seq += 1) sources.push(seq)
  return {
    type: 'user/message',
    data: {
      ...createUserMessage({ content: [], source: { kind: 'user' } }),
      ...marker('excluded'),
    },
    surfaceOp: { op: 'replace', startSeq, endSeq },
    sourceEventSeqs: sources,
  }
}

interface Replacement {
  type: SessionEvent['type']
  data: Record<string, unknown>
  surfaceOp: { op: 'replace'; startSeq: number; endSeq: number }
  sourceEventSeqs?: number[]
}

async function applyReplacement(
  ctx: Context,
  sessionId: SessionId,
  build: (events: readonly SessionEvent[]) => Replacement,
): Promise<void> {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) {
    // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred (mirrors message-feedback).
    const events = live.snapshotEvents()
    if (turnOpen(events)) {
      throw new RemoteError('context-editor/busy', `session '${sessionId}' has an open turn`, { sessionId })
    }
    const replacement = build(events)
    live.append(replacement.type, replacement.data as never, {
      surfaceOp: replacement.surfaceOp,
      ...(replacement.sourceEventSeqs !== undefined ? { sourceEventSeqs: replacement.sourceEventSeqs } : {}),
    })
    if (!(await ctx.sessions.flush(live))) {
      throw new Error(`context-editor: no durability listener for live session '${sessionId}'`)
    }
    return
  }
  if (await ctx.sessionPersistence.stat(sessionId) === undefined) {
    throw new RemoteError('context-editor/session-not-found', `unknown session '${sessionId}'`, { sessionId })
  }
  const read = await ctx.sessionPersistence.open(sessionId, 'read')
  let stored: readonly SessionEvent[]
  try {
    stored = (await read.read()).events
  } finally {
    await read.close()
  }
  if (turnOpen(stored)) {
    throw new RemoteError('context-editor/busy', `session '${sessionId}' has an open turn`, { sessionId })
  }
  // Replay into a detached Session so every replacement runs the host's own
  // validation, then persist only the newly appended events.
  const detached = Session.create(sessionId)
  for (const event of stored) {
    detached.append(event.type, event.data as never, {
      surfaceOp: event.surfaceOp,
      ...(event.sourceEventSeqs !== undefined ? { sourceEventSeqs: event.sourceEventSeqs } : {}),
    })
  }
  const replacement = build(stored)
  detached.append(replacement.type, replacement.data as never, {
    surfaceOp: replacement.surfaceOp,
    ...(replacement.sourceEventSeqs !== undefined ? { sourceEventSeqs: replacement.sourceEventSeqs } : {}),
  })
  const fresh = detached.snapshotEvents(stored.length)
  const handle = await ctx.sessionPersistence.open(sessionId, 'write')
  try {
    const { events: reread } = await handle.read()
    if (reread.length !== stored.length) {
      throw new Error(`context-editor: session '${sessionId}' changed during the cold edit`)
    }
    await handle.append(fresh.map(event => ({ ...event })))
    await handle.flush()
  } finally {
    await handle.close()
  }
}

/** Replace one message's text content in place. */
export async function editMessage(
  ctx: Context,
  sessionId: SessionId,
  targetSeq: number,
  edit: { text: string; blockIndex?: number },
): Promise<void> {
  await applyReplacement(ctx, sessionId, (events) => {
    const target = events[targetSeq]
    if (target === undefined) {
      throw new RemoteError('context-editor/bad-range', `no event at seq ${String(targetSeq)}`, { sessionId, startSeq: targetSeq, endSeq: targetSeq })
    }
    return replacementFor(target, sessionId, targetSeq, edit)
  })
}

/** Exclude a contiguous message range from model input. */
export async function excludeRange(
  ctx: Context,
  sessionId: SessionId,
  startSeq: number,
  endSeq: number,
): Promise<void> {
  await applyReplacement(ctx, sessionId, (events) => {
    let surfaceNodes = 0
    for (let seq = startSeq; seq <= endSeq; seq += 1) {
      const event = events[seq]
      if (event === undefined) continue
      if (messageOf(event) === undefined) continue // non-surface log events may sit inside the range
      surfaceNodes += 1
    }
    if (surfaceNodes === 0) {
      throw new RemoteError('context-editor/bad-range', `range ${String(startSeq)}..${String(endSeq)} covers no message events`, { sessionId, startSeq, endSeq })
    }
    return rangeReplacement(startSeq, endSeq)
  })
}
