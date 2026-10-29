/** Durable records of the Context Editor's two storage tables. */

import { z } from 'zod'

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
  config: Record<string, unknown>
  /** Tool schemas as dispatched. */
  tools?: unknown[]
  /** Final message list as dispatched. */
  messages: unknown[]
  /** Stream outcome. */
  status: 'dispatched' | 'error' | 'aborted'
  /** Error message when `status` is `'error'`. */
  error?: string
}

/** Session-scoped tool/parameter overrides applied at request finalization. */
export interface OverridesRecord {
  /** Tool names removed from the request's tool list. */
  removedTools: string[]
  /** Replacement schemas by exact tool name (renames are refused upstream of storage). */
  toolEdits: Record<string, unknown>
  /** Whitelisted parameter overrides merged into every agent-loop request. */
  params: Record<string, number | string[]>
}

export const capturedRequestSchema: z.ZodType<CapturedRequest> = z.object({
  seq: z.number(),
  time: z.string(),
  purpose: z.enum(['compaction', 'session-title']).optional(),
  provider: z.string(),
  model: z.string(),
  config: z.record(z.string(), z.unknown()),
  tools: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()),
  status: z.enum(['dispatched', 'error', 'aborted']),
  error: z.string().optional(),
})

export const overridesRecordSchema: z.ZodType<OverridesRecord> = z.object({
  removedTools: z.array(z.string()),
  toolEdits: z.record(z.string(), z.unknown()),
  params: z.record(z.string(), z.union([z.number(), z.array(z.string())])),
})

/** One model-visible row of the effective context projection. */
export interface ContextRow {
  /** Log sequence of the event whose message this row shows (replacement events show their own seq). */
  seq: number
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'
  /** Concatenated text of text/reasoning blocks. */
  text: string
  /** Full content blocks as stored. */
  blocks: unknown[]
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
  config: Record<string, unknown>
  /** Latest request/header tool schemas, when any were sent. */
  tools?: unknown[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'context-editor/session-not-found': { sessionId: string }
    'context-editor/request-not-found': { sessionId: string; seq: number }
    'context-editor/bad-range': { sessionId: string; startSeq: number; endSeq: number }
    'context-editor/busy': { sessionId: string }
    'context-editor/requires-branch': { sessionId: string; boundarySeq: number }
    'context-editor/rename': { name: string }
    'context-editor/bad-param': { field: string }
  }
}
