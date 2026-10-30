/** The fold system-prompt section registration. @module */

import type { Context } from '@deepseek-ai/cordis'
import { FOLD_SECTION } from './prompts.ts'

/**
 * Register the static context-fold system-prompt section.
 * @param ctx - context carrying the systemPrompt service.
 * @returns the registration disposer.
 */
export function registerFoldSection(ctx: Context): () => void {
  return ctx.systemPrompt.section({
    name: 'context:fold',
    order: ctx.systemPrompt.getSectionOrder('CONTEXT_FOLD'),
    text: FOLD_SECTION,
    interpolate: false,
  })
}
