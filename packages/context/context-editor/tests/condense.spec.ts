/** Selective condensation: official compaction protocol, framed checkpoint, captured request. */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { contextEditorDomain } from '../src/domain.ts'
import { installRequestCapture } from '../src/capture.ts'
import { condenseRange } from '../src/condense.ts'
import { expandCheckpoint } from '../src/restore.ts'
import { previewFromEvents } from '../src/projection.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const MODEL = 'summarizer'

class SummaryAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 100_000 } })
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'condensed summary of the turn' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function mounted(trailing = true) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-context-editor-condense-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(root, 'storage') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  const adapter = new SummaryAdapter()
  ctx.llm.registerAdapter([MODEL, 'actual'], adapter)
  const domain = await ctx.storageDomain.open(contextEditorDomain)
  installRequestCapture(ctx, domain.table('requests'))
  const session = ctx.sessions.create(SessionId('condense'))
  session.append('request/header', {
    header: { config: { provider: 'actual', model: MODEL } },
    reason: 'initial',
  })
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'question one with detail' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    stream: [],
    message: { id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'answer one' }], source: { kind: 'model', provider: 'actual', model: MODEL } },
  } as never, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'stop' } as never })
  if (trailing) {
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'question two stays' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
  }
  return { ctx, session, adapter, requests: domain.table('requests') }
}

function texts(session: ReturnType<Context['sessions']['create']>): string[] {
  return previewFromEvents('condense', session.snapshotEvents()).rows.map(row => row.text)
}

describe('condenseRange', () => {
  it('replaces the range with one framed checkpoint via the official protocol', async () => {
    const { ctx, session, adapter } = await mounted()
    const userSeq = session.surface.nodes[0]!
    const assistantSeq = session.surface.nodes[1]!
    const { compactionId } = await condenseRange(ctx, SessionId('condense'), userSeq, assistantSeq)
    expect(compactionId).toBeTruthy()
    const rows = previewFromEvents('condense', session.snapshotEvents()).rows
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text).toContain('<compacted-summary>')
    expect(rows[0]?.text).toContain('condensed summary of the turn')
    expect(rows[1]?.text).toBe('question two stays')
    // The summary request was a genuine prefix: region messages then the instruction.
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]?.purpose).toBe('compaction')
    expect(JSON.stringify(adapter.requests[0]?.messages)).toContain('question one with detail')
    // Model input = framed checkpoint + untouched suffix.
    expect(session.deriveMessages()).toHaveLength(2)
  })

  it('captures the summarization request with purpose compaction', async () => {
    const { ctx, session, requests } = await mounted()
    const userSeq = session.surface.nodes[0]!
    const assistantSeq = session.surface.nodes[1]!
    await condenseRange(ctx, SessionId('condense'), userSeq, assistantSeq)
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    const records = Array.from(requests.entries()).map(([, record]) => record)
    expect(records.some(record => record.purpose === 'compaction' && record.model === MODEL)).toBe(true)
  })

  it('expands the produced checkpoint back to the originals', async () => {
    const { ctx, session } = await mounted(false)
    const userSeq = session.surface.nodes[0]!
    const assistantSeq = session.surface.nodes[1]!
    await condenseRange(ctx, SessionId('condense'), userSeq, assistantSeq)
    const checkpointSeq = session.surface.nodes[0]!
    await expandCheckpoint(ctx, SessionId('condense'), checkpointSeq)
    expect(texts(session)).toEqual(['question one with detail', 'answer one'])
  })
})
