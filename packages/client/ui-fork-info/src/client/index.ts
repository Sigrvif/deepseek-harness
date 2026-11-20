/**
 * Fork additions tab, browser half: registers a localized `settings.plugins.tab`
 * naming what this fork carries beyond upstream dsh, so the Plugins settings
 * page keeps the additions discoverable. Static content — no remote, no host
 * services beyond slots and locale.
 * @module @deepseek-ai/dsh-client-ui-fork-info/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the settings SlotMap merge (settings.plugins.tab).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls this package's LocaleNamespaceMap merge ('forkInfo').
import type {} from './locales.ts'
import { ForkInfoTab } from './ForkInfoTab.tsx'
import { zh, en, ja, es, fr, de, ru, pt } from './locales.ts'

export type { ForkInfoLocaleKey } from './locales.ts'
export { ForkInfoTab } from './ForkInfoTab.tsx'
export { zh, en, ja, es, fr, de, ru, pt } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'forkInfo'

/** Required services to mount: the slot registry and the locale runtime. */
export const inject = ['slots', 'locale']

/** Contribute the Fork additions tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-fork-info: dictionaries')

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'fork-additions',
    order: 5,
    label: () => t('tab.label'),
    locale: NS,
    inject: () => ({}),
  }, ForkInfoTab))
}
