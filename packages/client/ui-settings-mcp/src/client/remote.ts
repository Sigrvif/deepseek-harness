/** Mounts the generated `mcpManager` remote from the host package's typert
 * projection. Self-mounting keeps `packages/api/remotes` untouched (fork discipline). */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import mcpManagerRemote from '@deepseek-ai/dsh-mcp-manager/remote'

/** Mount the mcpManager remote into the client remote registry. */
export async function mountMcpManagerRemote(ctx: ClientContext): Promise<unknown> {
  return ctx.remote.$mount(mcpManagerRemote)
}
