/** Edit operations: validated surface replacements for live and cold sessions. */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { editMessage, excludeRange } from '../src/edits.ts'
import { previewFromEvents } from '../src/projection.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const MODEL = 'm.gguf'

async function mounted(persistenceRoot?: string) {
  const root = persistenceRoot ?? await mkdtemp(join(tmpdir(), 'dsh-context-editor-edits-'))
  if (persistenceRoot === undefined) roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(root, `storage-${contexts.length}`) })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  return { ctx }
}

function toolConversation(session: ReturnType<Context['sessions']['create']>, assistantSource: Record<string, unknown> = {}) {
  const callId = ToolCallId('call-1')
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'original question' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    stream: [],
    turn: 1,
    step: 1,
    message: createMessage({
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'model thought' },
        { type: 'text', text: 'model answer' },
        { type: 'tool-call', id: callId, name: 'read', arguments: '{}' },
      ],
      source: { kind: 'model', provider: MODEL, model: MODEL, ...assistantSource },
    }),
  }, { surfaceOp: 'append' })
  session.append('tool/call', { turn: 1, step: 1, callId, name: 'read', arguments: '{}' })
  session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId,
      content: [{ type: 'text', text: 'tool output' }],
      isError: false,
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'stop' } as never })
  return session
}

describe('editMessage', () => {
  it('replaces a user message in place; derivation and preview agree', async () => {
    const { ctx } = await mounted()
    const session = ctx.sessions.create(SessionId('edit-user'))
    toolConversation(session)
    const userSeq = session.surface.nodes[0]!
    await editMessage(ctx, SessionId('edit-user'), userSeq, { text: 'edited question' })
    const derived = session.deriveMessages().map(message => JSON.stringify(message.content))
    expect(derived.some(text => text.includes('edited question'))).toBe(true)
    expect(derived.some(text => text.includes('original question'))).toBe(false)
    const preview = previewFromEvents('edit-user', session.snapshotEvents())
    const row = preview.rows.find(candidate => candidate.text === 'edited question')
    expect(row?.editedFrom).toEqual([userSeq])
  })

  it('edits one reasoning block and keeps the rest of the message intact', async () => {
    const { ctx } = await mounted()
    const session = ctx.sessions.create(SessionId('edit-reasoning'))
    toolConversation(session)
    const assistantSeq = session.surface.nodes[1]!
    await editMessage(ctx, SessionId('edit-reasoning'), assistantSeq, { text: 'edited thought', blockIndex: 0 })
    const assistantRow = previewFromEvents('edit-reasoning', session.snapshotEvents()).rows
      .find(candidate => candidate.text.includes('edited thought'))
    expect(assistantRow?.text).toContain('edited thought')
    expect(assistantRow?.text).toContain('model answer')
    const blocks = assistantRow?.blocks as { type: string; text?: string }[]
    expect(blocks.find(block => block.type === 'reasoning')?.text).toBe('edited thought')
    expect(blocks.some(block => block.type === 'tool-call')).toBe(true)
  })

  it('keeps a tool result identity while changing its content', async () => {
    const { ctx } = await mounted()
    const session = ctx.sessions.create(SessionId('edit-tool'))
    toolConversation(session)
    const toolSeq = session.surface.nodes[2]!
    await editMessage(ctx, SessionId('edit-tool'), toolSeq, { text: 'edited output' })
    const event = session.eventAt(SessionSeq(session.log.length - 1))
    expect(event?.type).toBe('tool/result')
    const message = (event?.data as { message: { toolCallId: string; source: { callId: string } } }).message
    expect(message.toolCallId).toBe('call-1')
    expect(message.source.callId).toBe('call-1')
    void toolSeq
  })

  it('refuses non-message targets and in-flight turns', async () => {
    const { ctx } = await mounted()
    const session = ctx.sessions.create(SessionId('edit-bad'))
    toolConversation(session)
    await expect(editMessage(ctx, SessionId('edit-bad'), 0, { text: 'x' })).rejects.toThrow(/bad-range|not a message/u)
    session.append('turn/start', { turn: 2 })
    const nextSeq = session.surface.nodes.at(-1)!
    await expect(editMessage(ctx, SessionId('edit-bad'), nextSeq, { text: 'x' })).rejects.toThrow(/open turn/u)
  })

  it('survives a restart: the edit reaches a cold reader', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-context-editor-edit-restart-'))
    roots.push(root)
    const persistRoot = join(root, 'persist')
    const writer = await mounted(persistRoot)
    const session = writer.ctx.sessions.create(SessionId('edit-cold'), { meta: { cwd: root } })
    // The write handle must exist before the events: pre-handle appends are never routed.
    const writeHandle = await writer.ctx.sessionPersistence.create(session.header)
    toolConversation(session)
    await writer.ctx.sessions.flush(session)
    const userSeq = session.surface.nodes[0]!
    await editMessage(writer.ctx, SessionId('edit-cold'), userSeq, { text: 'edited for cold' })
    const reader = await mounted(persistRoot)
    const handle = await reader.ctx.sessionPersistence.open(SessionId('edit-cold'), 'read')
    try {
      const { events } = await handle.read()
      const preview = previewFromEvents('edit-cold', events)
      expect(preview.rows.some(row => row.text === 'edited for cold')).toBe(true)
    } finally {
      await handle.close()
      void writeHandle
    }
  })

  it('strips only the edited reasoning block from the replay envelope', async () => {
    const { ctx } = await mounted()
    const session = ctx.sessions.create(SessionId('edit-signed'))
    toolConversation(session, {
      replayState: {
        response: { kind: 'deepseek-messages', version: 1, model: MODEL },
        blocks: [
          { type: 'reasoning', signature: 'sig-a' },
          { type: 'text' },
          { type: 'tool-call' },
        ],
      },
    })
    const assistantSeq = session.surface.nodes[1]!
    await editMessage(ctx, SessionId('edit-signed'), assistantSeq, { text: 'edited thought', blockIndex: 0 })
    const replacement = session.eventAt(session.seq - 1)
    const data = replacement?.data as { message: { source: { replayState?: { blocks: { type: string; signature?: string }[] } } } }
    const blocks = data.message.source.replayState?.blocks ?? []
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ type: 'reasoning' })
    expect(blocks[1]).toEqual({ type: 'text' })
  })
})

describe('excludeRange', () => {
  it('shadows a whole range with one empty excluded replacement', async () => {
    const { ctx } = await mounted()
    const session = ctx.sessions.create(SessionId('exclude-range'))
    toolConversation(session)
    const nodes = session.surface.nodes
    const start = nodes[1]!
    const end = nodes[2]!
    await excludeRange(ctx, SessionId('exclude-range'), start, end)
    const preview = previewFromEvents('exclude-range', session.snapshotEvents())
    expect(preview.rows).toHaveLength(2)
    expect(preview.rows[0]?.excluded).toBe(false)
    expect(preview.rows[1]?.excluded).toBe(true)
    expect(preview.rows[1]?.excludes).toEqual([start, end])
    // The derivation rule drops the excluded replacement from model input:
    // only the untouched prefix (the user message) remains.
    const derived = session.deriveMessages()
    expect(derived.length).toBe(1)
  })
})
