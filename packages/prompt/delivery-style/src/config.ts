/** Plugin configuration schema. @module */

import z from '@deepseek-ai/schemastery'

/** Runtime schema for the delivery-style section. */
export interface Config {
  /** Register the deliverable-style prompt section. */
  enabled: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
})

/**
 * Resolve raw plugin config into the complete configuration.
 * @param input - schemastery-processed config (or a partial in tests).
 * @returns every field populated.
 */
export function resolveConfig(input: unknown): Config {
  return Config(input as never)
}
