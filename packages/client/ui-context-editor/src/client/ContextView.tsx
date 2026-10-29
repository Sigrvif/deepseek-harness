/** The Context tab: effective model-bound context, request log, tools & params. */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ContextRow } from '@deepseek-ai/dsh-context-editor/types'
import type { ContextEditorApi } from './api.ts'
import styles from './ContextView.module.css'

export type PaneId = 'context' | 'requests' | 'tools'

export interface ContextViewProps {
  sessionId: string
  api: ContextEditorApi
  labels: (key: string) => string
}

function rowText(row: ContextRow): string {
  return row.text.length > 400 ? `${row.text.slice(0, 400)}…` : row.text
}

export function ContextView({ sessionId, api, labels }: ContextViewProps): ReactNode {
  const [pane, setPane] = useState<PaneId>('context')
  const [rows, setRows] = useState<ContextRow[] | undefined>(undefined)
  const [totalTokens, setTotalTokens] = useState(0)
  const [error, setError] = useState<string | undefined>(undefined)

  const refresh = useCallback((): void => {
    setError(undefined)
    api.preview({ sessionId: sessionId as never }).then(
      (preview) => {
        setRows(preview.rows)
        setTotalTokens(preview.totalTokens)
      },
      (failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure))
      },
    )
  }, [api, sessionId])

  useEffect(() => { refresh() }, [refresh])

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
      {pane === 'context' ? (
        error !== undefined
          ? <p className={styles.error} data-testid="context-error">{(labels('state.error') ?? 'Context Editor unavailable: {message}').replace('{message}', error)}</p>
          : rows === undefined
            ? <p>{labels('state.loading') ?? 'Loading context…'}</p>
            : (
              <>
                <p className={styles.total} data-testid="context-total">
                  {(labels('context.total') ?? '{tokens} tokens (est.)').replace('{tokens}', String(totalTokens))}
                </p>
                <ul className={styles.rows} data-testid="context-rows">
                  {rows.map(row => (
                    <li
                      key={row.seq}
                      className={row.excluded ? styles.rowExcluded : styles.row}
                      data-testid={`context-row-${row.role}`}
                    >
                      <span className={styles.role}>{row.role}</span>
                      <span className={styles.text}>{row.excluded ? `(${labels('badge.excluded') ?? 'excluded from model'})` : rowText(row)}</span>
                      {row.editedFrom !== undefined ? <span className={styles.badge}>{labels('badge.edited') ?? 'edited'}</span> : null}
                      {row.excluded ? <span className={styles.badge}>{labels('badge.excluded') ?? 'excluded from model'}</span> : null}
                      <span className={styles.tokens}>{row.estimateTokens}</span>
                    </li>
                  ))}
                </ul>
              </>
            )
      ) : (
        <p className={styles.placeholder}>{pane}</p>
      )}
    </div>
  )
}
