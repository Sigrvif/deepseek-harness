/**
 * Fork brand, browser half: claims the sidebar's brand-mark and brand-name
 * slots so the logo row renders the DSLRH mark and fork version instead of
 * the upstream local-build fallbacks (the whale logo and the base-version
 * string). Static — no remotes; the locale service owns the name-plate copy.
 * @module @deepseek-ai/dsh-client-ui-fork-brand/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's SlotMap merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-sidebar SlotMap merge (sidebar.brand.*).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ForkBrandMark, ForkBrandName } from './ForkBrand.tsx'
import { zh, en, ja, es, fr, de, ru, pt } from './locales.ts'

export { ForkBrandMark, ForkBrandName } from './ForkBrand.tsx'

/** The name-plate copy's locale namespace. */
export const NS = 'forkBrand' as const

/** Required services to mount: the slot registry and the locale runtime. */
export const inject = ['slots', 'locale']

/** Contribute the DSLRH brand occupants to the sidebar's logo row. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-fork-brand: dictionaries')
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark',
  }, ForkBrandMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name',
    locale: NS,
  }, ForkBrandName))
}
