/**
 * Fork change-report toggle, browser half: registers a localized
 * `settings.general.item` Switch row over the `change-report` namespace, so
 * the per-turn files-changed notices stay discoverable and flippable from the
 * General settings page. Static wiring — the form reads and writes ride the
 * shared configForms service; no remote of its own.
 * @module @deepseek-ai/dsh-client-ui-fork-change-report/client
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
// Type-only: pulls this package's LocaleNamespaceMap merge ('forkChangeReport').
import type {} from './locales.ts'
import { ChangeReportRow, type ChangeReportRowInjected } from './ChangeReportRow.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'

export type { ChangeReportKey } from './locales.ts'

export { ChangeReportRow } from './ChangeReportRow.tsx'
export type { ChangeReportRowInjected } from './ChangeReportRow.tsx'
export { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'forkChangeReport'

/** The host entry id whose Config schema carries the volatile toggle. */
export const NAMESPACE = 'change-report'

/** Required services to mount: the slot registry, the locale runtime, and the shared settings forms. */
export const inject = ['slots', 'locale', 'configForms']

/** Register the change-report row on the General settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-fork-change-report: dictionaries')

  const t = ctx.locale.bind(NS)
  const form = ctx.configForms.get<{ enabled?: boolean }>(NAMESPACE)
  // Default matches the host schema default (on): an unreadable namespace
  // still shows the posture the host would apply.
  const changeReports: ObservableSnapshot<boolean> = {
    getSnapshot: () => form.getSnapshot().value?.enabled ?? true,
    subscribe: (listener) => {
      let previous = changeReports.getSnapshot()
      return form.subscribe(() => {
        const next = changeReports.getSnapshot()
        if (next === previous) return
        previous = next
        listener()
      })
    },
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'fork-change-report',
    order: 18,
    label: () => t('changeReport.title'),
    locale: NS,
    inject: (): ChangeReportRowInjected => ({
      hooks: { changeReports },
      setChangeReports: async (enabled) => {
        if (!await form.set('enabled', enabled)) {
          throw new Error('Change report preference was not saved')
        }
      },
    }),
  }, ChangeReportRow))
}
