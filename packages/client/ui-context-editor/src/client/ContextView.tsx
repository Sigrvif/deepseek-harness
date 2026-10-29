/** The Context tab: effective model-bound context (editable), the captured
 * request log, and the session's tools/params overrides. */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CapturedRequest, ContextRow, OverridesRecord } from '@deepseek-ai/dsh-context-editor/types'
import type { ContextEditorApi } from './api.ts'
import styles from './ContextView.module.css'

export type PaneId = 'context' | 'requests' | 'tools'

export interface ContextViewProps {
  sessionId: string
  api: ContextEditorApi
  labels: (key: string) => string
}

type Preview = Awaited<ReturnType<ContextEditorApi['preview']>>

function clip(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function ContextPane({ sessionId, api, labels, preview, reload }: {
  sessionId: string
  api: ContextEditorApi
  labels: (key: string) => string
  preview: Preview
  reload: () => void
}): ReactNode {
  const [search, setSearch] = useState('')
  const [editingSeq, setEditingSeq] = useState<number | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [batch, setBatch] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [showJson, setShowJson] = useState(false)

  const filtered = search === ''
    ? preview.rows
    : preview.rows.filter(row => row.text.toLowerCase().includes(search.toLowerCase()))

  const run = useCallback((action: () => Promise<unknown>): void => {
    setBusy(true)
    setNotice(undefined)
    action().then(
      () => { setBusy(false); reload() },
      (failure: unknown) => {
        setBusy(false)
        setNotice(failure instanceof Error ? failure.message : String(failure))
      },
    )
  }, [reload])

  const saveEdit = (row: ContextRow): void => {
    setEditingSeq(undefined)
    // Whole-row edits of assistant messages target their first text block:
    // reasoning (and its replay signature) then stays untouched instead of
    // being flattened into the replacement.
    const blockIndex = row.role === 'assistant'
      ? row.blocks.findIndex(block => (block as { type?: string }).type === 'text')
      : -1
    run(() => api.editMessage({
      sessionId: sessionId as never,
      targetSeq: row.seq,
      text: draft,
      ...(blockIndex > 0 ? { blockIndex } : {}),
    }))
  }

  const exclude = (startSeq: number, endSeq: number): void => {
    if (!window.confirm(labels('confirm.exclude'))) return
    run(() => api.excludeRange({ sessionId: sessionId as never, startSeq, endSeq }))
  }

  const restore = (row: ContextRow): void => {
    const cited = row.editedFrom ?? row.excludes ?? [row.seq]
    const startSeq = cited[0] ?? row.seq
    const endSeq = cited.at(-1) ?? startSeq
    run(async () => {
      try {
        await api.restoreRange({ sessionId: sessionId as never, startSeq, endSeq })
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code === 'context-editor/requires-branch' && window.confirm(labels('confirm.branch'))) {
          const { sessionId: childId } = await api.createRecoveryBranch({ sessionId: sessionId as never, boundarySeq: startSeq - 1 })
          window.alert((labels('confirm.branchCreated') ?? 'Created branch {id}').replace('{id}', String(childId)))
          return
        }
        throw error
      }
    })
  }

  const toggleBatch = (seq: number): void => {
    setBatch(current => current.includes(seq) ? current.filter(seq_ => seq_ !== seq) : [...current, seq].sort((a, b) => a - b))
  }

  const batchExclude = (): void => {
    if (!window.confirm(labels('confirm.exclude'))) return
    setBusy(true)
    // Group the selection into contiguous runs; a single min..max range would
    // silently exclude unselected rows in between.
    const runs: Array<[number, number]> = []
    for (const seq of batch) {
      const current = runs.at(-1)
      if (current !== undefined && seq === current[1] + 1) current[1] = seq
      else runs.push([seq, seq])
    }
    const exclusions = runs.reduce(
      (chain, [start, end]) => chain.then(() => api.excludeRange({ sessionId: sessionId as never, startSeq: start, endSeq: end })),
      Promise.resolve() as Promise<unknown>,
    )
    void exclusions.then(
      () => { setBusy(false); setBatch([]); reload() },
      (failure: unknown) => { setBusy(false); setNotice(String(failure)) },
    )
  }

  const condense = (): void => {
    const first = batch[0]
    const last = batch.at(-1)
    if (first === undefined || last === undefined) return
    if (!window.confirm(labels('confirm.condense'))) return
    run(async () => {
      await api.condenseRange({ sessionId: sessionId as never, startSeq: first, endSeq: last })
      setBatch([])
    })
  }

  const batchEdit = (text: string): void => {
    if (batch.length === 0 || text === '') return
    setBusy(true)
    const edits = batch.reduce(
      (chain, seq) => chain.then(() => api.editMessage({ sessionId: sessionId as never, targetSeq: seq, text })),
      Promise.resolve() as Promise<unknown>,
    )
    void edits.then(
      () => { setBusy(false); setBatch([]); reload() },
      (failure: unknown) => { setBusy(false); setNotice(String(failure)) },
    )
  }

  return (
    <div className={styles.pane} data-testid="context-pane">
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          placeholder={labels('context.search')}
          value={search}
          onChange={(event) => { setSearch(event.target.value) }}
        />
        <span className={styles.total} data-testid="context-total">{(labels('context.total') ?? '{tokens} tokens (est.)').replace('{tokens}', String(preview.totalTokens))}</span>
      </div>
      {batch.length > 0 ? (
        <div className={styles.batchBar} data-testid="batch-bar">
          <span>{batch.length}</span>
          <button type="button" disabled={busy} onClick={batchExclude}>{labels('action.exclude')}</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const text = window.prompt(labels('prompt.batchEdit') ?? '') ?? ''
              batchEdit(text)
            }}
          >
            {labels('action.edit')}
          </button>
          <button type="button" disabled={busy} onClick={condense}>{labels('action.condense')}</button>
          <button type="button" onClick={() => { setBatch([]) }}>{labels('action.cancel')}</button>
        </div>
      ) : null}
      {notice !== undefined ? <p className={styles.notice} role="alert">{notice}</p> : null}
      <ul className={styles.rows} data-testid="context-rows">
        {filtered.map(row => (
          <li
            key={row.seq}
            className={row.excluded ? styles.rowExcluded : styles.row}
            data-testid={`context-row-${row.role}`}
          >
            <input
              type="checkbox"
              aria-label={labels('action.edit')}
              checked={batch.includes(row.seq)}
              onChange={() => { toggleBatch(row.seq) }}
            />
            <span className={styles.role}>{row.role}</span>
            {editingSeq === row.seq ? (
              <span className={styles.editing}>
                <textarea
                  value={draft}
                  data-testid={`edit-${String(row.seq)}`}
                  onChange={(event) => { setDraft(event.target.value) }}
                />
                <button type="button" disabled={busy} onClick={() => { saveEdit(row) }}>{labels('action.save')}</button>
                <button type="button" onClick={() => { setEditingSeq(undefined) }}>{labels('action.cancel')}</button>
              </span>
            ) : (
              <span className={styles.text}>{row.excluded ? `(${labels('badge.excluded')})` : clip(row.text)}</span>
            )}
            {row.editedFrom !== undefined ? <span className={styles.badge}>{labels('badge.edited')}</span> : null}
            {row.excluded ? <span className={styles.badge}>{labels('badge.excluded')}</span> : null}
            <span className={styles.tokens}>{row.estimateTokens}</span>
            <span className={styles.actions}>
              {row.editedFrom === undefined && !row.excluded && !row.excludes
                ? <button type="button" disabled={busy} onClick={() => { setEditingSeq(row.seq); setDraft(row.text) }}>{labels('action.edit')}</button>
                : null}
              {row.excluded || row.editedFrom !== undefined
                ? <button type="button" disabled={busy} data-testid={`restore-${String(row.seq)}`} onClick={() => { restore(row) }}>{labels('action.restore')}</button>
                : <button type="button" disabled={busy} onClick={() => { exclude(row.seq, row.seq) }}>{labels('action.exclude')}</button>}
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.jsonToggle}>
        <button type="button" onClick={() => { setShowJson(current => !current) }}>{labels('action.showJson')}</button>
        {showJson ? (
          <pre className={styles.json} data-testid="next-request-json">{JSON.stringify({ config: preview.config, tools: preview.tools }, null, 2)}</pre>
        ) : null}
      </div>
    </div>
  )
}

function RequestsPane({ sessionId, api, labels }: {
  sessionId: string
  api: ContextEditorApi
  labels: (key: string) => string
}): ReactNode {
  const [entries, setEntries] = useState<CapturedRequest[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [openSeq, setOpenSeq] = useState<number | undefined>(undefined)

  const load = useCallback((before?: number): void => {
    api.listRequests({ sessionId: sessionId as never, ...(before === undefined ? {} : { before }) }).then(
      (page) => {
        setEntries(current => before === undefined ? page.entries : [...current, ...page.entries])
        setHasMore(page.hasMore)
        setDegraded(page.captureDegraded)
      },
      () => { setDegraded(true) },
    )
  }, [api, sessionId])

  useEffect(() => { load() }, [load])

  return (
    <div className={styles.pane} data-testid="requests-pane">
      {degraded ? <p className={styles.notice} data-testid="degraded-notice">{labels('state.captureDegraded')}</p> : null}
      <ul className={styles.rows}>
        {entries.map(entry => (
          <li key={entry.seq} className={styles.row} data-testid={`request-${String(entry.seq)}`}>
            <span className={styles.tokens}>#{entry.seq}</span>
            <span className={styles.role}>{entry.purpose ?? 'agent'}</span>
            <span className={styles.text}>{entry.model} · {new Date(entry.time).toLocaleTimeString()} · {entry.status}</span>
            <button type="button" onClick={() => { setOpenSeq(current => current === entry.seq ? undefined : entry.seq) }}>
              {openSeq === entry.seq ? '▾' : '▸'}
            </button>
            {openSeq === entry.seq ? (
              <pre className={styles.json} data-testid={`request-json-${String(entry.seq)}`}>{JSON.stringify(entry, null, 2)}</pre>
            ) : null}
          </li>
        ))}
      </ul>
      {hasMore ? <button type="button" onClick={() => { load(entries.at(-1)?.seq) }}>{labels('action.loadMore')}</button> : null}
    </div>
  )
}

function ToolsPane({ sessionId, api, labels, preview, reload }: {
  sessionId: string
  api: ContextEditorApi
  labels: (key: string) => string
  preview: Preview
  reload: () => void
}): ReactNode {
  const tools = preview.tools ?? []
  const [record, setRecord] = useState<OverridesRecord | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getOverrides({ sessionId: sessionId as never }).then(
      (result) => { setRecord(result.record) },
      () => { setRecord(null) },
    )
  }, [api, sessionId])

  const commit = (next: OverridesRecord): void => {
    setBusy(true)
    api.setTools({ sessionId: sessionId as never, removedTools: next.removedTools, toolEdits: next.toolEdits }).then(
      (saved) => { setBusy(false); setRecord(saved); reload() },
      (failure: unknown) => { setBusy(false); window.alert(String(failure)) },
    )
  }

  const removeTool = (name: string): void => {
    const current = record ?? { removedTools: [], toolEdits: {}, params: {} }
    if (current.removedTools.includes(name)) {
      commit({ ...current, removedTools: current.removedTools.filter((name_: string) => name_ !== name) })
      return
    }
    commit({ ...current, removedTools: [...current.removedTools, name] })
  }

  const setStop = (raw: string): void => {
    const current = record ?? { removedTools: [], toolEdits: {}, params: {} }
    const list = raw.split(',').map(entry => entry.trim()).filter(entry => entry !== '')
    const params: OverridesRecord['params'] = { ...current.params }
    if (list.length === 0) delete params['stop']
    else params['stop'] = list
    setBusy(true)
    api.setParams({ sessionId: sessionId as never, params }).then(
      (saved) => { setBusy(false); setRecord(saved); reload() },
      (failure: unknown) => { setBusy(false); window.alert(String(failure)) },
    )
  }

  const setParam = (field: string, raw: string): void => {
    const current = record ?? { removedTools: [], toolEdits: {}, params: {} }
    const value = raw === '' ? undefined : Number(raw)
    const params: OverridesRecord['params'] = { ...current.params }
    if (value === undefined || Number.isNaN(value)) {
      const rest: OverridesRecord['params'] = {}
      for (const [key, existing] of Object.entries(params)) {
        if (key !== field) rest[key as 'temperature'] = existing as never
      }
      setBusy(true)
      api.setParams({ sessionId: sessionId as never, params: rest }).then(
        (saved) => { setBusy(false); setRecord(saved); reload() },
        (failure: unknown) => { setBusy(false); window.alert(String(failure)) },
      )
      return
    }
    params[field as 'temperature'] = value as never
    setBusy(true)
    api.setParams({ sessionId: sessionId as never, params }).then(
      (saved) => { setBusy(false); setRecord(saved); reload() },
      (failure: unknown) => { setBusy(false); window.alert(String(failure)) },
    )
  }

  const removed = record?.removedTools ?? []
  const params = record?.params ?? {}

  return (
    <div className={styles.pane} data-testid="tools-pane">
      <p className={styles.total}>{labels('tools.note')}</p>
      <ul className={styles.rows} data-testid="tools-list">
        {tools.map((tool) => {
          const name = (tool as { name?: string }).name ?? ''
          return (
            <li key={name} className={styles.row} data-testid={`tool-${name}`}>
              <span className={styles.role}>{name}</span>
              <span className={styles.text}>{(tool as { description?: string }).description}</span>
              <button type="button" disabled={busy} onClick={() => { removeTool(name) }}>
                {removed.includes(name) ? labels('action.includeTool') : labels('action.removeTool')}
              </button>
            </li>
          )
        })}
      </ul>
      <div className={styles.toolbar} data-testid="params-form">
        {(['temperature', 'maxTokens'] as const).map(field => (
          <label key={field} className={styles.paramRow}>
            <span>{field}</span>
            <input
              type="number"
              step="any"
              defaultValue={params[field] === undefined ? '' : String(params[field])}
              data-testid={`param-${field}`}
              onBlur={(event) => { setParam(field, event.target.value) }}
            />
          </label>
        ))}
        <label className={styles.paramRow}>
          <span>stop</span>
          <input
            type="text"
            placeholder="a, b, c"
            defaultValue={(params['stop'] as string[] | undefined)?.join(', ') ?? ''}
            data-testid="param-stop"
            onBlur={(event) => { setStop(event.target.value) }}
          />
        </label>
      </div>
    </div>
  )
}

export function ContextView({ sessionId, api, labels }: ContextViewProps): ReactNode {
  const [pane, setPane] = useState<PaneId>('context')
  const [preview, setPreview] = useState<Preview | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [degraded, setDegraded] = useState(false)

  const reload = useCallback((): void => {
    setError(undefined)
    api.preview({ sessionId: sessionId as never }).then(
      (next) => { setPreview(next) },
      (failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure))
      },
    )
  }, [api, sessionId])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    api.listRequests({ sessionId: sessionId as never }).then(
      (page) => { setDegraded(page.captureDegraded) },
      () => { setDegraded(false) },
    )
  }, [api, sessionId])

  return (
    <div className={styles.view} data-testid="context-editor-view">
      <div className={styles.tabs} role="tablist">
        {(['context', 'requests', 'tools'] as const).map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pane === id}
            className={pane === id ? styles.tabActive : styles.tab}
            onClick={() => { setPane(id) }}
          >
            {labels(`pane.${id}`) ?? id}
          </button>
        ))}
      </div>
      {error !== undefined ? (
        <p className={styles.error} data-testid="context-error">
          {(labels('state.error') ?? 'Context Editor unavailable: {message}').replace('{message}', error)}
        </p>
      ) : preview === undefined ? (
        <p>{labels('state.loading') ?? 'Loading context…'}</p>
      ) : pane === 'context' ? (
        <>
          {degraded ? <p className={styles.notice} data-testid="degraded-notice">{labels('state.captureDegraded')}</p> : null}
          <ContextPane sessionId={sessionId} api={api} labels={labels} preview={preview} reload={reload} />
        </>
      ) : pane === 'requests' ? (
        <RequestsPane sessionId={sessionId} api={api} labels={labels} />
      ) : (
        <ToolsPane sessionId={sessionId} api={api} labels={labels} preview={preview} reload={reload} />
      )}
    </div>
  )
}
