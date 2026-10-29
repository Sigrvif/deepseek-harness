/** fork(context-editor): session-scoped tool/parameter overrides applied at request
 * finalization. The Context Editor package registers lookups at boot; agent-loop
 * itself never imports that package — this registry is the only coupling. */

import type { GenerateOptions, LlmCallConfig } from '@deepseek-ai/dsh-llm'

/** Per-session request-shaping hooks, registered by the Context Editor. */
export interface ContextEditOverrides {
  /** Shape the request's tool list (removals and schema edits). */
  tools?: (tools: NonNullable<GenerateOptions['tools']>) => NonNullable<GenerateOptions['tools']>
  /** Merge whitelisted parameter fields into the finalized call config. */
  params?: (config: LlmCallConfig) => LlmCallConfig
}

const registry = new Map<string, ContextEditOverrides>()

/** Install or clear the overrides for one session. */
export function registerContextEditOverrides(sessionId: string, overrides: ContextEditOverrides | undefined): void {
  if (overrides === undefined) registry.delete(sessionId)
  else registry.set(sessionId, overrides)
}

/** The overrides registered for a session, if any. */
export function lookupContextEditOverrides(sessionId: string): ContextEditOverrides | undefined {
  return registry.get(sessionId)
}
