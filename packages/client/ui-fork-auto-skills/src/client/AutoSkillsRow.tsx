/** General Settings control for the automatic superpowers bootstrap. */
import { useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AutoSkillsRow.module.css'

/** Accepted setting and ordered mutation supplied by the settings owner. */
export interface AutoSkillsRowInjected {
  hooks: { autoSuperpowers: ObservableSnapshot<boolean> }
  setAuto(enabled: boolean): Promise<void>
}

/**
 * Render the auto-superpowers toggle.
 * @param props - accepted preference, writer and localized copy.
 * @returns the General Settings row.
 */
export function AutoSkillsRow({ useAutoSuperpowers, setAuto, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'forkAutoSkills'> & InjectFace<AutoSkillsRowInjected>) {
  const enabled = useAutoSuperpowers(value => value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className={css.row}>
    <div>
      <div className={css.title}>{t('autoSkills.title')}</div>
      <div className={css.description}>{t('autoSkills.description')}</div>
      {failed && <div role="alert">{t('autoSkills.error')}</div>}
    </div>
    <Switch checked={enabled} disabled={busy} label={t('autoSkills.title')}
      onChange={(next) => {
        setFailed(false)
        setBusy(true)
        void setAuto(next).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
      }} />
  </div>
}
