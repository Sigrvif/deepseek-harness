/** Restore operations: in-place expansion of edits/exclusions/checkpoints, branch fallback. */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { compactCheckpointSource, CompactionId } from '@deepseek-ai/dsh-compaction'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { editMessage, excludeRange } from '../src/edits.ts'
import { previewFromEvents } from '../src/projection.ts'
import { createRecoveryBranch, expandCheckpoint, restoreRange } from '../src/restore.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function mounted() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-context-editor-restore-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(root, `storage-${contexts.length}`) })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  return { ctx }
}

function questionTurn(ctx: Context, id: Parameters<Context['sessions']['create']>[0], trailing = true) {
  const session = ctx.sessions.create(id)
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'question one' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    stream: [],
    message: createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'answer one' }],
      source: { kind: 'model', provider: 'm', model: 'm' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'stop' } as never })
  if (trailing) {
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'question two' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
  }
  return session
}

function texts(session: ReturnType<Context['sessions']['create']>): string[] {
  return previewFromEvents('restore', session.snapshotEvents()).rows.map(row => row.text)
}

describe('restoreRange', () => {
  it('restores a single edited message in place', async () => {
    const { ctx } = await mounted()
    const session = questionTurn(ctx, SessionId('restore-edit'))
    const userSeq = session.surface.nodes[0]!
    await editMessage(ctx, SessionId('restore-edit'), userSeq, { text: 'edited' })
    expect(texts(session)[0]).toBe('edited')
    await restoreRange(ctx, SessionId('restore-edit'), userSeq, userSeq)
    expect(texts(session)[0]).toBe('question one')
    expect(texts(session)).toHaveLength(3)
  })

  it('restores a tail range exclusion in place when the replacement is the last node', async () => {
    const { ctx } = await mounted()
    const session = questionTurn(ctx, SessionId('restore-tail'), false)
    const assistantSeq = session.surface.nodes[1]!
    await excludeRange(ctx, SessionId('restore-tail'), assistantSeq, assistantSeq)
    // The preview keeps excluded rows visible (flagged); the model no longer sees them.
    expect(texts(session)).toEqual(['question one', ''])
    await restoreRange(ctx, SessionId('restore-tail'), assistantSeq, assistantSeq)
    expect(texts(session)).toEqual(['question one', 'answer one'])
  })

  it('demands a branch for a mid-history multi-original restoration', async () => {
    const { ctx } = await mounted()
    const session = questionTurn(ctx, SessionId('restore-mid'))
    const userSeq = session.surface.nodes[0]!
    const assistantSeq = session.surface.nodes[1]!
    await excludeRange(ctx, SessionId('restore-mid'), userSeq, assistantSeq)
    // question two (the tail node) makes the 2-original replacement mid-history.
    await expect(restoreRange(ctx, SessionId('restore-mid'), userSeq, assistantSeq))
      .rejects.toMatchObject({ code: 'context-editor/requires-branch' })
  })

  it('restores a single original mid-history in place', async () => {
    const { ctx } = await mounted()
    const session = questionTurn(ctx, SessionId('restore-mid-single'))
    const assistantSeq = session.surface.nodes[1]!
    await excludeRange(ctx, SessionId('restore-mid-single'), assistantSeq, assistantSeq)
    await restoreRange(ctx, SessionId('restore-mid-single'), assistantSeq, assistantSeq)
    expect(texts(session)).toEqual(['question one', 'answer one', 'question two'])
  })
})

describe('createRecoveryBranch', () => {
  it('forks a child whose log ends at the boundary', async () => {
    const { ctx } = await mounted()
    const session = questionTurn(ctx, SessionId('recovery'))
    const assistantSeq = session.surface.nodes[1]!
    const childId = await createRecoveryBranch(ctx, SessionId('recovery'), assistantSeq - 1)
    const child = ctx.sessions.get(childId)
    expect(child).toBeDefined()
    expect(child?.header.isSeeded).toBe(true)
    expect(texts(child!)).toEqual(['question one'])
  })
})

describe('expandCheckpoint', () => {
  it('expands a tail compaction checkpoint back to its originals', async () => {
    const { ctx } = await mounted()
    const session = questionTurn(ctx, SessionId('expand-cp'), false)
    const userSeq = session.surface.nodes[0]!
    const assistantSeq = session.surface.nodes[1]!
    const summary = createMessage({
      role: 'user',
      content: [{ type: 'text', text: 'summary of the turn' }],
      source: compactCheckpointSource(CompactionId('cp-1')),
    })
    session.append('compaction/start', { compactionId: CompactionId('cp-1'), turn: 1 })
    session.append('compaction/summary', {
      compactionId: CompactionId('cp-1'),
      summary: [{ type: 'text', text: 'summary of the turn' }],
      shadowedRange: { start: userSeq, end: assistantSeq },
      shadowedSeqs: [userSeq, assistantSeq],
      shadowedTokenCount: 10,
      provider: 'm',
      model: 'm',
      rawOutput: [{ type: 'text', text: 'summary of the turn' }],
    } as never)
    session.append('user/message', summary, {
      surfaceOp: { op: 'replace', startSeq: userSeq, endSeq: assistantSeq },
      sourceEventSeqs: [userSeq, assistantSeq],
    })
    session.append('compaction/end', { compactionId: CompactionId('cp-1') })
    expect(texts(session)).toEqual(['summary of the turn'])
    await expandCheckpoint(ctx, SessionId('expand-cp'), session.surface.nodes[0]!)
    expect(texts(session)).toEqual(['question one', 'answer one'])
  })
})
