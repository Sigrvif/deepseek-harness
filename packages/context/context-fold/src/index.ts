/**
 * @deepseek-ai/dsh-context-fold — model-driven, reversible context
 * compression as a native plugin: the `compress`/`decompress`/
 * `search_context`/`acp_status` tools, a system-prompt section, and growth
 * nudges. Folds land as compaction checkpoints on the session log (see
 * ./fold.ts); state is event-sourced, so nothing extra persists.
 *
 * fork(context-fold): behavior adapted from billion-context
 * (https://github.com/ranxianglei/billion-context, MIT + attribution term) —
 * see ./prompts.ts for the corpus provenance.
 * @module @deepseek-ai/dsh-context-fold
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolveConfig } from './config.ts'
import { installNudge } from './nudge.ts'
import { registerFoldSection } from './section.ts'
import { registerFoldTools } from './tools.ts'
import type { ResolvedFoldConfig } from './tools.ts'

/** Stable Cordis plugin name. */
export const name = 'context-fold'

/** Required services: the tool registry and the system-prompt registry. */
export const inject = ['tools', 'systemPrompt']

/** Every fold knob with a default (see ./config.ts). */
export type Config = ResolvedFoldConfig

export { Config as FoldConfig, resolveConfig } from './config.ts'
export { planFold, appendFold, deriveFoldRecords, FoldError } from './fold.ts'
export type { FoldPlan, FoldRecord } from './fold.ts'
export { registerFoldTools } from './tools.ts'
export type { ResolvedFoldConfig, CompressValue } from './tools.ts'
export { COMPRESS_DESCRIPTION, COMPRESS_PHILOSOPHY, FOLD_SECTION } from './prompts.ts'
export { registerFoldSection } from './section.ts'
export { searchContext } from './search.ts'
export type { SearchHit } from './search.ts'
export { foldUsage, renderStatus, usageLine } from './status.ts'
export type { FoldUsage } from './status.ts'
export { installNudge } from './nudge.ts'

/**
 * Mount the fold capability: system section, tools, and nudges.
 * @param ctx - host context.
 * @param config - plugin config; every field defaults.
 */
export function apply(ctx: Context, config: unknown): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) return
  ctx.effect(() => registerFoldSection(ctx))
  ctx.effect(() => registerFoldTools(ctx, resolved))
  ctx.effect(() => installNudge(ctx, resolved))
}

export default { name, inject, apply }
