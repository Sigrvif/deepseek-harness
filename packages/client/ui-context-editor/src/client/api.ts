/** Typed wrapper over the mounted `contextEditor` remote (mount lives in remote.ts). */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CapturedRequest, ContextPreview, OverridesRecord } from '@deepseek-ai/dsh-context-editor/types'

/** The subset of `ctx.remote.contextEditor` the view consumes (mock-friendly). */
export interface ContextEditorApi {
  preview(args: { sessionId: SessionId }): Promise<ContextPreview>
  editMessage(args: { sessionId: SessionId; targetSeq: number; text: string; blockIndex?: number }): Promise<ContextPreview>
  excludeRange(args: { sessionId: SessionId; startSeq: number; endSeq: number }): Promise<ContextPreview>
  excludeFrom(args: { sessionId: SessionId; startSeq: number }): Promise<ContextPreview>
  restoreRange(args: { sessionId: SessionId; startSeq: number; endSeq: number }): Promise<ContextPreview>
  expandCheckpoint(args: { sessionId: SessionId; checkpointSeq: number }): Promise<ContextPreview>
  createRecoveryBranch(args: { sessionId: SessionId; boundarySeq: number }): Promise<{ sessionId: SessionId }>
  condenseRange(args: { sessionId: SessionId; startSeq: number; endSeq: number; instruction?: string }): Promise<{ compactionId: string }>
  listRequests(args: { sessionId: SessionId; before?: number }): Promise<{
    entries: CapturedRequest[]
    hasMore: boolean
    captureDegraded: boolean
  }>
  getRequest(args: { sessionId: SessionId; seq: number }): Promise<CapturedRequest>
  setTools(args: { sessionId: SessionId; removedTools: string[]; toolEdits: OverridesRecord['toolEdits'] }): Promise<OverridesRecord>
  setParams(args: { sessionId: SessionId; params: OverridesRecord['params'] }): Promise<OverridesRecord>
  getOverrides(args: { sessionId: SessionId }): Promise<{ record: OverridesRecord | null; inheritedByForks: boolean }>
}
