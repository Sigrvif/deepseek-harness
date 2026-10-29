/** fork(context-editor): the surface seqs that context-edit replacements shadow,
 * so the timeline folds effective content instead of stale originals. */

import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'

type DurableEntry = Extract<SessionEventLikeEntry, { readonly type: 'event' }>

function markerOf(event: { readonly data?: unknown }): { mode: string } | undefined {
  const marker = (event.data as { contextEdit?: { mode?: string } } | undefined)?.contextEdit
  return marker === undefined ? undefined : { mode: marker.mode ?? '' }
}

/** Whether a durable surface replacement event carries the Context Editor marker. */
export function isContextEditReplacement(event: SessionEventLikeEntry['event']): boolean {
  return markerOf(event) !== undefined
}

/** The surface seqs that context-edit replacements shadow, for intake filtering. */
export function contextEditShadowedSeqs(entries: readonly SessionEventLikeEntry[]): Set<number> {
  const shadowed = new Set<number>()
  for (const input of entries) {
    if (input.type !== 'event') continue
    const event = input.event as DurableEntry['event']
    if (markerOf(event) === undefined) continue
    const op = (event as { surfaceOp?: { op?: string; startSeq?: number; endSeq?: number } }).surfaceOp
    if (op === undefined || typeof op !== 'object' || op.op !== 'replace') continue
    const cited = (event as { sourceEventSeqs?: readonly number[] }).sourceEventSeqs
    if (cited !== undefined) {
      for (const seq of cited) shadowed.add(Number(seq))
      continue
    }
    for (let seq = Number(op.startSeq); seq <= Number(op.endSeq); seq += 1) shadowed.add(seq)
  }
  return shadowed
}
