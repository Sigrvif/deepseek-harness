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
 * Broker mode (2.4.15, on by default): instead of every server tool, the
 * model sees `mcp_search_tools` / `mcp_describe_tool` / `mcp_execute_tool`
 * (see `src/broker.ts`). The volatile `broker` flag is read per assembled
 * request — the MCP Servers page toggle flips it live, and the settings
 * service persists it into this row's config like any volatile field.
 *
 * @module @deepseek-ai/dsh-mcp-manager
 */

import type { Context } from '@deepseek-ai/cordis'
import { createVolatile } from '@deepseek-ai/cosmokit'
import type {} from '@deepseek-ai/dsh-settings'
import { McpManagerService } from './service.ts'
import { installBroker } from './broker.ts'
import { Config } from './config.ts'

export { mcpServersDomain } from './domain.ts'
export { McpSupervisor } from './supervisor.ts'
export type { MountedClient, MountClient, SyncOutcome } from './supervisor.ts'
export { McpManagerService }
export { mountFingerprint, mcpServerDefSchema, SERVER_NAME_PATTERN, toClientConfig } from './types.ts'
export type { McpIdRequest, McpServerDef, McpServerEntry, McpServerState, McpServerStatus, McpUpsertRequest } from './types.ts'
export { installBroker, brokerDenyNames, rankTools, MCP_TOOL_PREFIX, BROKER_TOOL_NAMES, SEARCH_LIMIT } from './broker.ts'
export { Config }


/** Stable Cordis plugin name; the service registers as `mcpManager`. */
export const name = 'mcp-manager'

/** The storage domain must be served, and broker tools register into the tool registry. */
export const inject = ['storageDomain', 'tools']

/**
 * Mount the manager: construct the service (self-registering on the gateway),
 * open the domain, mount every enabled stored definition, and install the
 * broker's tools and request shaping behind the volatile toggle.
 * @param ctx - host context carrying the storage-domain facility and tools.
 * @param config - resolved volatile configuration; omitted (programmatic
 *   mounting, tests) resolves to the schema defaults.
 */
export function apply(ctx: Context, config?: Config): void {
  const broker = config?.broker ?? createVolatile(true)
  new McpManagerService(ctx)
  ctx.effect(() => installBroker(ctx, broker))
  // The MCP Servers page owns this preference's UI; suppress an auto-generated
  // duplicate page the way superpowers-bootstrap does for its toggle.
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}

/**
 * The mounted plugin face. This MUST be the default export: the loader
 * unwraps `exports.default ?? exports`, and the service class would mount
 * without `apply`, silently skipping the broker wiring (the 2.4.15 E2E
 * caught exactly that).
 */
const managerPlugin = { name, inject, Config, apply }

export default managerPlugin
