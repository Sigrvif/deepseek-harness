/** Request capture: every session-scoped llm.stream lands in the log, bounded, never breaking the stream. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { SessionId } from '@deepseek-ai/dsh-session'
import { contextEditorDomain } from '../src/domain.ts'
import { installRequestCapture } from '../src/capture.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const MODEL = 'capture-model'
const EXPLODE_MODEL = 'explode-model'
const SESSION = SessionId('capture-test')

class ScriptedAdapter extends LlmAdapter {
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 1_000 } })
  }

  override async *stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    if (request.model === EXPLODE_MODEL) throw new Error('provider exploded')
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** Failing-put table: `put`/`update` reject, everything else works — capture must survive it. */
function brokenTable<K extends string, V>(working: KvTable<K, V>): KvTable<K, V> {
  return new Proxy(working, {
    get(target, property: string) {
      if (property === 'put' || property === 'update') {
        return async () => { throw new Error('storage unavailable') }
      }
      return (target as unknown as Record<string, unknown>)[property]
    },
  })
}

async function mounted(broken = false) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-context-editor-capture-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  void new LlmRuntime(ctx)
  new SessionProjectionRegistry(ctx)
  void new TokenMeter(ctx)
  ctx.llm.registerAdapter([MODEL, EXPLODE_MODEL, 'actual'], new ScriptedAdapter())
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(root, 'storage') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  const domain = await ctx.storageDomain.open(contextEditorDomain)
  const table = domain.table('requests')
  const capture = installRequestCapture(ctx, broken ? brokenTable(table) : table)
  return { ctx, table, capture }
}

function options(model: string, over: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'actual',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] } as never],
    sessionId: SESSION,
    temperature: 0.7,
    ...over,
  }
}

async function drained(stream: AsyncIterable<StreamChunk>): Promise<number> {
  let chunks = 0
  for await (const _chunk of stream) chunks += 1
  return chunks
}

describe('request capture', () => {
  it('records one dispatched request with purpose, route, params, and message count', async () => {
    const { ctx, table } = await mounted()
    const chunks = await drained(ctx.llm.stream(options(MODEL, { purpose: 'session-title' })))
    expect(chunks).toBeGreaterThan(0)
    await vi.waitFor(() => { expect(Array.from(table.entries())).toHaveLength(1) })
    const records = Array.from(table.entries()).map(([, record]) => record)
    const first = records[0]!
    expect(first).toMatchObject({
      seq: 1,
      purpose: 'session-title',
      provider: 'actual',
      model: MODEL,
      status: 'dispatched',
      config: { temperature: 0.7 },
    })
    const captured = records[0]!
    expect(captured.messages).toHaveLength(1)
    expect(typeof captured.time).toBe('string')
  })

  it('keeps only the newest 30 requests per session', async () => {
    const { ctx, table } = await mounted()
    for (let index = 0; index < 35; index += 1) {
      await drained(ctx.llm.stream(options(MODEL, { messages: [{ role: 'user', content: [{ type: 'text', text: `m${index}` }] } as never] })))
    }
    await vi.waitFor(() => {
      const entries = Array.from(table.entries())
      expect(entries).toHaveLength(30)
      const seqs = entries.map(([, record]) => record.seq).sort((a, b) => a - b)
      expect(seqs[0]).toBe(6)
      expect(seqs[29]).toBe(35)
    })
  })

  it('records error status on a failed finish and still streams every chunk', async () => {
    const { ctx, table } = await mounted()
    const chunks: StreamChunk[] = []
    for await (const chunk of ctx.llm.stream(options(EXPLODE_MODEL))) chunks.push(chunk)
    const finish = chunks.at(-1)
    expect(finish?.type).toBe('finish')
    expect(finish !== undefined && finish.type === 'finish' && finish.reason.kind).toBe('error')
    await vi.waitFor(() => { expect(Array.from(table.entries())).toHaveLength(1) })
    const records = Array.from(table.entries()).map(([, record]) => record)
    const failed = records[0]!
    expect(failed.status).toBe('error')
    expect(failed.error).toBe('provider exploded')
  })

  it('survives a failing storage table and flags degradation', async () => {
    const { ctx, capture } = await mounted(true)
    expect(capture.degraded()).toBe(false)
    const chunks = await drained(ctx.llm.stream(options(MODEL)))
    expect(chunks).toBeGreaterThan(0)
    expect(capture.degraded()).toBe(true)
  })
})
