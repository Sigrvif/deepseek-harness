/** General Settings control for the unrestricted execution-mode toggle. */
import { useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './UnrestrictedRow.module.css'

/** Accepted setting and ordered mutation supplied by the settings owner. */
export interface UnrestrictedRowInjected {
  hooks: { unrestricted: ObservableSnapshot<boolean> }
  setUnrestricted(enabled: boolean): Promise<void>
}

/**
 * Render the unrestricted-mode toggle.
 * @param props - accepted preference, writer and localized copy.
 * @returns the General Settings row.
 */
export function UnrestrictedRow({ useUnrestricted, setUnrestricted, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'forkUnrestricted'> & InjectFace<UnrestrictedRowInjected>) {
  const enabled = useUnrestricted(value => value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className={css.row}>
    <div>
      <div className={css.title}>{t('unrestricted.title')}</div>
      <div className={css.description}>{t('unrestricted.description')}</div>
      {failed && <div role="alert">{t('unrestricted.error')}</div>}
    </div>
    <Switch checked={enabled} disabled={busy} label={t('unrestricted.title')}
      onChange={(next) => {
        setFailed(false)
        setBusy(true)
        void setUnrestricted(next).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
      }} />
  </div>
}
