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
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ContextView } from './ContextView.tsx'
import type { ContextEditorApi } from './api.ts'
import { mountContextEditorRemote } from './remote.ts'
import { en, zh } from './locales.ts'

export type { ContextEditorApi } from './api.ts'
export { ContextView } from './ContextView.tsx'

/** Dictionary namespace owned by this plugin. */
const NS = 'contextEditor'

/** Required services to mount: the remote registry, slots, locale, and the workspace (opening recovery branches). */
export const inject = ['remote', 'slots', 'locale', 'uiWorkspace']

type RawNamespace = Record<string, (args: unknown) => Promise<RemoteResult<unknown>>>

/**
 * Adapt the mounted namespace to the view's camelCase API. Mounted methods sit
 * behind their wire export names (kebab-case) and answer RemoteResult
 * envelopes, so the wrapper translates both; failures surface as errors.
 * @param namespace - the mounted `remote.contextEditor` namespace service.
 * @returns the promise-style API ContextView consumes.
 */
function contextEditorApi(namespace: unknown): ContextEditorApi {
  const raw = namespace as RawNamespace
  const call = async <T>(name: string, args: unknown): Promise<T> => {
    const invoke = raw[name]
    if (invoke === undefined) throw new Error(`contextEditor/${name} is not mounted`)
    const result = await invoke(args)
    if (!result.ok) {
      const failure = new Error(result.error.message) as Error & { code?: string }
      failure.code = result.error.code
      throw failure
    }
    return result.value as T
  }
  return {
    preview: args => call('preview', args),
    editMessage: args => call('edit-message', args),
    excludeRange: args => call('exclude-range', args),
    restoreRange: args => call('restore-range', args),
    expandCheckpoint: args => call('expand-checkpoint', args),
    createRecoveryBranch: args => call('create-recovery-branch', args),
    condenseRange: args => call('condense-range', args),
    listRequests: args => call('list-requests', args),
    getRequest: args => call('get-request', args),
    setTools: args => call('set-tools', args),
    setParams: args => call('set-params', args),
    getOverrides: args => call('get-overrides', args),
  }
}

/**
 * Client plugin body: mount the remote, register the copy, and dock the
 * Context tab into every session's conversation view list. The tab's inject
 * reads the mounted `remote.contextEditor` namespace through a child scope —
 * the namespace only exists after the mount above settles, so declaring it on
 * the plugin's own inject list would deadlock activation.
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  await mountContextEditorRemote(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-context-editor: dictionaries')

  ctx.inject(['remote.contextEditor', 'slots', 'locale'], (scoped: ClientContext) => {
    const scopedLocale = scoped.locale.bind(NS) as (key: string) => string
    scoped.slots.inject('conversation.view', () => {
      // The runtime shape matches ConvViewOwnerProps + the injected face below; the
      // generic slot contract typing cannot express per-entry inject faces, so the
      // registration is deliberately loose at this one boundary.
      const registry = scoped.slots as unknown as {
        register: (options: Record<string, unknown>, component: unknown) => () => void
      }
      return registry.register({
        name: 'conversation.view',
        id: 'context-editor',
        order: 20,
        // Thunk label: viewTabs() refreshes on locale changes, so the tab
        // follows the active dictionary.
        label: () => scopedLocale('view.label'),
        locale: NS,
        inject: (sessionId: SessionId) => {
          const t = scoped.locale.bind(NS) as (key: string) => string
          return {
            sessionId,
            api: contextEditorApi((scoped.remote as unknown as { contextEditor: unknown }).contextEditor),
            labels: t,
          }
        },
      }, ContextView)
    })
  })
}
