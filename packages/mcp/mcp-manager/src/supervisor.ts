/**
 * Mount supervisor: keeps one mcp-client fiber per enabled stored definition,
 * diffing on every change. Failures are contained per server — one dead
 * server never blocks the others or the manager itself.
 *
 * @module
 */

import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import { mountFingerprint, toClientConfig } from './types.ts'
import type { McpServerDef, McpServerState } from './types.ts'

/** One mounted client; the real shape is a cordis Fiber. */
export interface MountedClient {
  dispose(): Promise<void>
}

/** How the supervisor starts servers; the plugin wires the real cordis mount. */
export type MountClient = (config: McpClientConfig) => Promise<MountedClient>

/** Per-server runtime record the supervisor tracks. */
interface Runtime {
  fingerprint: string
  mounted: MountedClient | undefined
  error: string | undefined
}

/** Result of one sync pass: the live state per definition id. */
export type SyncOutcome = ReadonlyMap<string, { state: McpServerState; lastError?: string }>

/**
 * Serialized diffing mount supervisor over the stored definitions.
 * All mutations funnel through {@link McpSupervisor.sync}, queued so two
 * rapid edits can never race their disposals against their mounts.
 */
export class McpSupervisor {
  private readonly mount: MountClient
  private readonly runtimes = new Map<string, Runtime>()
  private lastDefs: readonly McpServerDef[] = []
  private queue: Promise<unknown> = Promise.resolve()

  constructor(mount: MountClient) {
    this.mount = mount
  }

  /**
   * Reconcile mounted fibers against `defs`: mount the new and changed,
   * dispose the removed and disabled. One server's failure is recorded and
   * contained; sync itself never rejects.
   * @param defs - the full desired set of definitions, keyed by id.
   * @returns the live state of every definition after settling.
   */
  sync(defs: readonly McpServerDef[]): Promise<SyncOutcome> {
    this.lastDefs = defs
    const run = async (): Promise<SyncOutcome> => {
      const desired = new Map(defs.map(def => [def.id, def] as const))
      for (const [id, runtime] of this.runtimes) {
        const def = desired.get(id)
        if (def === undefined) {
          this.runtimes.delete(id)
          await this.disposeQuietly(runtime)
          continue
        }
        const fingerprint = mountFingerprint(def)
        if (!def.enabled) {
          // Disabled definitions keep their record (state shows 'disabled')
          // but must hold no fiber.
          if (runtime.mounted !== undefined) await this.disposeQuietly(runtime)
          runtime.fingerprint = fingerprint
          runtime.error = undefined
          continue
        }
        if (runtime.mounted !== undefined && runtime.fingerprint === fingerprint) continue
        if (runtime.mounted !== undefined) await this.disposeQuietly(runtime)
        this.runtimes.set(id, { fingerprint, mounted: undefined, error: undefined })
        await this.mountOne(id, def)
      }
      for (const def of defs) {
        if (this.runtimes.has(def.id)) continue
        this.runtimes.set(def.id, { fingerprint: mountFingerprint(def), mounted: undefined, error: undefined })
        if (def.enabled) await this.mountOne(def.id, def)
      }
      return this.states(defs)
    }
    const settled = this.queue.then(run, run)
    this.queue = settled.catch(() => undefined)
    return settled
  }

  /**
   * Force one server's remount regardless of its fingerprint, leaving every
   * other server untouched (the full last-desired set re-syncs).
   * @param def - the definition to restart.
   * @returns the live state of every definition after settling.
   */
  restart(def: McpServerDef): Promise<SyncOutcome> {
    const runtime = this.runtimes.get(def.id)
    if (runtime !== undefined) runtime.fingerprint = `forced:${new Date().toISOString()}`
    return this.sync(this.lastDefs)
  }

  /**
   * Dispose every mounted fiber, best-effort: a stuck child at shutdown must
   * not surface as a manager failure or hang disposal.
   */
  disposeAll(): void {
    for (const runtime of this.runtimes.values()) void this.disposeQuietly(runtime)
    this.runtimes.clear()
  }

  private async mountOne(id: string, def: McpServerDef): Promise<void> {
    // The mount resolves once the initial connection AND tool discovery
    // succeeded (failOnStartupError is set by toClientConfig); a rejection
    // means cordis rolled the fiber back and the failure is this server's.
    try {
      const mounted = await this.mount(toClientConfig(def))
      const runtime = this.runtimes.get(id)
      if (runtime === undefined) {
        // Removed while the mount was in flight; nothing should stay up.
        try {
          await mounted.dispose()
        } catch {
          // Shutdown of a wedged child is not a manager failure.
        }
        return
      }
      runtime.mounted = mounted
      runtime.error = undefined
    } catch (error) {
      const runtime = this.runtimes.get(id)
      if (runtime !== undefined) runtime.error = errorMessage(error)
    }
  }

  private states(defs: readonly McpServerDef[]): SyncOutcome {
    const states = new Map<string, { state: McpServerState; lastError?: string }>()
    for (const def of defs) {
      const runtime = this.runtimes.get(def.id)
      if (runtime === undefined) continue
      if (!def.enabled) states.set(def.id, { state: 'disabled' })
      else if (runtime.mounted !== undefined) states.set(def.id, { state: 'running' })
      else states.set(def.id, { state: 'failed', lastError: runtime.error ?? 'not mounted' })
    }
    return states
  }

  private async disposeQuietly(runtime: Runtime): Promise<void> {
    const mounted = runtime.mounted
    runtime.mounted = undefined
    if (mounted === undefined) return
    try {
      await mounted.dispose()
    } catch {
      // Shutdown of a wedged child is not a manager failure.
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    const suffix = cause instanceof Error ? `: ${cause.message}` : ''
    return `${error.message}${suffix}`
  }
  return String(error)
}
