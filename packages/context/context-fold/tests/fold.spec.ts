/** Fold planning and checkpoint-protocol appends over detached sessions. */
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { CompactionId } from '@deepseek-ai/dsh-compaction'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import { Session } from '@deepseek-ai/dsh-session'
import { appendFold, deriveFoldRecords, FoldError, planFold } from '../src/fold.ts'
import { MODEL, addTurn, assistantWithCall, plainSession, surfaceSeqs } from './fixtures.ts'

describe('planFold', () => {
  it('plans a prefix fold that leaves the last keepLast messages visible', () => {
    const session = plainSession()
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    const nodes = surfaceSeqs(session)
    expect(plan.endSeq).toBe(nodes[nodes.length - 3])
    expect(plan.shadowedSeqs).toEqual(nodes.slice(1, nodes.length - 2))
    expect(plan.startSeq).toBe(nodes[1])
    expect(plan.foldedTokens).toBeGreaterThan(0)
    expect(plan.foldId).toMatch(/^[0-9a-f-]{36}$/u)
  })

  it('pins the first visible user message outside the fold', () => {
    const session = plainSession()
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    const nodes = surfaceSeqs(session)
    expect(plan.shadowedSeqs).not.toContain(nodes[0])
  })

  it('does not pin an assistant-first surface', () => {
    const session = Session.create(SessionId('fold-assistant-first'))
    addTurn(session, 1, [
      { kind: 'assistant', text: 'seeded assistant opener with body' },
      { kind: 'user', text: 'user reply' },
      { kind: 'assistant', text: 'assistant answer' },
      { kind: 'user', text: 'latest user message' },
    ])
    const plan = planFold(session.snapshotEvents(), { keepLast: 1, minFoldChars: 1 })
    const nodes = surfaceSeqs(session)
    expect(plan.startSeq).toBe(nodes[0])
    expect(plan.shadowedSeqs).toContain(nodes[1])
  })

  it('extends the boundary past a tool result whose call stays inside the range', () => {
    const session = Session.create(SessionId('fold-pair'))
    addTurn(session, 1, [
      { kind: 'user', text: 'first user message stays visible' },
      { kind: 'assistant', text: 'assistant answer one with body text' },
      { kind: 'call', callId: 'c1' },
      { kind: 'result', callId: 'c1' },
      { kind: 'user', text: 'follow-up user message' },
      { kind: 'assistant', text: 'recent assistant answer' },
    ])
    // keepLast 3 cuts between the call (inside) and its result (outside).
    const plan = planFold(session.snapshotEvents(), { keepLast: 3, minFoldChars: 1 })
    const nodes = surfaceSeqs(session)
    const resultSeq = nodes.find((seq) => {
      const event = session.snapshotEvents()[seq]
      return event?.type === 'tool/result'
    })
    expect(resultSeq).toBeDefined()
    expect(plan.endSeq).toBe(resultSeq)
    expect(plan.shadowedSeqs).toContain(resultSeq)
  })

  it('never folds a pending tool call', () => {
    const session = Session.create(SessionId('fold-pending'))
    addTurn(session, 1, [
      { kind: 'user', text: 'first user message stays visible' },
      { kind: 'assistant', text: 'assistant answer one with plenty of body text to fold away' },
      { kind: 'user', text: 'second user message with more text' },
      { kind: 'assistant', text: 'assistant answer two with plenty of body text to fold away' },
    ])
    addTurn(session, 2, [
      { kind: 'user', text: 'current turn request' },
      { kind: 'call', callId: 'c2' },
    ], false)
    const plan = planFold(session.snapshotEvents(), { keepLast: 1, minFoldChars: 1 })
    const pending = assistantWithCall(session.snapshotEvents(), 'c2')
    expect(pending).toBeDefined()
    expect(plan.shadowedSeqs).not.toContain(pending!.seq)
    expect(plan.endSeq).toBeLessThan(pending!.seq)
  })

  it('shrinks below an in-window assistant message whose call never got a result', () => {
    const session = Session.create(SessionId('fold-shrink'))
    addTurn(session, 1, [
      { kind: 'user', text: 'first user message stays visible' },
      { kind: 'assistant', text: 'assistant answer one with plenty of body text to fold away' },
      { kind: 'call', callId: 'c9' },
      // No result for c9; a later user message makes the gap land inside the window.
      { kind: 'user', text: 'a later user message that stays visible' },
    ])
    const plan = planFold(session.snapshotEvents(), { keepLast: 1, minFoldChars: 1 })
    const dangling = assistantWithCall(session.snapshotEvents(), 'c9')
    expect(dangling).toBeDefined()
    expect(plan.shadowedSeqs).not.toContain(dangling!.seq)
    expect(plan.endSeq).toBeLessThan(dangling!.seq)
  })

  it('skips interior non-surface and already-shadowed events with notes', () => {
    const session = plainSession()
    const nodes = surfaceSeqs(session)
    // Shadow nodes 1..2 with an empty exclusion, context-editor style; the
    // marker rides the event data record, not the typed message.
    session.append('user/message', {
      ...createUserMessage({ content: [], source: { kind: 'user' } }),
      contextEdit: { mode: 'excluded' },
    } as never, {
      surfaceOp: { op: 'replace', startSeq: nodes[1]!, endSeq: nodes[2]! },
      sourceEventSeqs: [nodes[1]!, nodes[2]!],
    })
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    expect(plan.shadowedSeqs).not.toContain(nodes[1]!)
    expect(plan.shadowedSeqs).not.toContain(nodes[2]!)
    // Interior protocol events inside the window's seq span are noted; after
    // earlier replacements node order can differ from seq order, so the span
    // runs between the window's min and max seqs.
    expect(plan.skipped.length).toBeGreaterThan(0)
    const low = Math.min(plan.startSeq, plan.endSeq)
    const high = Math.max(plan.startSeq, plan.endSeq)
    for (const note of plan.skipped) {
      const seq = Number((note.match(/seq (\d+)/u) ?? [])[1])
      expect(seq).toBeGreaterThanOrEqual(low)
      expect(seq).toBeLessThanOrEqual(high)
    }
  })

  it('refuses ranges under the minimum character gate', () => {
    const session = plainSession()
    expect(() => planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 100000 }))
      .toThrowError(expect.objectContaining({ code: 'fold/too-small' }) as never)
  })

  it('refuses when nothing is foldable', () => {
    const session = Session.create(SessionId('fold-empty'))
    addTurn(session, 1, [
      { kind: 'user', text: 'only a user message' },
      { kind: 'assistant', text: 'one answer' },
    ])
    try {
      planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
      expect.unreachable('planFold should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(FoldError)
      expect((error as FoldError).code).toBe('fold/nothing-foldable')
    }
  })
})

describe('appendFold', () => {
  it('writes the four-event protocol and the surface folds', () => {
    const session = plainSession()
    const eventsBefore = session.snapshotEvents()
    const plan = planFold(eventsBefore, { keepLast: 2, minFoldChars: 1 })
    const summaryBlocks: ContentBlock[] = [{ type: 'text', text: 'SUMMARY: the task and decisions' }]
    const { startEventSeq, checkpointSeq } = appendFold(session, plan, summaryBlocks, { summaryTokens: 7, provider: MODEL, model: MODEL })

    const events = session.snapshotEvents()
    expect(events.length).toBe(eventsBefore.length + 4)
    const start = events[events.length - 4]!
    const summary = events[events.length - 3]!
    const checkpoint = events[events.length - 2]!
    const end = events[events.length - 1]!
    expect(start.type).toBe('compaction/start')
    expect(start.seq).toBe(startEventSeq)
    expect(summary.type).toBe('compaction/summary')
    expect(summary.data).toMatchObject({
      origin: 'model-fold',
      shadowedSeqs: plan.shadowedSeqs,
      shadowedTokenCount: plan.foldedTokens,
      foldedTokens: plan.foldedTokens,
      summaryTokens: 7,
    })
    expect(checkpoint.type).toBe('user/message')
    expect(checkpoint.seq).toBe(checkpointSeq)
    expect(checkpoint.surfaceOp).toEqual({ op: 'replace', startSeq: plan.startSeq, endSeq: plan.endSeq })
    expect(checkpoint.sourceEventSeqs).toEqual([start.seq, summary.seq, ...plan.shadowedSeqs])
    expect((checkpoint.data as { source: { kind: string } }).source.kind).toBe('compact-checkpoint')
    expect(JSON.stringify(checkpoint.data)).toContain('SUMMARY: the task and decisions')
    expect(end.type).toBe('compaction/end')

    const nodes = surfaceSeqs(session)
    for (const seq of plan.shadowedSeqs) expect(nodes).not.toContain(seq)
    expect(nodes).toContain(checkpointSeq)
  })
})

describe('deriveFoldRecords', () => {
  it('round-trips appended folds from the log alone', () => {
    const session = plainSession()
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    const { checkpointSeq } = appendFold(
      session,
      plan,
      [{ type: 'text', text: 'SUMMARY: the task and decisions' }],
      { summaryTokens: 7, provider: MODEL, model: MODEL },
    )
    const records = deriveFoldRecords(session.snapshotEvents())
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      foldId: plan.foldId,
      checkpointSeq,
      shadowedSeqs: plan.shadowedSeqs,
      foldedTokens: plan.foldedTokens,
      summaryTokens: 7,
    })
    expect(records[0]!.summaryText).toContain('SUMMARY: the task and decisions')
  })

  it('ignores engine compaction checkpoints without the model-fold origin', () => {
    const session = plainSession()
    const plan = planFold(session.snapshotEvents(), { keepLast: 2, minFoldChars: 1 })
    appendFold(session, plan, [{ type: 'text', text: 'SUMMARY' }], { summaryTokens: 7, provider: MODEL, model: MODEL })
    // An engine-shaped summary (no origin marker) must not become a fold record.
    const engineId = CompactionId('engine-id-0001')
    session.append('compaction/start', { compactionId: engineId, turn: null })
    session.append('compaction/summary', {
      compactionId: engineId,
      summary: [{ type: 'text', text: 'engine summary' }],
      shadowedRange: { start: SessionSeq(0), end: SessionSeq(1) },
      shadowedSeqs: [SessionSeq(0), SessionSeq(1)],
      shadowedTokenCount: 10,
      provider: MODEL,
      model: MODEL,
    })
    session.append('compaction/end', { compactionId: engineId, turn: null })
    const records = deriveFoldRecords(session.snapshotEvents())
    expect(records).toHaveLength(1)
    expect(records[0]!.foldId).toBe(plan.foldId)
  })
})

describe('FoldError', () => {
  it('carries a stable code and detail', () => {
    const error = new FoldError('fold/too-small', 'range too small', { chars: 3 })
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('fold/too-small')
    expect(error.detail).toEqual({ chars: 3 })
  })
})
