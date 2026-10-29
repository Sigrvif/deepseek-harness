/** The context_editor domain roundtrips captured requests and overrides through the json backend. */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { contextEditorDomain } from '../src/domain.ts'
import type { CapturedRequest, OverridesRecord } from '../src/types.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function capturedRequest(seq: number): CapturedRequest {
  return {
    seq,
    time: '2026-10-29T00:00:00.000Z',
    provider: 'llm-pi-ai',
    model: 'test.gguf',
    config: { temperature: 0.7 },
    messages: [{ role: 'user', content: 'hi' }],
    status: 'dispatched',
  }
}

describe('context_editor storage domain', () => {
  it('roundtrips captured requests and overrides', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-context-editor-'))
    roots.push(root)
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root: join(root, 'storage') })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    const domain = await ctx.storageDomain.open(contextEditorDomain)
    const request = capturedRequest(1)
    await domain.table('requests').put('session-a#000001', request)
    expect(domain.table('requests').get('session-a#000001')).toEqual(request)
    const overrides: OverridesRecord = { removedTools: ['web-fetch'], toolEdits: {}, params: { temperature: 0.2 } }
    await domain.table('overrides').put('session-a', overrides)
    expect(domain.table('overrides').get('session-a')).toEqual(overrides)
    await domain.close()
  })
})
