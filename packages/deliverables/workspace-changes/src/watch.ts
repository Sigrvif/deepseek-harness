/**
 * fork(workspace-changes): watches the working directory during one turn so
 * mutations the git snapshots cannot see — writes to ignored paths, and any
 * write in a working directory outside a repository — still reach the turn's
 * summary. The watcher records which paths were written between its start and
 * its stop; it learns nothing about content or earlier copies, so its paths
 * are listed without counts or comparison. Dependency and build directories
 * are never scanned (2.4.29).
 */
import { basename, sep } from 'node:path'
import { stat } from 'node:fs/promises'
import { watch } from 'chokidar'
import { canonicalPath } from './paths.ts'

/** Directory names, matched at any depth, whose writes a watcher never reports. */
export const WATCH_NOISE_DIRECTORIES = [
  '.git', 'node_modules', '__pycache__', '.venv', 'venv', '.tox', 'target', 'dist', 'build', 'out',
  '.next', '.cache', '.mypy_cache', '.pytest_cache', '.ruff_cache',
] as const

/** Facts one turn's watcher needs. */
export interface WatcherEnvironment {
  /** Directory names, at any depth, whose subtrees the watcher never scans. */
  readonly exclusions: readonly string[]
  /** Absolute directories inside the watched root the watcher skips. */
  readonly excludedPaths: readonly string[]
}

/** The first event a watcher saw for one path, as chokidar reports it. */
export type WrittenKind = 'add' | 'change' | 'unlink'

/** The canonical paths written under one directory while the watcher ran, with each path's first event. */
export class TurnWatcher {
  private readonly written = new Map<string, WrittenKind>()
  private watcher: ReturnType<typeof watch> | undefined

  private constructor() {}

  /**
   * Start watching `root` recursively for file writes, creations, and deletions.
   * @param root - absolute directory; canonical spellings are the caller's concern.
   * @param env - exclusion facts.
   * @returns the watcher, or undefined when the root cannot be watched, as for a missing directory.
   */
  static async start(root: string, env: WatcherEnvironment): Promise<TurnWatcher | undefined> {
    try {
      if (!(await stat(root)).isDirectory()) return undefined
    } catch {
      return undefined
    }
    const instance = new TurnWatcher()
    const ignored = (entry: string): boolean => {
      if (env.excludedPaths.some(path => entry === path || entry.startsWith(`${path}${sep}`))) return true
      return env.exclusions.includes(basename(entry))
    }
    const watcher = watch(root, { ignoreInitial: true, followSymlinks: false, ignored })
    instance.watcher = watcher
    const ready = new Promise<boolean>((resolve) => {
      watcher.once('ready', () => { resolve(true) })
      watcher.once('error', () => { resolve(false) })
    })
    if (!(await ready)) {
      instance.watcher = undefined
      await watcher.close().catch(() => undefined)
      return undefined
    }
    // Later errors, as for a subtree that lost its permissions, end nothing.
    watcher.on('error', () => undefined)
    watcher.on('all', (event, entry) => {
      if ((event === 'add' || event === 'change' || event === 'unlink') && !instance.written.has(entry)) {
        instance.written.set(entry, event)
      }
    })
    return instance
  }

  /**
   * Stop watching and return every written path in its canonical spelling with
   * the first event each path produced. A path whose first event was `add` was
   * created during the turn; one first seen as `change` or `unlink` existed
   * when the turn began.
   * @returns canonical absolute paths, one entry per written path.
   */
  async stop(): Promise<ReadonlyMap<string, WrittenKind>> {
    const watcher = this.watcher
    this.watcher = undefined
    // A write whose tool result settled the turn may still be in flight in the
    // notification backend; a brief grace keeps its path in the record.
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    if (watcher !== undefined) await watcher.close().catch(() => undefined)
    const entries = await Promise.all([...this.written].map(async ([path, kind]) => [await canonicalPath(path), kind] as const))
    return new Map(entries)
  }

  /** Stop watching and forget the collected paths. */
  async dispose(): Promise<void> {
    const watcher = this.watcher
    this.watcher = undefined
    this.written.clear()
    if (watcher !== undefined) await watcher.close().catch(() => undefined)
  }
}
