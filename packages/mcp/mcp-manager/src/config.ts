/** Manager configuration: the volatile broker toggle surfaced on the MCP Servers page. */

import type { Volatile } from '@deepseek-ai/cosmokit'
import z from '@deepseek-ai/schemastery'

/** Manager configuration. */
export interface Config {
  /**
   * Broker mode: the model sees the three indirection tools (search / describe
   * / execute) instead of every server's `mcp__*` tools. Read per request, so
   * a flip applies to the next assembled request without remounting.
   */
  broker: Volatile<boolean>
}

/** Validated configuration; the volatile default resolves on mount. */
export const Config = z.object({
  broker: z.boolean().default(true).volatile(),
})
