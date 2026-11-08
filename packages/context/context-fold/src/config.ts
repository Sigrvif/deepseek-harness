/** Plugin configuration schema and resolution. @module */

import z from '@deepseek-ai/schemastery'
import type { ResolvedFoldConfig } from './tools.ts'

/** Plugin config: every knob has a documented default; see the package README. */
export const Config: z<ResolvedFoldConfig> = z.object({
  enabled: z.boolean().default(true),
  keepLast: z.number().step(1).min(1).default(8),
  minFoldChars: z.number().step(1).default(2000),
  minSummaryChars: z.number().step(1).default(200),
  decompressCapChars: z.number().step(1).default(24000),
  searchLimit: z.number().step(1).default(8),
  // One growth nudge per this many NEW tokens since the last fold (the
  // pressure-ratio nudge is independent). 30k ≈ 11% of a 262k window: the
  // upstream-inherited 50k read as "one reminder, then silence" on long local
  // runs — a low-power model needs the reminder repeated to act on it.
  nudgeGrowthTokens: z.number().step(1).default(30000),
  pressureNudgeRatio: z.number().default(0.75),
  // Nudge phrasing escalates with usage: informational below nudgeAdviseRatio
  // (small models otherwise fold needlessly early), advisory from there,
  // demanding from nudgeDemandRatio, urgent at 90%.
  nudgeAdviseRatio: z.number().default(0.4),
  nudgeDemandRatio: z.number().default(0.7),
})

/**
 * Resolve raw plugin config into the complete fold configuration.
 * @param input - schemastery-processed config (or a partial in tests).
 * @returns every field populated.
 */
export function resolveConfig(input: unknown): ResolvedFoldConfig {
  // Loader config is schemastery-processed before apply(); tests pass partials.
  const resolved = Config(input as never)
  if (!(resolved.nudgeAdviseRatio > 0 && resolved.nudgeAdviseRatio < resolved.nudgeDemandRatio)
    || resolved.nudgeDemandRatio > 1) {
    throw new TypeError(
      'context-fold: nudgeAdviseRatio must be positive and below nudgeDemandRatio, '
        + `and nudgeDemandRatio must not exceed 1 (got ${String(resolved.nudgeAdviseRatio)} / ${String(resolved.nudgeDemandRatio)})`,
    )
  }
  return resolved
}
