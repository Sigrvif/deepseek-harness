/** Mounts the generated `contextEditor` remote from the host package's typert
 * projection. Self-mounting keeps `packages/api/remotes` untouched (fork discipline). */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote Context merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import contextEditorRemote from '@deepseek-ai/dsh-context-editor/remote'

/** Mount the contextEditor remote into the client remote registry. */
export async function mountContextEditorRemote(ctx: ClientContext): Promise<unknown> {
  return ctx.remote.$mount(contextEditorRemote)
}
