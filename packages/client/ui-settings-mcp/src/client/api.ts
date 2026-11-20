/** The promise-style API the MCP servers page consumes, over the mcpManager remote. */

import type { McpServerDef, McpServerEntry, McpServerState } from '@deepseek-ai/dsh-mcp-manager'

export type { McpServerDef, McpServerEntry, McpServerState }

/** Failure surfaced by the adapter: message plus the stable mcpManager/<code>. */
export interface McpApiError extends Error {
  code?: string | undefined
}

/** One list response body. */
export interface McpListValue {
  servers: McpServerEntry[]
}

/** Promise-style surface over the mounted `remote.mcpManager` namespace. */
export interface McpManagerApi {
  list(): Promise<McpListValue>
  upsert(def: McpServerDef): Promise<McpListValue>
  remove(id: string): Promise<McpListValue>
  restart(id: string): Promise<McpListValue>
}

type RawNamespace = Record<string, (args?: unknown) => Promise<{ ok: boolean; value?: unknown; error?: { message: string; code: string } }>>

/** Argument-bearing call shape. */
type CallArgs = Record<string, unknown>

/**
 * Adapt the mounted namespace to the page's API. Mounted methods sit behind
 * their wire export names (kebab-case) and answer RemoteResult envelopes;
 * the wrapper translates both and attaches the stable code to thrown errors.
 * @param namespace - the mounted `remote.mcpManager` namespace service.
 * @returns the promise-style API the section consumes.
 */
export function mcpManagerApi(namespace: unknown): McpManagerApi {
  const raw = namespace as RawNamespace
  const call = async <T>(name: string, args?: CallArgs): Promise<T> => {
    const invoke = raw[name]
    if (invoke === undefined) throw new Error(`mcpManager/${name} is not mounted`)
    // Zero-parameter wire methods must be invoked with zero arguments; the
    // mounted client enforces the descriptor's arity exactly.
    const result = args === undefined ? await invoke() : await invoke(args)
    if (!result.ok) {
      const failure = new Error(result.error?.message ?? 'mcpManager call failed') as McpApiError
      failure.code = result.error?.code
      throw failure
    }
    return result.value as T
  }
  return {
    list: () => call('list'),
    upsert: def => call('upsert', { def }),
    remove: id => call('delete-server', { id }),
    restart: id => call('restart-server', { id }),
  }
}
