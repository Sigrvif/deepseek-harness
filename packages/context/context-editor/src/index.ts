/** Context Editor plugin: request capture, context projection, and edits over the session surface. */

import type { Context } from '@deepseek-ai/cordis'
import { contextEditorDomain } from './domain.ts'
import { installRequestCapture } from './capture.ts'
import type { RequestCapture } from './capture.ts'

export const name = 'context-editor'

export const inject = ['sessions', 'sessionPersistence', 'llm', 'storageDomain', 'compaction']

/** The capture handle installed by the last `apply`; the remote service reads its health. */
export let capture: RequestCapture | undefined

/** Open the storage domain and register request capture; the remote service joins in a later task. */
export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(contextEditorDomain)
  capture = installRequestCapture(ctx, domain.table('requests'))
}
