/**
 * Fork auto-superpowers toggle, browser half: registers a localized
 * `settings.general.item` Switch row over the `superpowers-bootstrap`
 * namespace, so the automatic using-superpowers bootstrap stays discoverable
 * and flippable from the General settings page. Static wiring — the form
 * reads and writes ride the shared configForms service; no remote of its own.
 * @module @deepseek-ai/dsh-client-ui-fork-auto-skills/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ObservableSnapshot type.
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the settings SlotMap merge (settings.general.item) and the
// configForms Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls this package's LocaleNamespaceMap merge ('forkAutoSkills').
import type {} from './locales.ts'
import { AutoSkillsRow, type AutoSkillsRowInjected } from './AutoSkillsRow.tsx'
import { en, zh } from './locales.ts'

export type { AutoSkillsKey } from './locales.ts'

export { AutoSkillsRow } from './AutoSkillsRow.tsx'
export type { AutoSkillsRowInjected } from './AutoSkillsRow.tsx'
export { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'forkAutoSkills'

/** The host entry id whose Config schema carries the volatile toggle. */
export const NAMESPACE = 'superpowers-bootstrap'

/** Required services to mount: the slot registry, the locale runtime, and the shared settings forms. */
export const inject = ['slots', 'locale', 'configForms']

/** Register the auto-superpowers row on the General settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-fork-auto-skills: dictionaries')

  const t = ctx.locale.bind(NS)
  const form = ctx.configForms.get<{ autoUsingSuperpowers?: boolean }>(NAMESPACE)
  // Default matches the host schema default (on): an unreadable namespace
  // still shows the posture the host would apply.
  const autoSuperpowers: ObservableSnapshot<boolean> = {
    getSnapshot: () => form.getSnapshot().value?.autoUsingSuperpowers ?? true,
    subscribe: (listener) => {
      let previous = autoSuperpowers.getSnapshot()
      return form.subscribe(() => {
        const next = autoSuperpowers.getSnapshot()
        if (next === previous) return
        previous = next
        listener()
      })
    },
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'fork-auto-skills',
    order: 16,
    label: () => t('autoSkills.title'),
    locale: NS,
    inject: (): AutoSkillsRowInjected => ({
      hooks: { autoSuperpowers },
      setAuto: async (enabled) => {
        if (!await form.set('autoUsingSuperpowers', enabled)) {
          throw new Error('Auto superpowers preference was not saved')
        }
      },
    }),
  }, AutoSkillsRow))
}
