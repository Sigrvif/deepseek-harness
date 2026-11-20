/** The `contextEditor` remote: read-side surface projection and request-log access. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { registerContextEditOverrides } from '@deepseek-ai/dsh-agent-loop'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { keyFor, installRequestCapture } from './capture.ts'
import type { RequestCapture } from './capture.ts'
import { condenseRange } from './condense.ts'
import { editMessage as editMessageOp, excludeFrom as excludeFromOp, excludeRange as excludeRangeOp } from './edits.ts'
import { createRecoveryBranch, expandCheckpoint, restoreRange } from './restore.ts'
import { buildOverrides, validateParams } from './overrides.ts'
import { contextEditorDomain } from './domain.ts'
import { previewFromEvents } from './projection.ts'
import type { CapturedRequest, ContextPreview, OverridesRecord } from './types.ts'

const PAGE_SIZE = 30

/**
 * The `contextEditor` remote: effective-context previews, in-place session
 * edits (edit/exclude/restore/expand/condense), recovery branches, request-log
 * access, and durable per-session tool/parameter overrides.
 */
export class ContextEditorService extends TypertRemoteService {
  static inject = ['sessions', 'sessionPersistence', 'llm', 'storageDomain']

  private requestsTable: KvTable<string, CapturedRequest> | undefined
  private overridesTable: KvTable<string, OverridesRecord> | undefined
  private capture: RequestCapture | undefined

  /** Settles once the storage domain is open and capture is installed. */
  readonly ready: Promise<void>

  constructor(ctx: Context, domain?: Domain<typeof contextEditorDomain>) {
    super(ctx, 'contextEditor')
    this.ready = domain !== undefined
      ? Promise.resolve().then(() => { this.adopt(domain) })
      : ctx.storageDomain.open(contextEditorDomain).then((opened) => { this.adopt(opened) })
  }

  private adopt(domain: Domain<typeof contextEditorDomain>): void {
    this.requestsTable = domain.table('requests')
    this.overridesTable = domain.table('overrides')
    this.capture = installRequestCapture(this.ctx, this.requestsTable)
    void this.installStoredOverrides()
  }

  /** Re-register every stored override record so edits survive restarts. */
  private async installStoredOverrides(): Promise<void> {
    const table = await this.overrides()
    for (const [sessionId, record] of table.entries()) {
      registerContextEditOverrides(sessionId, buildOverrides(record))
    }
  }

  private async overrides(): Promise<KvTable<string, OverridesRecord>> {
    await this.ready
    if (this.overridesTable === undefined) throw new Error('context-editor: overrides table unavailable')
    return this.overridesTable
  }

  /**
   * Store a session's tool removals and same-name schema edits (renames are
   * refused) and re-register the overrides for the live session.
   * @param request - the session id, removed tool names, and edit fragments by exact name.
   * @returns the stored override record.
   */
  @Remote('set-tools')
  async setTools(request: { sessionId: SessionId; removedTools: string[]; toolEdits: OverridesRecord['toolEdits'] }): Promise<OverridesRecord> {
    const table = await this.overrides()
    const known = await this.knownToolNames(request.sessionId)
    for (const name of Object.keys(request.toolEdits)) {
      if (!known.has(name)) {
        throw new RemoteError('context-editor/rename', `tool '${name}' is not in the session's recorded tool set; renames are refused`, { name })
      }
    }
    const previous = table.get(String(request.sessionId))
    const record: OverridesRecord = {
      removedTools: [...request.removedTools],
      toolEdits: { ...request.toolEdits },
      params: previous?.params ?? {},
    }
    await table.put(String(request.sessionId), record)
    registerContextEditOverrides(String(request.sessionId), buildOverrides(record))
    return record
  }

  /**
   * Validate and store a session's whitelisted parameter overrides, then
   * re-register them for the live session.
   * @param request - the session id and the parameter overrides.
   * @returns the stored override record.
   */
  @Remote('set-params')
  async setParams(request: { sessionId: SessionId; params: OverridesRecord['params'] }): Promise<OverridesRecord> {
    validateParams(request.params)
    const table = await this.overrides()
    const previous = table.get(String(request.sessionId))
    const record: OverridesRecord = {
      removedTools: previous?.removedTools ?? [],
      toolEdits: previous?.toolEdits ?? {},
      params: { ...request.params },
    }
    await table.put(String(request.sessionId), record)
    registerContextEditOverrides(String(request.sessionId), buildOverrides(record))
    return record
  }

  /**
   * Read a session's stored overrides.
   * @param request - the session id to read.
   * @returns the stored record, or null when the session has none.
   */
  @Remote('get-overrides')
  async getOverrides(request: { sessionId: SessionId }): Promise<{ record: OverridesRecord | null; inheritedByForks: false }> {
    const table = await this.overrides()
    return { record: table.get(String(request.sessionId)) ?? null, inheritedByForks: false }
  }

  /** Tool names from the session's latest request/header (empty set when none recorded). */
  private async knownToolNames(sessionId: SessionId): Promise<Set<string>> {
    const preview = await this.preview({ sessionId })
    return new Set((preview.tools ?? []).map(tool => (tool as { name?: string }).name ?? ''))
  }

  /**
   * Project the effective next-request context of one session.
   * @param request - the session id to project.
   * @returns the model-visible rows with their source citations plus the latest request header.
   */
  @Remote('preview')
  async preview(request: { sessionId: SessionId }): Promise<ContextPreview> {
    const live = this.ctx.sessions.get(request.sessionId)
    if (live !== undefined) {
      // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
      return previewFromEvents(request.sessionId, live.snapshotEvents())
    }
    if (await this.ctx.sessionPersistence.stat(request.sessionId) === undefined) {
      throw new RemoteError('context-editor/session-not-found', `unknown session '${request.sessionId}'`, { sessionId: request.sessionId })
    }
    const handle = await this.ctx.sessionPersistence.open(request.sessionId, 'read')
    try {
      const { events } = await handle.read()
      return previewFromEvents(request.sessionId, events)
    } finally {
      await handle.close()
    }
  }

  /**
   * List one session's captured model requests, newest first, one page at a time.
   * @param request - the session id and an optional seq cutoff below the page.
   * @returns the page of captured requests, whether more remain, and capture health.
   */
  @Remote('list-requests')
  async listRequests(request: { sessionId: SessionId; before?: number }): Promise<{
    entries: CapturedRequest[]
    hasMore: boolean
    captureDegraded: boolean
  }> {
    const table = await this.requests()
    const prefix = `${String(request.sessionId)}#`
    const all = [...table.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, record]) => record)
      .sort((left, right) => right.seq - left.seq)
    const before = request.before
    const filtered = before === undefined ? all : all.filter(record => record.seq < before)
    return {
      entries: filtered.slice(0, PAGE_SIZE),
      hasMore: filtered.length > PAGE_SIZE,
      captureDegraded: this.capture?.degraded() ?? false,
    }
  }

  /**
   * Read one captured model request in full.
   * @param request - the session id and the request seq to fetch.
   * @returns the captured request record.
   */
  @Remote('get-request')
  async getRequest(request: { sessionId: SessionId; seq: number }): Promise<CapturedRequest> {
    const table = await this.requests()
    const record = table.get(keyFor(String(request.sessionId), request.seq))
    if (record === undefined) {
      throw new RemoteError('context-editor/request-not-found', `no captured request #${String(request.seq)} for '${request.sessionId}'`, { sessionId: request.sessionId, seq: request.seq })
    }
    return record
  }

  /**
   * Replace one message's text content in place.
   * @param request - the session id, target seq, replacement text, and optional block index.
   * @returns the effective preview after the edit.
   */
  @Remote('edit-message')
  async editMessage(request: { sessionId: SessionId; targetSeq: number; text: string; blockIndex?: number }): Promise<ContextPreview> {
    const blockIndex = request.blockIndex
    await editMessageOp(this.ctx, request.sessionId, request.targetSeq, {
      text: request.text,
      ...(blockIndex === undefined ? {} : { blockIndex }),
    })
    return this.preview({ sessionId: request.sessionId })
  }

  /**
   * Exclude a contiguous message range from model input.
   * @param request - the session id and the inclusive seq range to exclude.
   * @returns the effective preview after the edit.
   */
  @Remote('exclude-range')
  async excludeRange(request: { sessionId: SessionId; startSeq: number; endSeq: number }): Promise<ContextPreview> {
    await excludeRangeOp(this.ctx, request.sessionId, request.startSeq, request.endSeq)
    return this.preview({ sessionId: request.sessionId })
  }

  /**
   * Exclude one message and the whole tail after it (the chat's edit-and-resend).
   * @param request - the session id and the seq to exclude from.
   * @returns the effective preview after the edit.
   */
  @Remote('exclude-from')
  async excludeFrom(request: { sessionId: SessionId; startSeq: number }): Promise<ContextPreview> {
    await excludeFromOp(this.ctx, request.sessionId, request.startSeq)
    return this.preview({ sessionId: request.sessionId })
  }

  /**
   * Undo an edit or exclusion by re-materializing the shadowed originals.
   * @param request - the session id and the shadowed range to restore.
   * @returns the effective preview after the edit.
   */
  @Remote('restore-range')
  async restoreRange(request: { sessionId: SessionId; startSeq: number; endSeq: number }): Promise<ContextPreview> {
    await restoreRange(this.ctx, request.sessionId, request.startSeq, request.endSeq)
    return this.preview({ sessionId: request.sessionId })
  }

  /**
   * Expand a compaction checkpoint in place back to its original messages.
   * @param request - the session id and the checkpoint seq to expand.
   * @returns the effective preview after the edit.
   */
  @Remote('expand-checkpoint')
  async expandCheckpoint(request: { sessionId: SessionId; checkpointSeq: number }): Promise<ContextPreview> {
    await expandCheckpoint(this.ctx, request.sessionId, request.checkpointSeq)
    return this.preview({ sessionId: request.sessionId })
  }

  /**
   * Condense a message range into one framed checkpoint via a summarization request.
   * @param request - the session id, the seq range to condense, and an optional steering instruction.
   * @returns the compaction id of the written checkpoint.
   */
  @Remote('condense-range')
  async condenseRange(request: {
    sessionId: SessionId
    startSeq: number
    endSeq: number
    instruction?: string
  }): Promise<{ compactionId: string }> {
    return await condenseRange(this.ctx, request.sessionId, request.startSeq, request.endSeq, request.instruction)
  }

  /**
   * Fork the session at a boundary so a mid-history restore has room to apply.
   * @param request - the session id and the last seq the child keeps.
   * @returns the child session's id.
   */
  @Remote('create-recovery-branch')
  async createRecoveryBranch(request: { sessionId: SessionId; boundarySeq: number }): Promise<{ sessionId: SessionId }> {
    return { sessionId: await createRecoveryBranch(this.ctx, request.sessionId, request.boundarySeq) }
  }

  private async requests(): Promise<KvTable<string, CapturedRequest>> {
    await this.ready
    if (this.requestsTable === undefined) throw new Error('context-editor: requests table unavailable')
    return this.requestsTable
  }
}

export default ContextEditorService
