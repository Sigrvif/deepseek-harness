/**
 * MCP servers settings page, browser half: registers a localized
 * `settings.section` over the self-mounted `mcpManager` remote, so MCP
 * servers are managed from Settings instead of hand-edited profile rows.
 * The host half (`@deepseek-ai/dsh-mcp-manager`) owns persistence and the
 * per-server mcp-client fibers; this page only drives its remote.
 * @module @deepseek-ai/dsh-client-ui-settings-mcp/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the settings SlotMap merge (settings.section) and the
// configForms Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls this package's LocaleNamespaceMap merge ('mcpSettings').
import type {} from './locales.ts'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { McpSection } from './McpSection.tsx'
import type { McpSectionInjected } from './McpSection.tsx'
import { mcpManagerApi } from './api.ts'
import { mountMcpManagerRemote } from './remote.ts'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'

export type { McpSettingsLocaleKey } from './locales.ts'
export { McpSection } from './McpSection.tsx'
export type { McpSectionInjected } from './McpSection.tsx'
export { mcpManagerApi } from './api.ts'
export type { McpManagerApi, McpServerDef, McpServerEntry } from './api.ts'
export { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'mcpSettings'

/** Required services to mount: remotes, slots, locale, and the shared settings forms. */
export const inject = ['remote', 'slots', 'locale', 'configForms']

/**
 * Client plugin body: mount the remote, register the copy, and dock the
 * MCP Servers section into the settings nav. The section's inject reads the
 * mounted `remote.mcpManager` namespace through a child scope — the
 * namespace only exists after the mount settles, so declaring it on the
 * plugin's own inject list would deadlock activation.
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  await mountMcpManagerRemote(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-settings-mcp: dictionaries')

  // The broker flag lives in the mcp-manager namespace (volatile, default on);
  // reads ride the shared settings mirror, writes the revision-fenced mutate.
  const NAMESPACE = 'mcp-manager'
  const form = ctx.configForms.get<{ broker?: boolean }>(NAMESPACE)
  const broker: ObservableSnapshot<boolean> = {
    getSnapshot: () => form.getSnapshot().value?.broker ?? true,
    subscribe: (listener) => {
      let previous = broker.getSnapshot()
      return form.subscribe(() => {
        const next = broker.getSnapshot()
        if (next === previous) return
        previous = next
        listener()
      })
    },
  }
  ctx.inject(['remote.mcpManager', 'slots', 'locale'], (scoped: ClientContext) => {
    scoped.slots.inject('settings.section', () => {
      const registry = scoped.slots as unknown as {
        register: (options: Record<string, unknown>, component: unknown) => () => void
      }
      const binder = scoped.locale.bind(NS) as (key: string, values?: Record<string, unknown>) => string
      return registry.register({
        name: 'settings.section',
        id: 'mcp',
        order: 20,
        label: () => binder('nav'),
        locale: NS,
        inject: (): McpSectionInjected => ({
          api: mcpManagerApi((scoped.remote as { mcpManager?: unknown }).mcpManager),
          labels: binder,
          hooks: { broker },
          setBroker: async (enabled: boolean) => {
            if (!await form.set('broker', enabled)) throw new Error('Broker preference was not saved')
          },
        }),
      }, McpSection)
    })
  })
}
