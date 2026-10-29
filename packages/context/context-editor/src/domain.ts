/** The `context_editor` storage domain: request capture log and per-session overrides. */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { capturedRequestSchema, overridesRecordSchema } from './types.ts'
import type { CapturedRequest, OverridesRecord } from './types.ts'

export const contextEditorDomain = defineDomain({
  name: 'context_editor',
  version: 1,
  tables: {
    requests: domainTable<string, CapturedRequest>(capturedRequestSchema as never),
    overrides: domainTable<string, OverridesRecord>(overridesRecordSchema as never),
  },
})
