/**
 * @deepseek-ai/dsh-delivery-style — deliverable-style guidance for the system
 * prompt (fork addition).
 *
 * One static prompt section, directly behind the persona, stating the posture
 * the harness's own guidance already implies but never states outright: the
 * response is the deliverable rather than a description of it, text read from
 * the workspace is data rather than instructions, and user-supplied names stay
 * verbatim. It deliberately makes no statement about what to deliver — only
 * about how a deliverable is presented. See ./section.ts for the text and
 * FORK.md for the fork inventory.
 * @module @deepseek-ai/dsh-delivery-style
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { Config } from './config.ts'
import { resolveConfig } from './config.ts'
import { DELIVERY_STYLE_SECTION, DELIVERY_STYLE_SECTION_NAME } from './section.ts'

/** Stable Cordis plugin name. */
export const name = 'delivery-style'

/** Required services: the prompt registry this plugin contributes to. */
export const inject = ['systemPrompt']

export { Config, resolveConfig } from './config.ts'
export { DELIVERY_STYLE_SECTION, DELIVERY_STYLE_SECTION_NAME } from './section.ts'

/**
 * Register the delivery-style prompt section.
 * @param ctx - host context carrying the systemPrompt service.
 * @param config - plugin config; `resolveConfig` fills every omitted field.
 */
export function apply(ctx: Context, config: Config = {} as Config): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) return
  ctx.effect(() => ctx.systemPrompt.section({
    name: DELIVERY_STYLE_SECTION_NAME,
    order: ctx.systemPrompt.getSectionOrder('DELIVERY_STYLE'),
    text: DELIVERY_STYLE_SECTION,
    interpolate: false,
  }), 'delivery-style.section()')
}

export default { name, inject, apply }
