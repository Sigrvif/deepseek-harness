/** Read-only capture of every outbound model request into the context_editor requests table.
 *
 * The listener reads the (possibly frozen) request and never rewrites it. Persistence is
 * fire-and-forget: a log failure flips the install's degraded flag and never reaches the
 * stream — the model request always proceeds (spec §6). */

import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { CapturedRequest } from './types.ts'

/** Requests kept per session; older records are deleted as new ones arrive (spec §4.1a). */
const REQUEST_LOG_LIMIT = 30

/** Handle exposing capture health to the requests surface. */
export interface RequestCapture {
  /** Whether request-log writes have been failing (model requests are unaffected). */
  degraded(): boolean
}

function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as unknown
  } catch {
    return String(value)
  }
}

function requestKey(sessionId: string, seq: number): string {
  return `${sessionId}#${String(seq).padStart(6, '0')}`
}

function sessionSeqs(table: KvTable<string, CapturedRequest>, sessionId: string): number[] {
  const prefix = `${sessionId}#`
  const seqs: number[] = []
  for (const key of table.keys()) {
    if (!key.startsWith(prefix)) continue
    const seq = Number(key.slice(prefix.length))
    if (Number.isFinite(seq)) seqs.push(seq)
  }
  return seqs.sort((left, right) => left - right)
}

export function installRequestCapture(ctx: Context, table: KvTable<string, CapturedRequest>): RequestCapture {
  let failed = false
  const fail = (): void => { failed = true }
  const counters = new Map<string, number>()

  const prune = (sessionId: string): void => {
    const seqs = sessionSeqs(table, sessionId)
    for (const seq of seqs.slice(0, Math.max(0, seqs.length - REQUEST_LOG_LIMIT))) {
      void table.delete(requestKey(sessionId, seq)).catch(fail)
    }
  }

  ctx.on('llm/stream', (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> => {
    const sessionId = options.sessionId
    if (sessionId === undefined) return next()
    const seq = (counters.get(sessionId) ?? Math.max(0, ...sessionSeqs(table, sessionId))) + 1
    counters.set(sessionId, seq)
    const key = requestKey(sessionId, seq)
    const record: CapturedRequest = {
      seq,
      time: new Date().toISOString(),
      ...options.purpose === undefined ? {} : { purpose: options.purpose },
      provider: options.provider,
      model: options.model,
      config: jsonSafe({
        ...options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort },
        ...options.temperature === undefined ? {} : { temperature: options.temperature },
        ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
        ...options.stop === undefined ? {} : { stop: options.stop },
      }) as Record<string, unknown>,
      ...options.tools === undefined ? {} : { tools: jsonSafe(options.tools) as unknown[] },
      messages: jsonSafe(options.messages) as unknown[],
      status: 'dispatched',
    }
    void table.put(key, record).then(() => { prune(sessionId) }).catch(fail)
    const settle = (patch: Partial<CapturedRequest>): void => {
      void table.update(key, current => ({ ...current, ...patch })).catch(fail)
    }
    async function* forward(inner: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
      try {
        for await (const chunk of inner) {
          // Adapter failures surface as a terminal finish chunk with an error reason
          // (the runtime converts throws); only consumer/cancellation errors throw here.
          if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
            settle({ status: 'error', error: chunk.reason.failure.message })
          }
          yield chunk
        }
      } catch (error) {
        settle(options.signal?.aborted === true
          ? { status: 'aborted' }
          : { status: 'error', error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    }
    return forward(next())
  })

  return { degraded: () => failed }
}
