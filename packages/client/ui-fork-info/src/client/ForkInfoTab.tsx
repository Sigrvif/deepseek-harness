/** The Fork additions plugins tab: a static, locale-aware inventory of what
 * this fork carries beyond upstream dsh. @module @deepseek-ai/dsh-client-ui-fork-info/client */

import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ForkInfoTab.module.css'

/**
 * Render the static additions inventory.
 * @param props - localized copy.
 * @returns the tab body.
 */
export function ForkInfoTab({ t }: PropsLocale<'forkInfo'>) {
  return (
    <div className={css.tab}>
      <p className={css.intro}>{t('tab.intro')}</p>
      <section className={css.entry}>
        <h3 className={css.name}>{t('editor.name')}</h3>
        <p className={css.summary}>{t('editor.summary')}</p>
      </section>
      <section className={css.entry}>
        <h3 className={css.name}>{t('fold.name')}</h3>
        <p className={css.summary}>{t('fold.summary')}</p>
      </section>
      <section className={css.entry}>
        <h3 className={css.name}>{t('superpowers.name')}</h3>
        <p className={css.summary}>{t('superpowers.summary')}</p>
      </section>
      <section className={css.entry}>
        <h3 className={css.name}>{t('autoSkills.name')}</h3>
        <p className={css.summary}>{t('autoSkills.summary')}</p>
      </section>
      <p className={css.attribution}>{t('tab.attribution')}</p>
    </div>
  )
}
