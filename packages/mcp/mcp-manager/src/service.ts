/** The `mcpManager` remote: list/upsert/remove/restart the managed MCP servers. */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { randomUUID } from 'node:crypto'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { mcpServersDomain } from './domain.ts'
import { McpSupervisor } from './supervisor.ts'
import type { MountClient } from './supervisor.ts'
import { SERVER_NAME_PATTERN } from './types.ts'
import type { McpIdRequest, McpUpsertRequest } from './types.ts'
import type { McpServerDef, McpServerEntry } from './types.ts'

/**
 * Storage-backed manager of user-configured MCP servers. Definitions live in
 * the `mcp_servers` domain (JSON under `$DSH_HOME/storages/`); each enabled
 * definition is mounted as its own mcp-client fiber, restarted on change,
 * disposed on disable or removal, and re-mounted on the next launch.
 */
export class McpManagerService extends TypertRemoteService {
  static inject = ['storageDomain']

  private table: KvTable<string, McpServerDef> | undefined
  private readonly supervisor: McpSupervisor
  private defs: McpServerDef[] = []

  /** Settles once the storage domain is open and the initial sync finished. */
  readonly ready: Promise<void>

  constructor(ctx: Context, domain?: Domain<typeof mcpServersDomain>, mount?: MountClient) {
    super(ctx, 'mcpManager')
    // The real mount: failOnStartupError is set in every config, so the
    // awaited plugin call settles only after connect + tool discovery, and
    // cordis rolls a failed fiber back — the supervisor records the reject.
    const mountClient: MountClient = mount ?? (async (config) => {
      const fiber: Fiber = await ctx.plugin(McpClient, config)
      return { dispose: () => fiber.dispose() }
    })
    this.supervisor = new McpSupervisor(mountClient)
    this.ready = (domain !== undefined
      ? Promise.resolve(domain)
      : ctx.storageDomain.open(mcpServersDomain))
      .then(async (opened) => {
        this.table = opened.table('servers')
        this.defs = [...opened.table('servers').entries()].map(([, def]) => def)
        await this.supervisor.sync(this.defs)
      })
    ctx.effect(() => () => { this.supervisor.disposeAll() })
  }

  /**
   * Every managed server with its live status, storage order.
   * @returns the server entries in storage order, each definition with its live status.
   */
  @Remote
  async list(): Promise<{ servers: McpServerEntry[] }> {
    await this.ready
    return { servers: await this.entries() }
  }

  /**
   * Insert or replace one definition and reconcile its fiber.
   * @param request - the definition to insert or replace, matched by its id.
   * @returns the server entries in storage order after the reconcile.
   */
  @Remote
  async upsert(request: McpUpsertRequest): Promise<{ servers: McpServerEntry[] }> {
    await this.ready
    const def = this.validate(request.def)
    const index = this.defs.findIndex(existing => existing.id === def.id)
    if (index >= 0) this.defs[index] = def
    else this.defs.push(def)
    await (this.table ?? throwClosed()).put(def.id, def)
    await this.supervisor.sync(this.defs)
    return { servers: await this.entries() }
  }

  /**
   * Delete one definition and dispose its fiber.
   * @param request - the id of the managed server to delete.
   * @returns the remaining server entries in storage order.
   */
  @Remote('delete-server')
  async remove(request: McpIdRequest): Promise<{ servers: McpServerEntry[] }> {
    await this.ready
    this.defs = this.defs.filter(existing => existing.id !== request.id)
    await (this.table ?? throwClosed()).delete(request.id)
    await this.supervisor.sync(this.defs)
    return { servers: await this.entries() }
  }

  /**
   * Force one server's remount (clear a stuck connection, pick up new tools).
   * @param request - the id of the managed server to restart.
   * @returns the server entries in storage order with the restarted status.
   */
  @Remote('restart-server')
  async restart(request: McpIdRequest): Promise<{ servers: McpServerEntry[] }> {
    await this.ready
    const def = this.defs.find(existing => existing.id === request.id)
    if (def === undefined) {
      throw new RemoteError('mcpManager/unknown-id', `no managed MCP server with id '${request.id}'`, { id: request.id })
    }
    await this.supervisor.restart(def)
    return { servers: await this.entries() }
  }

  private async entries(): Promise<McpServerEntry[]> {
    const states = await this.supervisor.sync(this.defs)
    return this.defs.map((def) => {
      const state = states.get(def.id)
      return { def, status: state ?? { state: 'disabled' as const } }
    })
  }

  /** Normalize and validate one definition before it is stored or mounted. */
  private validate(def: McpServerDef): McpServerDef {
    const id = def.id === '' ? randomUUID() : def.id
    const serverName = def.serverName.trim()
    if (!SERVER_NAME_PATTERN.test(serverName)) {
      throw new RemoteError('mcpManager/invalid', 'server name must match [A-Za-z0-9_-] and be 1-32 characters', { field: 'serverName' })
    }
    const duplicate = this.defs.some(
      existing => existing.serverName === serverName && existing.id !== id,
    )
    if (duplicate) {
      throw new RemoteError(
        'mcpManager/duplicate-name',
        `server name '${serverName}' is already used by another managed server`,
        { serverName },
      )
    }
    const normalized: McpServerDef = { ...def, id, serverName }
    if (normalized.transport === 'stdio') {
      if (normalized.command === undefined || normalized.command.trim() === '') {
        throw new RemoteError('mcpManager/invalid', 'stdio servers need a command', { field: 'command' })
      }
      normalized.url = undefined
      normalized.headers = undefined
    } else {
      if (normalized.url === undefined || !/^https?:\/\//.test(normalized.url)) {
        throw new RemoteError('mcpManager/invalid', 'streamable-http servers need an http(s) URL', { field: 'url' })
      }
      normalized.command = undefined
      normalized.args = undefined
      normalized.env = undefined
      normalized.cwd = undefined
    }
    const timeout = normalized.toolCallTimeoutMs
    if (timeout !== undefined && (!Number.isSafeInteger(timeout) || timeout < 1)) {
      throw new RemoteError(
        'mcpManager/invalid',
        'tool call timeout must be a positive whole number of milliseconds',
        { field: 'toolCallTimeoutMs' },
      )
    }
    return normalized
  }
}

function throwClosed(): KvTable<string, McpServerDef> {
  throw new RemoteError('mcpManager/closed', 'the mcp_servers storage domain is not open', {})
}
