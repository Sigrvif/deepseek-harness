/** Plugin configuration schema and resolution. @module */

import z from '@deepseek-ai/schemastery'

/** Plugin config: every knob has a documented default; see the package README. */
export interface Config {
  /** Master switch; `false` mounts nothing. */
  enabled: boolean
  /**
   * A job younger than this never triggers a report — the model was told the
   * command would take a while, and a first look belongs after a real wait.
   */
  minAgeMs: number
  /** Minimum distance between two reports for the same session. */
  minIntervalMs: number
}

/** One still-running report at most every {@link Config.minIntervalMs}, never before {@link Config.minAgeMs}. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  // Slow local models and slow same-machine processes: 2.4.27 ships the user
  // decision — a first look after ten minutes, repeats every twenty.
  minAgeMs: z.number().step(1).min(0).default(600_000),
  minIntervalMs: z.number().step(1).min(0).default(1_200_000),
})

/**
 * Resolve raw plugin config into the complete sentinel configuration.
 * @param input - schemastery-processed config (or a partial in tests).
 * @returns every field populated.
 */
export function resolveConfig(input: unknown): Config {
  // Loader config is schemastery-processed before apply(); tests pass partials.
  const resolved = Config(input as never)
  if (resolved.minIntervalMs < resolved.minAgeMs) {
    throw new TypeError(
      'job-sentinel: minIntervalMs must not be smaller than minAgeMs '
        + `(got ${String(resolved.minAgeMs)} / ${String(resolved.minIntervalMs)})`,
    )
  }
  return resolved
}
