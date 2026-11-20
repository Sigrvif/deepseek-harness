/** Restore operations: re-materialize shadowed originals from the append-only log.
 *
 * Single-original restores always work in place (the replacement node is shadowed
 * by a re-materialized copy of the original). Multi-original restores need the
 * replacement to be the surface tail (original 1 replaces it in place, originals
 * 2..N append after); otherwise in-place reinsertion is impossible in the surface
 * fold and the caller gets `context-editor/requires-branch` with the pre-range
 * boundary (spec §4.1b). */

import type { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { randomUUID } from 'node:crypto'
import { foldSurface, SessionSeq } from '@deepseek-ai/dsh-session'
import { applyOperations } from './edits.ts'
import type { Replacement } from './edits.ts'
import { messageOf } from './projection.ts'

function coveringReplacement(events: readonly SessionEvent[], startSeq: number, endSeq: number): SessionEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    const op = event?.surfaceOp
    if (typeof op === 'object'
      && Number(op.startSeq) <= startSeq && Number(op.endSeq) >= endSeq) return event
  }
  return undefined
}

/** The shadowed SURFACE nodes of a replacement, in order. */
function shadowedSurfaceNodes(events: readonly SessionEvent[], covering: SessionEvent): SessionEvent[] {
  const cited = covering.sourceEventSeqs
  if (cited !== undefined) {
    return cited
      .map(seq => events[seq])
      .filter((event): event is SessionEvent => event !== undefined && messageOf(event) !== undefined)
  }
  const op = covering.surfaceOp
  if (typeof op !== 'object') return []
  const result: SessionEvent[] = []
  for (let seq = Number(op.startSeq); seq <= Number(op.endSeq); seq += 1) {
    const event = events[seq]
    if (event !== undefined && messageOf(event) !== undefined) result.push(event)
  }
  return result
}

function withFreshId(data: Record<string, unknown>): Record<string, unknown> {
  const message = data['message'] as { id?: string } | undefined
  const fresh = MessageId(randomUUID())
  if (message !== undefined && typeof message === 'object') {
    return { ...data, message: { ...message, id: fresh } }
  }
  return { ...data, id: fresh }
}

function reMaterialized(
  originals: readonly SessionEvent[],
  covering: SessionEvent,
  mode: 'in-place' | 'append',
): Replacement {
  const [first, ...rest] = originals
  if (first === undefined) throw new TypeError('reMaterialized: no originals')
  // Coverage validation demands the shadowed node (the covering event) be cited;
  // the re-materialized originals ride along as cited sources.
  const cited = mode === 'in-place'
    ? [covering.seq, first.seq, ...rest.map(original => original.seq)]
    : [first.seq]
  return {
    type: first.type,
    data: withFreshId(first.data as Record<string, unknown>),
    surfaceOp: mode === 'in-place'
      ? { op: 'replace', startSeq: covering.seq, endSeq: covering.seq }
      : 'append',
    sourceEventSeqs: cited,
  }
}

function isSurfaceTail(events: readonly SessionEvent[], covering: SessionEvent): boolean {
  const { nodes } = foldSurface(events)
  return nodes.at(-1) === covering.seq
}

interface RestorePlan {
  originals: SessionEvent[]
  covering: SessionEvent
}

function planRestore(events: readonly SessionEvent[], sessionId: SessionId, startSeq: number, endSeq: number, what: string): RestorePlan {
  const covering = coveringReplacement(events, startSeq, endSeq)
  if (covering === undefined) {
    throw new RemoteError('context-editor/bad-range', `no replacement shadows ${String(startSeq)}..${String(endSeq)}`, { sessionId, startSeq, endSeq })
  }
  const originals = shadowedSurfaceNodes(events, covering)
  if (originals.length === 0) {
    throw new RemoteError('context-editor/bad-range', `the ${what} at ${String(covering.seq)} shadows no surface nodes`, { sessionId, startSeq, endSeq })
  }
  // Restoring a restore would re-apply the intermediate replacement and then
  // duplicate the original behind it: the redundant-undo case. Reject when any
  // shadowed replacement itself cites another shadowed original — there is
  // nothing left to undo for that set.
  const seqs = new Set(originals.map(original => Number(original.seq)))
  for (const original of originals) {
    if (typeof original.surfaceOp !== 'object') continue
    const cited = original.sourceEventSeqs ?? []
    if (cited.some(seq => seqs.has(Number(seq)))) {
      throw new RemoteError('context-editor/bad-range', `the ${what} at ${String(covering.seq)} already restores earlier edits; nothing left to undo`, { sessionId, startSeq: covering.seq, endSeq: covering.seq })
    }
  }
  return { originals, covering }
}

function expansion(originals: readonly SessionEvent[], covering: SessionEvent): Replacement[] {
  return originals.map((_, index) => reMaterialized(originals.slice(index), covering, index === 0 ? 'in-place' : 'append'))
}

/**
 * Undo an edit or exclusion: re-materialize the shadowed originals (spec §4.1b).
 * @param ctx - the host context.
 * @param sessionId - the session id holding the replacement to undo.
 * @param startSeq - first log seq of the shadowed range to restore.
 * @param endSeq - last log seq of the shadowed range to restore.
 */
export async function restoreRange(
  ctx: Context,
  sessionId: SessionId,
  startSeq: number,
  endSeq: number,
): Promise<void> {
  await applyOperations(ctx, sessionId, (events, append) => {
    const { originals, covering } = planRestore(events, sessionId, startSeq, endSeq, 'replacement')
    if (originals.length === 1) {
      append(reMaterialized(originals, covering, 'in-place'))
      return
    }
    if (!isSurfaceTail(events, covering)) {
      throw new RemoteError('context-editor/requires-branch', `restoring ${String(startSeq)}..${String(endSeq)} mid-history requires a recovery branch`, { sessionId, boundarySeq: startSeq - 1 })
    }
    for (const replacement of expansion(originals, covering)) append(replacement)
  })
}

/**
 * Expand a compaction checkpoint in place back to its original messages.
 * @param ctx - the host context.
 * @param sessionId - the session id holding the checkpoint.
 * @param checkpointSeq - log seq of the framed checkpoint event to expand.
 */
export async function expandCheckpoint(
  ctx: Context,
  sessionId: SessionId,
  checkpointSeq: number,
): Promise<void> {
  await applyOperations(ctx, sessionId, (events, append) => {
    const checkpoint = events[checkpointSeq]
    const source = checkpoint === undefined ? undefined
      : (messageOf(checkpoint)?.source as { kind?: string } | undefined)
    if (checkpoint === undefined || source?.kind !== 'compact-checkpoint') {
      throw new RemoteError('context-editor/bad-range', `event ${String(checkpointSeq)} is not a compaction checkpoint`, { sessionId, startSeq: checkpointSeq, endSeq: checkpointSeq })
    }
    const originals = shadowedSurfaceNodes(events, checkpoint)
    if (originals.length === 0) {
      throw new RemoteError('context-editor/bad-range', `the checkpoint at ${String(checkpointSeq)} cites no surface originals`, { sessionId, startSeq: checkpointSeq, endSeq: checkpointSeq })
    }
    if (!isSurfaceTail(events, checkpoint)) {
      throw new RemoteError('context-editor/requires-branch', `expanding checkpoint ${String(checkpointSeq)} mid-history requires a recovery branch`, { sessionId, boundarySeq: checkpointSeq - 1 })
    }
    for (const replacement of expansion(originals, checkpoint)) append(replacement)
  })
}

/**
 * Fork the session at a boundary; the child keeps the exact prefix.
 * @param ctx - the host context.
 * @param sessionId - the session id to fork.
 * @param boundarySeq - last log seq the child keeps; later events stay parent-only.
 * @returns the child session's id.
 */
export function createRecoveryBranch(
  ctx: Context,
  sessionId: SessionId,
  boundarySeq: number,
): Promise<SessionId> {
  const child = ctx.sessions.fork(sessionId, SessionSeq(boundarySeq))
  return Promise.resolve(child.id)
}
