/** Context Editor plugin: request capture, context projection, and edits over the session surface. */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'context-editor'

export const inject = ['sessions', 'sessionPersistence', 'llm', 'storageDomain', 'compaction']

/** Register capture and the `contextEditor` remote; extended by later build-out tasks. */
export function apply(_ctx: Context): void {}
