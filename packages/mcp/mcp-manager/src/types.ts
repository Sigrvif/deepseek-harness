/** Types of the `mcp_servers` storage domain: user-managed MCP server definitions. */

import { z } from 'zod'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'

/** Same shape mcp-client reserves; validated here so UI input fails early. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/**
 * One managed MCP server. The mount-relevant fields mirror mcp-client's
 * `StdioConfig`/`StreamableHttpConfig` unions; `id` is the storage key and
 * `enabled` gates whether a fiber is mounted at all.
 */
export interface McpServerDef {
  /** Storage key; a fresh server gets a random id from the service. */
  id: string
  /** Model-facing tool namespace (`mcp__<serverName>__<tool>`); unique across all live servers. */
  serverName: string
  /** Disabled servers keep their definition but mount nothing. */
  enabled: boolean
  /** Discriminates the transport-specific fields. */
  transport: 'stdio' | 'streamable-http'
  /** stdio: executable to spawn. */
  command?: string | undefined
  /** stdio: arguments passed verbatim (no shell interpolation). */
  args?: string[] | undefined
  /** stdio: extra env merged over the scrubbed ambient environment. */
  env?: Record<string, string> | undefined
  /** stdio: working directory for the child process. */
  cwd?: string | undefined
  /** streamable-http: MCP endpoint URL. */
  url?: string | undefined
  /** streamable-http: extra request headers. */
  headers?: Record<string, string> | undefined
  /** Timeout per tool call in milliseconds; omitted uses mcp-client's default. */
  toolCallTimeoutMs?: number | undefined
}

/** Live mount state of one managed server. */
export type McpServerState = 'running' | 'failed' | 'disabled'

/** Status of one managed server, as the settings page shows it. */
export interface McpServerStatus {
  state: McpServerState
  /** Human-readable failure reason; present only in the `failed` state. */
  lastError?: string
}

/** Definition plus live status — one row of the settings page. */
export interface McpServerEntry {
  def: McpServerDef
  status: McpServerStatus
}

/** Stored-definition schema for the `servers` table (zod: the storage-domain contract). */
export const mcpServerDefSchema = z.object({
  id: z.string(),
  serverName: z.string().regex(SERVER_NAME_PATTERN),
  enabled: z.boolean(),
  transport: z.union([z.literal('stdio'), z.literal('streamable-http')]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  toolCallTimeoutMs: z.number().int().min(1).optional(),
}) satisfies z.ZodType<McpServerDef>

/**
 * Translate a stored definition into an mcp-client config.
 * @param def - the stored definition.
 * @returns the transport-union config mcp-client's schema resolves.
 */
export function toClientConfig(def: McpServerDef): McpClientConfig {
  const base = {
    serverName: def.serverName,
    failOnStartupError: true,
    toolCallTimeoutMs: def.toolCallTimeoutMs ?? DEFAULT_TOOL_CALL_TIMEOUT_MS,
  } as const
  if (def.transport === 'stdio') {
    return {
      ...base,
      transport: 'stdio',
      command: def.command ?? '',
      args: def.args ?? [],
      env: def.env ?? {},
      cwd: def.cwd ?? '',
    }
  }
  return { ...base, transport: 'streamable-http', url: def.url ?? '', headers: def.headers ?? {} }
}

/** mcp-client's own per-call default; the constant is not exported. */
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

/**
 * Mount-relevant projection of a definition: two defs equal here mount
 * identically, so no restart is needed between them.
 * @param def - the stored definition.
 * @returns the JSON-comparable projection.
 */
export function mountFingerprint(def: McpServerDef): string {
  const client = toClientConfig(def)
  return JSON.stringify([def.enabled, client])
}

/** Upsert wire argument: a definition whose `id` selects insert-or-replace. */
export interface McpUpsertRequest {
  def: McpServerDef
}

/** Remove/restart wire argument. */
export interface McpIdRequest {
  id: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The upserted definition failed validation; `field` names the first problem when known. */
    'mcpManager/invalid': { field?: string }
    /** Another managed server already uses the requested `serverName`. */
    'mcpManager/duplicate-name': { serverName: string }
    /** No managed server carries the requested id. */
    'mcpManager/unknown-id': { id: string }
    /** The storage domain is unavailable (closed or quarantined). */
    'mcpManager/closed': Record<string, never>
  }
}
