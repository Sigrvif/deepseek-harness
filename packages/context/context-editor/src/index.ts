/** Context Editor plugin: request capture, context projection, and edits over the session surface. */

export { contextEditorDomain } from './domain.ts'
export { installRequestCapture, keyFor } from './capture.ts'
export type { RequestCapture } from './capture.ts'
export { previewFromEvents } from './projection.ts'
import ContextEditorService from './service.ts'
export { ContextEditorService, ContextEditorService as default }
export type {
  CapturedRequest,
  ContextPreview,
  ContextRow,
  OverridesRecord,
} from './types.ts'
