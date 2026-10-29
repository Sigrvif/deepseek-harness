/** Session-scoped tool/parameter overrides: whitelist validation, request shaping,
 * and boot-time re-registration (restart durability; forks do NOT inherit — spec §4.3.2). */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { GenerateOptions, LlmCallConfig, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ContextEditOverrides } from '@deepseek-ai/dsh-agent-loop'
import type { OverridesRecord } from './types.ts'

/** The only parameters a session may override (spec Global Constraints). */
export const PARAM_WHITELIST: ReadonlySet<string> = new Set([
  'temperature',
  'maxTokens',
  'stop',
  'presencePenalty',
  'frequencyPenalty',
])

/** Reject anything outside the whitelist with an explicit code. */
export function validateParams(params: Record<string, number | string[]>): void {
  for (const field of Object.keys(params)) {
    if (!PARAM_WHITELIST.has(field)) {
      throw new RemoteError('context-editor/bad-param', `parameter '${field}' is not overridable`, { field })
    }
  }
}

/** Merge the whitelisted params over the finalized call config. */
export function applyParams(record: OverridesRecord, config: LlmCallConfig): LlmCallConfig {
  const merged = { ...config } as LlmCallConfig & Record<string, unknown>
  for (const [field, value] of Object.entries(record.params)) {
    if (PARAM_WHITELIST.has(field)) merged[field] = value
  }
  return merged
}

/** Drop removed tools and apply same-name schema edits (renames are impossible by construction). */
export function applyTools(record: OverridesRecord, tools: NonNullable<GenerateOptions['tools']>): NonNullable<GenerateOptions['tools']> {
  return tools
    .filter(tool => !record.removedTools.includes(tool.name))
    .map((tool) => {
      const edit = record.toolEdits[tool.name]
      return edit === undefined ? tool : { ...tool, ...(edit as Partial<ToolSchema>) } as ToolSchema
    })
}

/** The registry hooks for one session's record. */
export function buildOverrides(record: OverridesRecord): ContextEditOverrides {
  return {
    ...(Object.keys(record.toolEdits).length > 0 || record.removedTools.length > 0
      ? { tools: (tools: NonNullable<GenerateOptions['tools']>) => applyTools(record, tools) }
      : {}),
    ...(Object.keys(record.params).length > 0
      ? { params: (config: LlmCallConfig) => applyParams(record, config) }
      : {}),
  }
}
