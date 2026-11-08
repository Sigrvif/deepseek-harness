/** The MCP Servers settings section: managed server cards plus an add/edit form. */
import { useState } from 'react'
import { Button, Input, StateDot, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { McpManagerApi, McpApiError, McpListValue, McpServerDef } from './api.ts'
import type { McpSettingsLocaleKey } from './locales.ts'
import css from './McpSection.module.css'

type Labels = (key: McpSettingsLocaleKey, values?: Record<string, unknown>) => string

/** Everything the section needs, supplied by the registration's inject. */
export interface McpSectionInjected {
  api: McpManagerApi
  labels: Labels
}

type LocaleBinder = PropsLocale<'mcpSettings'>

/** Blank definition for the add form. */
function blankDef(): McpServerDef {
  return { id: '', serverName: '', enabled: true, transport: 'stdio', command: '', args: [], env: {} }
}

/** Status chip color for a server's live state. */
function dotState(state: 'running' | 'failed' | 'disabled' | undefined): StateDotState {
  if (state === 'running') return 'done'
  if (state === 'failed') return 'error'
  return 'idle'
}

/** Parse the env textarea's KEY=VALUE lines; `null` on a malformed line. */
function parsePairs(text: string, separator: string): Record<string, string> | null {
  const pairs: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    const at = line.indexOf(separator)
    if (at <= 0) return null
    pairs[line.slice(0, at).trim()] = line.slice(at + separator.length).trim()
  }
  return pairs
}

/** Render the env map back to editable lines. */
function pairsToText(record: Record<string, string> | undefined, separator: string): string {
  return Object.entries(record ?? {}).map(([key, value]) => `${key}${separator}${value}`).join('\n')
}

/** Draft state of the add/edit form. */
interface Draft {
  def: McpServerDef
  argsText: string
  envText: string
  headersText: string
  timeoutText: string
}

function draftOf(def: McpServerDef): Draft {
  return {
    def: { ...def },
    argsText: (def.args ?? []).join('\n'),
    envText: pairsToText(def.env, '='),
    headersText: pairsToText(def.headers, ':'),
    timeoutText: def.toolCallTimeoutMs === undefined ? '' : String(def.toolCallTimeoutMs),
  }
}

/**
 * Render the MCP Servers section.
 * @param props - the injected API, localized copy, and runtime slot props.
 * @returns the settings page body.
 */
export function McpSection({ api, labels: t }: PropsRuntime<'settings.section'> & LocaleBinder & InjectFace<McpSectionInjected>) {
  const [servers, setServers] = useState<McpListValue['servers'] | undefined>(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  const [draft, setDraft] = useState<Draft | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | undefined>(undefined)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const [state, refresh] = useState(0)
  void state
  if (!loadedOnce) {
    setLoadedOnce(true)
    void api.list().then((value) => { setServers(value.servers); setLoadFailed(false) }).catch(() => setLoadFailed(true))
  }

  const run = async (action: () => Promise<McpListValue>, done?: (value: McpListValue) => void): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const value = await action()
      setServers(value.servers)
      done?.(value)
      refresh(current => current + 1)
    } catch (cause) {
      const failure = cause as McpApiError
      setError(failure.code === 'mcpManager/duplicate-name' ? t('duplicateName') : `${t('opFailed')}: ${failure.message}`)
    } finally {
      setBusy(false)
    }
  }

  /** Client-side mirror of the host's validation, for immediate feedback. */
  const validate = (candidate: Draft): string | undefined => {
    const name = candidate.def.serverName.trim()
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) return t('invalidName')
    if (candidate.def.transport === 'stdio' && (candidate.def.command ?? '').trim() === '') {
      return t('invalidCommand')
    }
    if (candidate.def.transport !== 'stdio' && !/^https?:\/\//.test(candidate.def.url ?? '')) {
      return t('invalidUrl')
    }
    if (candidate.timeoutText.trim() !== '' && (!/^\d+$/.test(candidate.timeoutText.trim()) || Number(candidate.timeoutText) < 1)) {
      return t('invalidTimeout')
    }
    if (candidate.def.transport === 'stdio') {
      if (parsePairs(candidate.envText, '=') === null) return t('envHint')
    } else if (parsePairs(candidate.headersText, ':') === null) return t('headersHint')
    return undefined
  }

  const save = (): void => {
    if (draft === undefined) return
    const problem = validate(draft)
    if (problem !== undefined) {
      setError(problem)
      return
    }
    const source = draft.def
    const candidate: McpServerDef = {
      ...source,
      serverName: source.serverName.trim(),
      command: source.transport === 'stdio' ? (source.command ?? '').trim() : undefined,
      args: source.transport === 'stdio'
        ? draft.argsText.split('\n').map(line => line.trim()).filter(line => line !== '')
        : undefined,
      env: source.transport === 'stdio' ? parsePairs(draft.envText, '=') ?? {} : undefined,
      cwd: source.transport === 'stdio' ? source.cwd?.trim() || undefined : undefined,
      url: source.transport === 'streamable-http' ? source.url?.trim() : undefined,
      headers: source.transport === 'streamable-http' ? parsePairs(draft.headersText, ':') ?? {} : undefined,
      toolCallTimeoutMs: draft.timeoutText.trim() === '' ? undefined : Number(draft.timeoutText),
    }
    void run(() => api.upsert(candidate), () => setDraft(undefined))
  }

  const summary = (def: McpServerDef): string => def.transport === 'stdio'
    ? [def.command, ...(def.args ?? [])].join(' ')
    : (def.url ?? '')

  return <div className={css.section}>
    <div className={css.header}>
      <div>
        <h2>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
      </div>
      {draft === undefined
        && <Button variant="outline" onClick={() => { setError(undefined); setDraft(draftOf(blankDef())) }}>{t('add')}</Button>}
    </div>

    {loadFailed && <p role="alert" className={css.error}>{t('loadFailed')}</p>}
    {error !== undefined && <p role="alert" className={css.error}>{error}</p>}
    {notice !== undefined && <p className={css.notice}>{notice}</p>}

    {draft !== undefined && <div className={css.form}>
      <div className={css.fieldRow}>
        <label className={css.field}>
          <span>{t('transport')}</span>
          <select
            value={draft.def.transport}
            onChange={event => setDraft({
              ...draft,
              def: { ...draft.def, transport: event.currentTarget.value as McpServerDef['transport'] },
            })}
          >
            <option value="stdio">{t('transportStdio')}</option>
            <option value="streamable-http">{t('transportHttp')}</option>
          </select>
        </label>
        <label className={css.field} htmlFor="mcp-server-name">
          <span>{t('serverName')}</span>
          <Input id="mcp-server-name" value={draft.def.serverName}
            onChange={event => setDraft({ ...draft, def: { ...draft.def, serverName: event.currentTarget.value } })} />
          <small>{t('serverNameHint')}</small>
        </label>
      </div>
      {draft.def.transport === 'stdio' ? <>
        <label className={css.field} htmlFor="mcp-command">
          <span>{t('command')}</span>
          <Input id="mcp-command" value={draft.def.command ?? ''}
            onChange={event => setDraft({ ...draft, def: { ...draft.def, command: event.currentTarget.value } })} />
          <small>{t('commandHint')}</small>
        </label>
        <label className={css.field}>
          <span>{t('args')}</span>
          <textarea rows={3} value={draft.argsText}
            onChange={event => setDraft({ ...draft, argsText: event.currentTarget.value })} />
          <small>{t('argsHint')}</small>
        </label>
        <label className={css.field}>
          <span>{t('env')}</span>
          <textarea rows={3} value={draft.envText}
            onChange={event => setDraft({ ...draft, envText: event.currentTarget.value })} />
          <small>{t('envHint')}</small>
        </label>
        <label className={css.field}>
          <span>{t('cwd')}</span>
          <Input value={draft.def.cwd ?? ''}
            onChange={event => setDraft({ ...draft, def: { ...draft.def, cwd: event.currentTarget.value } })} />
        </label>
      </> : <>
        <label className={css.field}>
          <span>{t('url')}</span>
          <Input value={draft.def.url ?? ''}
            onChange={event => setDraft({ ...draft, def: { ...draft.def, url: event.currentTarget.value } })} />
          <small>{t('urlHint')}</small>
        </label>
        <label className={css.field}>
          <span>{t('headers')}</span>
          <textarea rows={3} value={draft.headersText}
            onChange={event => setDraft({ ...draft, headersText: event.currentTarget.value })} />
          <small>{t('headersHint')}</small>
        </label>
      </>}
      <div className={css.fieldRow}>
        <label className={css.field}>
          <span>{t('timeout')}</span>
          <Input inputMode="numeric" value={draft.timeoutText}
            onChange={event => setDraft({ ...draft, timeoutText: event.currentTarget.value })} />
        </label>
        <label className={css.field}>
          <span>{t('enabled')}</span>
          <Switch checked={draft.def.enabled} label={t('enabled')}
            onChange={next => setDraft({ ...draft, def: { ...draft.def, enabled: next } })} />
        </label>
      </div>
      <div className={css.formActions}>
        <Button variant="outline" disabled={busy} onClick={save}>{busy ? t('saving') : t('save')}</Button>
        <Button onClick={() => { setDraft(undefined); setError(undefined) }}>{t('cancel')}</Button>
      </div>
    </div>}

    {servers !== undefined && servers.length === 0 && draft === undefined
      && <p className={css.empty}>{t('empty')}</p>}
    {servers !== undefined && servers.length > 0 && <ul className={css.cards}>
      {servers.map(({ def, status }) => <li key={def.id} className={css.card}>
        <div className={css.cardHead}>
          <StateDot state={dotState(status.state)} />
          <strong>{def.serverName}</strong>
          <span className={css.summary}>{summary(def)}</span>
        </div>
        <div className={css.cardBody}>
          <span className={css.transportTag}>
            {def.transport === 'stdio' ? t('transportStdio') : t('transportHttp')}
          </span>
          <span className={status.state === 'failed' ? css.error : css.stateText}>
            {status.state === 'failed'
              ? `${t('stateFailed')}: ${status.lastError ?? ''}`
              : t(status.state === 'running' ? 'stateRunning' : 'stateDisabled')}
          </span>
        </div>
        <div className={css.cardActions}>
          <Switch checked={def.enabled} label={t('enabled')} disabled={busy}
            onChange={next => void run(() => api.upsert({ ...def, enabled: next }))} />
          {confirmingId === def.id
            ? <>
              <span>{t('deleteTitle', { name: def.serverName })}</span>
              <Button variant="outline" disabled={busy} onClick={() => {
                void run(() => api.remove(def.id), () => setConfirmingId(undefined))
              }}>{t('confirmDelete')}</Button>
              <Button onClick={() => setConfirmingId(undefined)}>{t('cancel')}</Button>
            </>
            : <>
              <Button size="sm" disabled={busy} onClick={() => { setError(undefined); setDraft(draftOf(def)) }}>{t('edit')}</Button>
              <Button size="sm" disabled={busy}
                onClick={() => { void run(() => api.restart(def.id), () => setNotice(t('restartDone', { name: def.serverName }))) }}>
                {t('restart')}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => setConfirmingId(def.id)}>{t('remove')}</Button>
            </>}
        </div>
      </li>)}
    </ul>}
  </div>
}
