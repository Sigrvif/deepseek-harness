/**
 * Fork unrestricted-mode toggle, browser half: registers a localized
 * `settings.general.item` Switch row over the `unrestricted-mode` namespace,
 * so the opt-in execution-mode fusion stays discoverable and flippable from
 * the General settings page. Static wiring — the form reads and writes ride
 * the shared configForms service; no remote of its own.
 * @module @deepseek-ai/dsh-client-ui-fork-unrestricted/client
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
// Type-only: pulls this package's LocaleNamespaceMap merge ('forkUnrestricted').
import type {} from './locales.ts'
import { UnrestrictedRow, type UnrestrictedRowInjected } from './UnrestrictedRow.tsx'
import { en, zh } from './locales.ts'

export type { UnrestrictedKey } from './locales.ts'

export { UnrestrictedRow } from './UnrestrictedRow.tsx'
export type { UnrestrictedRowInjected } from './UnrestrictedRow.tsx'
export { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'forkUnrestricted'

/** The host entry id whose Config schema carries the volatile toggle. */
export const NAMESPACE = 'unrestricted-mode'

/** Required services to mount: the slot registry, the locale runtime, and the shared settings forms. */
export const inject = ['slots', 'locale', 'configForms']

/** Register the unrestricted-mode row on the General settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-fork-unrestricted: dictionaries')

  const t = ctx.locale.bind(NS)
  const form = ctx.configForms.get<{ enabled?: boolean }>(NAMESPACE)
  // Default matches the host schema default (off): an unreadable namespace
  // still shows the posture the host would apply.
  const unrestricted: ObservableSnapshot<boolean> = {
    getSnapshot: () => form.getSnapshot().value?.enabled ?? false,
    subscribe: (listener) => {
      let previous = unrestricted.getSnapshot()
      return form.subscribe(() => {
        const next = unrestricted.getSnapshot()
        if (next === previous) return
        previous = next
        listener()
      })
    },
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'fork-unrestricted',
    order: 17,
    label: () => t('unrestricted.title'),
    locale: NS,
    inject: (): UnrestrictedRowInjected => ({
      hooks: { unrestricted },
      setUnrestricted: async (enabled) => {
        if (!await form.set('enabled', enabled)) {
          throw new Error('Unrestricted mode preference was not saved')
        }
      },
    }),
  }, UnrestrictedRow))
}
