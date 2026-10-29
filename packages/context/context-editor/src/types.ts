/** Durable records of the Context Editor's two storage tables. */

import { z } from 'zod'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** One outbound model request as dispatched, captured for the Requests pane. */
export interface CapturedRequest {
  /** Per-session monotonic request number (display and ordering). */
  seq: number
  /** ISO-8601 capture time. */
  time: string
  /** Auxiliary classification; ordinary conversation requests leave it unset. */
  purpose?: 'compaction' | 'session-title'
  /** Resolved provider route. */
  provider: string
  /** Requested model identity. */
  model: string
  /** Call configuration as dispatched (after Context Editor overrides). */
  config: { [key: string]: JsonValue }
  /** Tool schemas as dispatched (JSON snapshot of the schemas). */
  tools?: JsonValue[]
  /** Final message list as dispatched (JSON snapshot). */
  messages: JsonValue[]
  /** Stream outcome. */
  status: 'dispatched' | 'error' | 'aborted'
  /** Error message when `status` is `'error'`. */
  error?: string
}

/** Session-scoped tool/parameter overrides applied at request finalization. */
export interface OverridesRecord {
  /** Tool names removed from the request's tool list. */
  removedTools: string[]
  /** Replacement schema fragments by exact tool name (renames are refused upstream of storage). */
  toolEdits: { [key: string]: JsonValue }
  /** Whitelisted parameter overrides merged into every agent-loop request. */
  params: { temperature?: number; maxTokens?: number; stop?: string[] }
}

// Storage schemas stay deliberately loose: the durable payload is the
// JSON-lossless request snapshot, and the wire boundary re-types it.
export const capturedRequestSchema = z.object({
  seq: z.number(),
  time: z.string(),
  purpose: z.enum(['compaction', 'session-title']).optional(),
  provider: z.string(),
  model: z.string(),
  config: z.record(z.string(), z.unknown()),
  tools: z.array(z.custom<JsonValue>()).optional(),
  messages: z.array(z.custom<JsonValue>()),
  status: z.enum(['dispatched', 'error', 'aborted']),
  error: z.string().optional(),
})

export const overridesRecordSchema = z.object({
  removedTools: z.array(z.string()),
  toolEdits: z.record(z.string(), z.custom<JsonValue>()),
  params: z.record(z.string(), z.union([z.number(), z.array(z.string())])),
})

/** One model-visible row of the effective context projection. */
export interface ContextRow {
  /** Log sequence of the event whose message this row shows (replacement events show their own seq). */
  seq: number
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'
  /** Concatenated text of text/reasoning blocks. */
  text: string
  /** Full content blocks as stored (JSON snapshot). */
  blocks: JsonValue[]
  /** True when this replacement is excluded from model input. */
  excluded: boolean
  /** Source sequences of an edited replacement's original event(s). */
  editedFrom?: number[]
  /** Source sequences an excluded replacement shadows. */
  excludes?: number[]
  estimateTokens: number
}

/** The effective next-request view for one session. */
export interface ContextPreview {
  sessionId: string
  rows: ContextRow[]
  totalTokens: number
  /** Latest request/header config as stored. */
  config: { [key: string]: JsonValue }
  /** Latest request/header tool schemas, when any were sent. */
  tools?: JsonValue[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'context-editor/session-not-found': { sessionId: string }
    'context-editor/request-not-found': { sessionId: string; seq: number }
    'context-editor/bad-range': { sessionId?: string; startSeq?: number; endSeq?: number; blockIndex?: number }
    'context-editor/busy': { sessionId: string }
    'context-editor/requires-branch': { sessionId: string; boundarySeq: number }
    'context-editor/rename': { name: string }
    'context-editor/bad-param': { field: string }
  }
}
