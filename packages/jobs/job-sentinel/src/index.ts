/**
 * @deepseek-ai/dsh-job-sentinel — periodic, non-waking notices telling the
 * model which of its background processes still run (fork addition; see
 * ./sentinel.ts for the design and FORK.md for the fork inventory).
 * @module @deepseek-ai/dsh-job-sentinel
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { resolveConfig } from './config.ts'
import { installSentinel } from './sentinel.ts'

/** Stable Cordis plugin name. */
export const name = 'job-sentinel'

/** Required services: the job registry (its event stream is the input). */
export const inject = ['jobs']

export { Config, resolveConfig } from './config.ts'
export { installSentinel } from './sentinel.ts'

/**
 * Mount the still-running reporter.
 * @param ctx - host context.
 * @param config - plugin config; `resolveConfig` fills every omitted field.
 */
export function apply(ctx: Context, config: Config = {} as Config): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) return
  ctx.effect(() => installSentinel(ctx, resolved))
}

/** Cordis loader shape: the plugin name, required services, and the {@link apply} mount. */
export default { name, inject, apply }
