/**
 * @deepseek-ai/dsh-mcp-manager — user-managed MCP servers.
 *
 * fork(mcp-ui): the settings surface over `dsh-mcp-client`. Server
 * definitions persist in the `mcp_servers` storage domain (`$DSH_HOME/
 * storages/`, JSON) instead of profile patch rows, so the UI can edit them
 * live without touching the comment-bearing `cordis.patch.yml`; each enabled
 * definition mounts as its own mcp-client fiber (the pattern ACP uses for
 * session servers), disposed on disable/removal and re-mounted on launch.
 * The `mcpManager` Typert remote (list/upsert/remove/restart) serves the
 * Settings → MCP Servers page (`@deepseek-ai/dsh-client-ui-settings-mcp`).
 * Profile rows keep working beside it: both mount into the same root scope,
 * where mcp-client enforces serverName uniqueness.
 *
 * @module @deepseek-ai/dsh-mcp-manager
 */

import type { Context } from '@deepseek-ai/cordis'
import { McpManagerService } from './service.ts'

export { mcpServersDomain } from './domain.ts'
export { McpSupervisor } from './supervisor.ts'
export type { MountedClient, MountClient, SyncOutcome } from './supervisor.ts'
export { McpManagerService, McpManagerService as default }
export { mountFingerprint, mcpServerDefSchema, SERVER_NAME_PATTERN, toClientConfig } from './types.ts'
export type { McpIdRequest, McpServerDef, McpServerEntry, McpServerState, McpServerStatus, McpUpsertRequest } from './types.ts'

/** Stable Cordis plugin name; the service registers as `mcpManager`. */
export const name = 'mcp-manager'

/** The storage domain must be served before servers can mount. */
export const inject = ['storageDomain']

/**
 * Mount the manager: construct the service (self-registering on the gateway)
 * which opens the domain and mounts every enabled stored definition.
 * @param ctx - host context carrying the storage-domain facility.
 */
export function apply(ctx: Context): void {
  new McpManagerService(ctx)
}
