/** General Settings control for the per-turn change-report toggle. */
import { useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ChangeReportRow.module.css'

/** Accepted setting and ordered mutation supplied by the settings owner. */
export interface ChangeReportRowInjected {
  hooks: { changeReports: ObservableSnapshot<boolean> }
  setChangeReports(enabled: boolean): Promise<void>
}

/**
 * Render the change-report toggle.
 * @param props - accepted preference, writer and localized copy.
 * @returns the General Settings row.
 */
export function ChangeReportRow({ useChangeReports, setChangeReports, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'forkChangeReport'> & InjectFace<ChangeReportRowInjected>) {
  const enabled = useChangeReports(value => value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className={css.row}>
    <div>
      <div className={css.title}>{t('changeReport.title')}</div>
      <div className={css.description}>{t('changeReport.description')}</div>
      {failed && <div role="alert">{t('changeReport.error')}</div>}
    </div>
    <Switch checked={enabled} disabled={busy} label={t('changeReport.title')}
      onChange={(next) => {
        setFailed(false)
        setBusy(true)
        void setChangeReports(next).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
      }} />
  </div>
}
