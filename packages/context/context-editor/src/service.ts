/** The `contextEditor` remote: read-side surface projection and request-log access. */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { keyFor, installRequestCapture } from './capture.ts'
import type { RequestCapture } from './capture.ts'
import { condenseRange } from './condense.ts'
import { contextEditorDomain } from './domain.ts'
import { previewFromEvents } from './projection.ts'
import type { CapturedRequest, ContextPreview, OverridesRecord } from './types.ts'

const PAGE_SIZE = 30

export class ContextEditorService extends TypertRemoteService {
  static inject = ['sessions', 'sessionPersistence', 'llm', 'storageDomain', 'compaction']

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
  }

  @Remote('preview')
  async preview(request: { sessionId: SessionId }): Promise<ContextPreview> {
    const live = this.ctx.sessions.get(request.sessionId)
    if (live !== undefined) {
      // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred (mirrors message-feedback).
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

  @Remote('get-request')
  async getRequest(request: { sessionId: SessionId; seq: number }): Promise<CapturedRequest> {
    const table = await this.requests()
    const record = table.get(keyFor(String(request.sessionId), request.seq))
    if (record === undefined) {
      throw new RemoteError('context-editor/request-not-found', `no captured request #${String(request.seq)} for '${request.sessionId}'`, { sessionId: request.sessionId, seq: request.seq })
    }
    return record
  }

  @Remote('edit-message')
  async editMessage(request: { sessionId: SessionId; targetSeq: number; text: string; blockIndex?: number }): Promise<ContextPreview> {
    const blockIndex = request.blockIndex
    await editMessageOp(this.ctx, request.sessionId, request.targetSeq, {
      text: request.text,
      ...(blockIndex === undefined ? {} : { blockIndex }),
    })
    return this.preview({ sessionId: request.sessionId })
  }

  @Remote('exclude-range')
  async excludeRange(request: { sessionId: SessionId; startSeq: number; endSeq: number }): Promise<ContextPreview> {
    await excludeRangeOp(this.ctx, request.sessionId, request.startSeq, request.endSeq)
    return this.preview({ sessionId: request.sessionId })
  }

  @Remote('restore-range')
  async restoreRange(request: { sessionId: SessionId; startSeq: number; endSeq: number }): Promise<ContextPreview> {
    await restoreRange(this.ctx, request.sessionId, request.startSeq, request.endSeq)
    return this.preview({ sessionId: request.sessionId })
  }

  @Remote('expand-checkpoint')
  async expandCheckpoint(request: { sessionId: SessionId; checkpointSeq: number }): Promise<ContextPreview> {
    await expandCheckpoint(this.ctx, request.sessionId, request.checkpointSeq)
    return this.preview({ sessionId: request.sessionId })
  }

  @Remote('condense-range')
  async condenseRange(request: {
    sessionId: SessionId
    startSeq: number
    endSeq: number
    instruction?: string
  }): Promise<{ compactionId: string }> {
    return await condenseRange(this.ctx, request.sessionId, request.startSeq, request.endSeq, request.instruction)
  }

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
