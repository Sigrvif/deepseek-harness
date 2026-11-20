/**
 * @deepseek-ai/dsh-unrestricted-mode — opt-in unrestricted execution-mode
 * contract for the system prompt (fork addition, OFF by default).
 *
 * An unscoped `system-prompt/assemble` waterfall listener fuses the ported
 * execution-mode block (see ./text.ts for the adapted text) into each assembly by
 * structural section names (see ./fuse.ts). The volatile `enabled` toggle
 * (default false) is read per fire — flipping it on the General settings page
 * takes effect on the next request without remounting, and with the toggle
 * off the prompt is byte-identical to the stock harness. The `minimal` preset
 * needs no special handling: its `complete: true` persona is restored after
 * the waterfall by the registry itself, so waterfall edits cannot reach it.
 *
 * Surfaced on the General settings page by
 * `@deepseek-ai/dsh-client-ui-fork-unrestricted`. This block is a jailbreak
 * prompt; see the package README for what it does and does not do.
 * @module @deepseek-ai/dsh-unrestricted-mode
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import z from '@deepseek-ai/schemastery'
import { fuseSections } from './fuse.ts'

export { BLOCK_SECTION, EXECUTION_MODE_BLOCK, PERSONA_POINTER, PTC_ONLY_NOTE, PLAN_NOTE, STRUCTURED_OUTPUT_NOTE } from './text.ts'
export { fuseSections, type FuseOptions, type FuseResult } from './fuse.ts'

/** Stable Cordis plugin name; also the settings namespace id. */
export const name = 'unrestricted-mode'

/** Required services: the prompt registry whose assemblies are fused. */
export const inject = ['systemPrompt']

/** Runtime toggle projected to the browser. */
export interface Config {
  /** Fuse the unrestricted execution-mode block into every assembly. */
  enabled: Volatile<boolean>
}

/** Live toggle; new installations default it OFF. */
export const Config = z.object({
  enabled: z.boolean().default(false).volatile(),
})

/**
 * Mount the fusion listener. Registration happens once; the volatile toggle
 * is read per fire, so toggling takes effect on the next request.
 * @param ctx - host context carrying the systemPrompt service.
 * @param config - plugin config; the volatile reference is read per assembly.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const original = await next()
    if (!config.enabled.get()) return original
    // Delegated subagents tolerate an absent persona; their assemblies carry
    // the subagent:delegation runtime context.
    const isSubagent = original.contexts.some(entry => entry.name === 'subagent:delegation')
    const fused = fuseSections(original.sections, { isSubagent })
    if ('issues' in fused) return original
    return { ...original, sections: fused.sections }
  })
  // The General page owns this preference's UI; suppress an auto-generated
  // duplicate page the way ui-settings does for the developer-tools toggle.
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}

/** Cordis loader shape: the plugin name, required services, config schema, and the {@link apply} mount. */
export default { name, inject, Config, apply }
