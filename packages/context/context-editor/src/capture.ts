/** Read-only capture of every outbound model request into the context_editor requests table.
 *
 * The listener reads the (possibly frozen) request and never rewrites it. Persistence is
 * fire-and-forget: a log failure flips the install's degraded flag and never reaches the
 * stream — the model request always proceeds (spec §6). */

import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
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
    const parsed: unknown = JSON.parse(JSON.stringify(value ?? null))
    return parsed
  } catch {
    return String(value)
  }
}

/**
 * The storage key of one captured request (shared with the remote read side).
 * @param sessionId - the session id the request belongs to.
 * @param seq - the per-session request number of the capture.
 * @returns the key `sessionId#seq`, zero-padded so keys sort by seq.
 */
export function keyFor(sessionId: string, seq: number): string {
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

/**
 * Register the `llm/stream` listener that snapshots every outbound request into
 * the capture table and tracks its outcome. Persistence is fire-and-forget: a
 * write failure only flips the returned handle's degraded flag.
 * @param ctx - the host context.
 * @param table - the requests table of the context_editor domain.
 * @returns the capture handle exposing persistence health to the requests surface.
 */
export function installRequestCapture(ctx: Context, table: KvTable<string, CapturedRequest>): RequestCapture {
  let failed = false
  const fail = (): void => { failed = true }
  const counters = new Map<string, number>()

  const prune = (sessionId: string): void => {
    const seqs = sessionSeqs(table, sessionId)
    for (const seq of seqs.slice(0, Math.max(0, seqs.length - REQUEST_LOG_LIMIT))) {
      void table.delete(keyFor(sessionId, seq)).catch(fail)
    }
  }

  ctx.on('llm/stream', (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> => {
    const sessionId = options.sessionId
    if (sessionId === undefined) return next()
    const seq = (counters.get(sessionId) ?? Math.max(0, ...sessionSeqs(table, sessionId))) + 1
    counters.set(sessionId, seq)
    const key = keyFor(sessionId, seq)
    const record: CapturedRequest = {
      seq,
      time: new Date().toISOString(),
      ...options.purpose === undefined ? {} : { purpose: options.purpose },
      provider: options.provider,
      model: options.model,
      // Snapshot the overridable config fields explicitly: this list must grow
      // with the override whitelist in overrides.ts (temperature/maxTokens/stop
      // plus the routing facts), or an overridable field would silently vanish
      // from the Requests pane.
      config: jsonSafe({
        ...options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort },
        ...options.temperature === undefined ? {} : { temperature: options.temperature },
        ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
        ...options.stop === undefined ? {} : { stop: options.stop },
      }) as { [key: string]: JsonValue },
      ...options.tools === undefined ? {} : { tools: jsonSafe(options.tools) as JsonValue[] },
      messages: jsonSafe(options.messages) as JsonValue[],
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
