/** Edit operations over the session surface: validated replacement appends, live and cold.
 *
 * Markers ride the EVENT data (`contextEdit: {mode}`) because message sources are
 * type-constrained per role (assistant must stay `model`, tool must stay `tool`).
 * The model-side skip for excluded replacements lives in core derivation (Task 5). */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Session, SessionLogOffset } from '@deepseek-ai/dsh-session'
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
      throw new RemoteError('context-editor/bad-range', `block ${String(blockIndex)} is not text-editable`, { blockIndex })
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
  const content = editContent(message, edit.text, edit.blockIndex)
  const source = edit.blockIndex === undefined
    ? message.source
    : stripEditedSignature(message.source, edit.blockIndex, content)
  const edited = { ...message, content, source } as Message
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

/**
 * One event appended through an AppendTarget: a log-only protocol event, an
 * in-place replacement of a seq range, or a plain surface append.
 */
export interface Replacement {
  type: SessionEvent['type']
  data: Record<string, unknown>
  /** Absent for log-only protocol events (compaction start/summary/end). */
  surfaceOp?: { op: 'replace'; startSeq: number; endSeq: number } | 'append'
  sourceEventSeqs?: number[]
}

/** One append routed through Session.append (live) or a detached replay Session (cold). */
export interface AppendTarget {
  events(): readonly SessionEvent[]
  append(replacement: Replacement): SessionEvent
}

/**
 * Run a validated edit batch over a session's events — live through the host
 * Session, or cold through a detached replay Session persisted atomically.
 * @param ctx - the host context.
 * @param sessionId - the session id whose log is edited.
 * @param build - the edit body; appends replacements against the snapshot it receives.
 */
export async function applyOperations(
  ctx: Context,
  sessionId: SessionId,
  build: (events: readonly SessionEvent[], append: (replacement: Replacement) => SessionEvent) => void,
): Promise<void> {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) {
    // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
    const events = live.snapshotEvents()
    if (turnOpen(events)) {
      throw new RemoteError('context-editor/busy', `session '${sessionId}' has an open turn`, { sessionId })
    }
    const append = (r: Replacement): SessionEvent => (r.surfaceOp === undefined && r.sourceEventSeqs === undefined
      ? live.append(r.type, r.data)
      : live.append(
        r.type,
        r.data,
        {
          ...(r.surfaceOp === undefined ? {} : { surfaceOp: r.surfaceOp }),
          ...(r.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: r.sourceEventSeqs }),
        } as never,
      ))
    build(events, append)
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
    detached.append(event.type, event.data, {
      surfaceOp: event.surfaceOp as never,
      ...(event.sourceEventSeqs !== undefined ? { sourceEventSeqs: event.sourceEventSeqs } : {}),
    })
  }
  build(stored, r => detached.append(
    r.type,
    r.data,
    (r.surfaceOp === undefined && r.sourceEventSeqs === undefined
      ? undefined
      : {
        ...(r.surfaceOp === undefined ? {} : { surfaceOp: r.surfaceOp }),
        ...(r.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: r.sourceEventSeqs }),
      } as never) as never,
  ))
  // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
  const fresh = detached.snapshotEvents(SessionLogOffset(stored.length))
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

/**
 * Replace one message's text content in place.
 * @param ctx - the host context.
 * @param sessionId - the session id holding the message.
 * @param targetSeq - log seq of the message event to replace.
 * @param edit - the replacement text and, when set, the single textual block to edit.
 */
export async function editMessage(
  ctx: Context,
  sessionId: SessionId,
  targetSeq: number,
  edit: { text: string; blockIndex?: number },
): Promise<void> {
  await applyOperations(ctx, sessionId, (events, append) => {
    const target = events[targetSeq]
    if (target === undefined) {
      throw new RemoteError('context-editor/bad-range', `no event at seq ${String(targetSeq)}`, { sessionId, startSeq: targetSeq, endSeq: targetSeq })
    }
    append(replacementFor(target, sessionId, targetSeq, edit))
  })
}

/**
 * Exclude a contiguous message range from model input.
 * @param ctx - the host context.
 * @param sessionId - the session id whose range is excluded.
 * @param startSeq - first log seq of the range to exclude.
 * @param endSeq - last log seq of the range to exclude.
 */
export async function excludeRange(
  ctx: Context,
  sessionId: SessionId,
  startSeq: number,
  endSeq: number,
): Promise<void> {
  await applyOperations(ctx, sessionId, (events, append) => {
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
    append(rangeReplacement(startSeq, endSeq))
  })
}

/**
 * Exclude one message and everything after it, computed atomically against the
 * same snapshot the replacement validates over (the chat's edit-and-resend).
 * @param ctx - the host context.
 * @param sessionId - the session id whose tail is excluded.
 * @param startSeq - log seq of the first message to exclude; the tail follows it.
 */
export async function excludeFrom(
  ctx: Context,
  sessionId: SessionId,
  startSeq: number,
): Promise<void> {
  await applyOperations(ctx, sessionId, (events, append) => {
    let endSeq = -1
    for (let seq = Math.max(startSeq, 0); seq < events.length; seq += 1) {
      if (messageOf(events[seq] ?? { type: 'turn/start', data: {} } as never) !== undefined) endSeq = seq
    }
    if (endSeq < startSeq) {
      throw new RemoteError('context-editor/bad-range', `no message at or after seq ${String(startSeq)}`, { sessionId, startSeq, endSeq: startSeq })
    }
    append(rangeReplacement(startSeq, endSeq))
  })
}
