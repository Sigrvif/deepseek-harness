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
