/** Effective-context projection: model-visible rows with provenance over session events.
 *
 * Reads raw event data (not the derivation rule), so excluded replacements stay
 * visible here — flagged — while the model-side skip lives in core derivation. */

import { estimateMessage } from '@deepseek-ai/dsh-token-meter/estimate'
import { foldSurface } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import type { ContextPreview, ContextRow } from './types.ts'

const ROLES: Record<string, ContextRow['role']> = {
  'system/message': 'system',
  'developer/message': 'developer',
  'user/message': 'user',
  'assistant/message': 'assistant',
  'tool/result': 'tool',
}

/** The stored message of a surface event (data layouts differ per event type). */
export function messageOf(event: SessionEvent): Message | undefined {
  switch (event.type) {
    case 'user/message': return event.data
    case 'system/message':
    case 'developer/message':
    case 'assistant/message':
    case 'tool/result': return event.data.message
    default: return undefined
  }
}

function textOf(blocks: readonly ContentBlock[]): string {
  return blocks
    .map(block => block.type === 'text' || block.type === 'reasoning' ? block.text : '')
    .filter(text => text !== '')
    .join('\n')
}

function isExcluded(event: SessionEvent): boolean {
  const marker = (event.data as { contextEdit?: { mode?: string } }).contextEdit
  return marker?.mode === 'excluded'
}

function replaceRange(event: SessionEvent): { startSeq: number; endSeq: number } | undefined {
  const op = event.surfaceOp
  return typeof op === 'object' ? { startSeq: Number(op.startSeq), endSeq: Number(op.endSeq) } : undefined
}

function isReplacement(event: SessionEvent): boolean {
  return replaceRange(event) !== undefined
}

/** Provenance of a replacement: cited sources, or the shadowed surfaceOp range. */
function provenanceOf(event: SessionEvent): number[] {
  if (event.sourceEventSeqs !== undefined) return [...event.sourceEventSeqs]
  const range = replaceRange(event)
  if (range === undefined) return []
  const sources: number[] = []
  for (let seq = range.startSeq; seq <= range.endSeq; seq += 1) sources.push(seq)
  return sources
}

/** Project the effective context from a session's events (live snapshot or cold read). */
export function previewFromEvents(sessionId: string, events: readonly SessionEvent[]): ContextPreview {
  const { nodes } = foldSurface(events)
  const rows: ContextRow[] = []
  for (const seq of nodes) {
    const event = events[seq]
    const message = event === undefined ? undefined : messageOf(event)
    if (event === undefined || message === undefined) continue
    const replaced = isReplacement(event)
    const excluded = isExcluded(event)
    // Range-fallback provenance lists the shadowed SURFACE nodes only.
    const sources = replaced
      ? provenanceOf(event).filter(candidate => messageOf(events[candidate] ?? { type: 'turn/start', data: {} } as never) !== undefined)
      : undefined
    rows.push({
      seq,
      role: ROLES[event.type] ?? 'user',
      text: textOf(message.content),
      blocks: message.content as unknown[],
      excluded,
      ...(replaced && sources !== undefined && sources.length > 0
        ? excluded ? { excludes: sources } : { editedFrom: sources }
        : {}),
      estimateTokens: estimateMessage(message),
    })
  }
  let config: Record<string, unknown> = {}
  let tools: unknown[] | undefined
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'request/header') continue
    config = { ...event.data.header.config }
    tools = event.data.header.tools === undefined ? undefined : [...event.data.header.tools]
    break
  }
  return {
    sessionId,
    rows,
    totalTokens: rows.reduce((sum, row) => sum + row.estimateTokens, 0),
    config,
    ...tools === undefined ? {} : { tools },
  }
}
