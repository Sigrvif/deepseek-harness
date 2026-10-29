/**
 * Context Editor surface plugin, browser half: a `conversation.view` tab per
 * session showing the exact model-bound context (editable), the captured
 * request log, and the session's tools/params overrides. Talks to the host
 * through the self-mounted `contextEditor` remote.
 * @module @deepseek-ai/dsh-client-ui-context-editor/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (conversation.view).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ContextView } from './ContextView.tsx'
import type { ContextEditorApi } from './api.ts'
import { mountContextEditorRemote } from './remote.ts'
import { en, zh } from './locales.ts'

export type { ContextEditorApi } from './api.ts'
export { ContextView } from './ContextView.tsx'

/** Dictionary namespace owned by this plugin. */
const NS = 'contextEditor'

/** Required services: the remote mount, slots, locale, and the workspace (opening recovery branches). */
export const inject = ['remote', 'slots', 'locale', 'uiWorkspace']

/**
 * Client plugin body: mount the remote, register the copy, and dock the
 * Context tab into every session's conversation view list.
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  await mountContextEditorRemote(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-context-editor: dictionaries')

  ctx.slots.inject('conversation.view', () => {
    // The runtime shape matches ConvViewOwnerProps + the injected face below; the
    // generic slot contract typing cannot express per-entry inject faces, so the
    // registration is deliberately loose at this one boundary.
    const registry = ctx.slots as unknown as {
      register: (options: Record<string, unknown>, component: unknown) => () => void
    }
    return registry.register({
      name: 'conversation.view',
      id: 'context-editor',
      order: 20,
      label: () => 'Context',
      locale: NS,
      inject: (sessionId: SessionId) => {
        const t = ctx.locale.bind(NS) as (key: string) => string
        return {
          sessionId,
          api: (ctx.remote as unknown as { contextEditor: ContextEditorApi }).contextEditor,
          labels: Object.fromEntries(Object.keys(en).map(key => [key, t(key)])),
        }
      },
    }, ContextView)
  })
}
