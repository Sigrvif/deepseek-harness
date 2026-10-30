/**
 * Keyword search over the fold corpus: fold summaries plus their shadowed
 * originals, and the visible surface messages.
 *
 * fork(context-fold): scoring follows acp-kernel's hybrid approach in spirit
 * (https://github.com/ranxianglei/billion-context, MIT + attribution term) —
 * term-frequency weighting with inverse-corpus-frequency, plus a substring
 * bonus for long terms — implemented natively and compactly for dsh's much
 * smaller per-session corpus.
 * @module
 */

import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session'
import { foldSurface } from '@deepseek-ai/dsh-session'
import type { FoldRecord } from './fold.ts'
import { messageOf } from './fold.ts'

/** One scored search result. */
export interface SearchHit {
  kind: 'fold' | 'message'
  foldId?: string
  seq?: SessionSeq
  snippet: string
  score: number
}

interface SearchDoc {
  kind: 'fold' | 'message'
  foldId?: string
  seq?: SessionSeq
  text: string
  order: number
}

const SNIPPET_RADIUS = 60

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^0-9a-z]+/u).filter(term => term.length >= 2)
}

function snippetAround(text: string, term: string): string {
  const lower = text.toLowerCase()
  const at = lower.indexOf(term)
  if (at === -1) return text.slice(0, SNIPPET_RADIUS * 2)
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(text.length, at + term.length + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

/** The text blocks of a message, joined. */
function textOf(message: { content: readonly unknown[] } | undefined): string {
  if (message === undefined) return ''
  return message.content
    .map(block => (typeof (block as { text?: unknown }).text === 'string' ? (block as { text: string }).text : ''))
    .join('')
}

/**
 * Search fold records (summary plus shadowed originals) and the visible
 * surface, returning scored hits best-first.
 * @param query - raw keyword query.
 * @param records - fold records derived from the same log.
 * @param events - complete session log in seq order.
 * @param limit - maximum hits to return.
 * @returns hits sorted by score; ties prefer folds, then older documents.
 */
export function searchContext(
  query: string,
  records: readonly FoldRecord[],
  events: readonly SessionEvent[],
  limit: number,
): SearchHit[] {
  const foldIds = new Set(records.map(record => record.foldId))
  const docs: SearchDoc[] = []
  records.forEach((record, index) => {
    const originals = record.shadowedSeqs
      .map(seq => textOf(messageOf(events[Number(seq)])))
      .join('\n')
    docs.push({
      kind: 'fold',
      foldId: record.foldId,
      seq: record.checkpointSeq,
      text: `${record.summaryText}\n${originals}`,
      order: index,
    })
  })
  const { nodes, projectedMessages } = foldSurface(events)
  nodes.forEach((seq, index) => {
    const event = events[Number(seq)]
    // Model-fold checkpoints duplicate their fold document; skip them. Other
    // checkpoints (engine compaction) stay searchable as ordinary messages.
    const source = event?.type === 'user/message'
      ? (event.data as { source?: { kind?: string; compactionId?: string } }).source
      : undefined
    if (source?.kind === 'compact-checkpoint' && foldIds.has(source.compactionId ?? '')) return
    const message = projectedMessages.get(seq) ?? messageOf(event)
    const text = textOf(message)
    if (text === '') return
    docs.push({ kind: 'message', seq, text, order: index })
  })

  const terms = tokenize(query)
  if (terms.length === 0) return []
  const docTerms = docs.map(doc => new Set(tokenize(doc.text)))
  const scores = docs.map((doc, docIndex) => {
    const bag = docTerms[docIndex] as Set<string>
    let score = 0
    for (const term of terms) {
      if (!bag.has(term)) continue
      const matches = docTerms.reduce((sum, other) => sum + (other.has(term) ? 1 : 0), 0)
      score += Math.log(1 + docs.length / matches)
      if (term.length >= 5 && doc.text.toLowerCase().includes(term)) score += 0.5
    }
    return score
  })
  return docs
    .map((doc, index) => ({ doc, score: scores[index] as number }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score
      || (left.doc.kind === right.doc.kind ? left.doc.order - right.doc.order : left.doc.kind === 'fold' ? -1 : 1))
    .slice(0, Math.max(1, limit))
    .map(entry => ({
      kind: entry.doc.kind,
      ...(entry.doc.foldId === undefined ? {} : { foldId: entry.doc.foldId.slice(0, 8) }),
      ...(entry.doc.seq === undefined ? {} : { seq: entry.doc.seq }),
      snippet: snippetAround(entry.doc.text, terms[0] as string),
      score: entry.score,
    }))
}
