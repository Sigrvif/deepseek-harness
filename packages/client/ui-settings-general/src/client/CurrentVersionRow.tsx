/** Installed release version in General Settings for Web and Desktop. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './CurrentVersionRow.module.css'

/**
 * Render the version embedded by the client build; partial builds without metadata omit the row.
 * @param props - runtime share and localized copy.
 * @returns the current release label, or nothing when build metadata is absent.
 */
export function CurrentVersionRow({ t }: PropsRuntime<'settings.general.item'> & PropsLocale<'settings'>) {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return null
  // fork(local-test): name the local fork package beside the dsh base
  // version, so the row answers both "which dsh is this" and "which fork
  // build". Stock builds carry no DSH_CLIENT_FORK_VERSION and render exactly
  // as upstream.
  const fork = process.env.DSH_CLIENT_FORK_VERSION
  return (
    <div className={css.row}>
      {t('general.currentVersion', { version })}
      {fork === undefined ? null : <span>{` · ${t('general.forkPackage', { fork })}`}</span>}
    </div>
  )
}
