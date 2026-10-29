/** The contextEditor remote: preview over live and cold sessions, request-log paging. */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { lookupContextEditOverrides } from '@deepseek-ai/dsh-agent-loop'
import { contextEditorDomain } from '../src/domain.ts'
import ContextEditorService from '../src/index.ts'
import type { CapturedRequest } from '../src/types.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function mounted(persistenceRoot?: string) {
  const root = persistenceRoot ?? await mkdtemp(join(tmpdir(), 'dsh-context-editor-service-'))
  if (persistenceRoot === undefined) roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(root, `storage-${contexts.length}`) })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  const domain = await ctx.storageDomain.open(contextEditorDomain)
  const service = new ContextEditorService(ctx, domain)
  await service.ready
  return { ctx, service, requests: domain.table('requests') }
}

function captured(seq: number): CapturedRequest {
  return {
    seq,
    time: '2026-10-29T00:00:00.000Z',
    provider: 'llm-pi-ai',
    model: 'm.gguf',
    config: {},
    messages: [],
    status: 'dispatched',
  }
}

describe('ContextEditorService', () => {
  it('re-registers stored overrides after a restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-context-editor-durability-'))
    roots.push(root)
    const overrides = { removedTools: ['read-file'], toolEdits: {}, params: {} }

    // First boot: store one override record through the service.
    {
      const ctx = new Context()
      contexts.push(ctx)
      await mountAgentLoopTestDependencies(ctx)
      await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
      await ctx.plugin(Storage)
      await ctx.plugin(StorageJson, { root: join(root, 'storage') })
      await ctx.plugin(StorageDomain, { backend: 'json' })
      const domain = await ctx.storageDomain.open(contextEditorDomain)
      const service = new ContextEditorService(ctx, domain)
      await service.ready
      ctx.sessions.create(SessionId('persist-s'))
      await service.setTools({ sessionId: SessionId('persist-s'), removedTools: ['read-file'], toolEdits: {} })
      await ctx.fiber.dispose()
      contexts.pop()
    }
    // Second boot over the same roots: the record is re-registered into the
    // agent-loop registry without anyone touching the remotes.
    {
      const ctx = new Context()
      contexts.push(ctx)
      await mountAgentLoopTestDependencies(ctx)
      await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
      await ctx.plugin(Storage)
      await ctx.plugin(StorageJson, { root: join(root, 'storage') })
      await ctx.plugin(StorageDomain, { backend: 'json' })
      const domain = await ctx.storageDomain.open(contextEditorDomain)
      const service = new ContextEditorService(ctx, domain)
      await service.ready
      const stored = await service.getOverrides({ sessionId: SessionId('persist-s') })
      expect(stored.record).toEqual(overrides)
      // And the agent-loop registry knows the session again.
      expect(lookupContextEditOverrides('persist-s')).toBeDefined()
    }
  })


  it('previews a live session through its snapshot', async () => {
    const { ctx, service } = await mounted()
    const session = ctx.sessions.create(SessionId('svc-live'))
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'live question' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const preview = await service.preview({ sessionId: SessionId('svc-live') })
    expect(preview.rows.map(row => row.role)).toEqual(['user'])
    expect(preview.rows[0]?.text).toBe('live question')
  })

  it('previews a stored session via the cold read path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-context-editor-cold-'))
    roots.push(root)
    const persistRoot = join(root, 'persist')
    const writer = await mounted(persistRoot)
    const session = writer.ctx.sessions.create(SessionId('svc-cold'), { meta: { cwd: root } })
    // A mounted JSONL listener alone does not persist Sessions without a write handle.
    const writeHandle = await writer.ctx.sessionPersistence.create(session.header)
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'cold question' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    expect(await writer.ctx.sessions.flush(session)).toBe(true)
    // A second context over the same persistence root: the session is stored, not live.
    const reader = await mounted(persistRoot)
    const preview = await reader.service.preview({ sessionId: SessionId('svc-cold') })
    await writeHandle.close()
    expect(preview.rows.map(row => row.text)).toEqual(['cold question'])
  })

  it('rejects preview of an unknown session', async () => {
    const { service } = await mounted()
    await expect(service.preview({ sessionId: SessionId('nope') })).rejects.toThrow()
  })

  it('pages the request log newest-first with a before cursor', async () => {
    const { requests, service } = await mounted()
    for (let seq = 1; seq <= 35; seq += 1) {
      await requests.put(`paged#${String(seq).padStart(6, '0')}`, captured(seq))
    }
    const first = await service.listRequests({ sessionId: SessionId('paged') })
    expect(first.entries.map(record => record.seq)).toEqual(
      Array.from({ length: 30 }, (_, index) => 35 - index),
    )
    expect(first.hasMore).toBe(true)
    expect(first.captureDegraded).toBe(false)
    const second = await service.listRequests({ sessionId: SessionId('paged'), before: 6 })
    expect(second.entries.map(record => record.seq)).toEqual([5, 4, 3, 2, 1])
    expect(second.hasMore).toBe(false)
  })

  it('returns one captured request and reports misses', async () => {
    const { requests, service } = await mounted()
    await requests.put('one#000001', captured(1))
    const record = await service.getRequest({ sessionId: SessionId('one'), seq: 1 })
    expect(record.model).toBe('m.gguf')
    await expect(service.getRequest({ sessionId: SessionId('one'), seq: 2 })).rejects.toThrow()
  })
})
