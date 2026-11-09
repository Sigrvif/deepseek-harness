/**
 * PATH probe for the native backend's Linux chooser binaries: one boot-time
 * sampled fact for the resolver, so an attended Linux host without a working
 * zenity/kdialog keeps the `browse` interaction instead of a backend whose
 * every pick fails. Usability means the chooser STARTS (its `--version`
 * exits cleanly), not merely that a binary exists — fork(picker-probe).
 * @module @deepseek-ai/dsh-host-directory-picker-auto/probe
 */

import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

/** The chooser binaries the native backend can drive on Linux (zenity, KDialog fallback). */
const LINUX_CHOOSER_BINARIES = ['zenity', 'kdialog'] as const

/**
 * Whether the current process may execute the candidate path.
 * @param candidate - absolute or PATH-joined file path.
 * @returns true only for an existing executable file.
 */
export function canExecute(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK)
  } catch {
    // Absent or non-executable candidate — the only signals accessSync(X_OK) emits.
    return false
  }
  return true
}

// fork(picker-probe): executability alone mounts the native backend for a
// chooser that is installed but cannot start (a GTK/libadwaita version
// mismatch kills zenity with a symbol lookup error before any dialog), and
// every pick then fails all session. The boot probe now RUNS the chooser.
/** The runner contract for the version check; satisfied by `runNativeCommand`. */
export type ChooserVersionRunner = (
  command: string,
  args: readonly string[],
  signal: AbortSignal,
  window: 'hidden' | 'visible',
) => Promise<{ stdout: string; stderr: string }>

/** Wall-clock budget for one chooser's version check. */
export const CHOOSER_PROBE_TIMEOUT_MS = 3_000

/**
 * Whether at least one Linux chooser the native backend would actually run
 * starts successfully. Each tier is resolved the way the picker resolves it —
 * the first PATH directory holding an executable binary of the name — and
 * counts only when `<chooser> --version` exits cleanly; a candidate that
 * cannot start falls through to the next tier exactly like a pick would.
 * @param pathValue - the `PATH` environment value (absent or empty probes nothing).
 * @param isExecutable - executability predicate ({@link canExecute} in production; injected for deterministic tests).
 * @param run - version-check runner (`runNativeCommand` in production; injected for deterministic tests).
 * @returns true when the native backend's chooser tier can serve a pick.
 */
export async function hasUsableLinuxChooser(
  pathValue: string | undefined,
  isExecutable: (candidate: string) => boolean,
  run: ChooserVersionRunner,
): Promise<boolean> {
  const resolveTier = (name: string): string | undefined => {
    for (const dir of (pathValue ?? '').split(delimiter)) {
      if (dir === '') continue
      const candidate = join(dir, name)
      if (isExecutable(candidate)) return candidate
    }
    return undefined
  }
  for (const name of LINUX_CHOOSER_BINARIES) {
    const candidate = resolveTier(name)
    if (candidate === undefined) continue
    try {
      await run(candidate, ['--version'], AbortSignal.timeout(CHOOSER_PROBE_TIMEOUT_MS), 'hidden')
      return true
    } catch {
      // Broken candidate (missing libraries, crash, hang past the timeout):
      // keep scanning the remaining tiers, mirroring the picker's fallthrough.
    }
  }
  return false
}

/**
 * Scan a PATH value for one of the native backend's Linux chooser binaries.
 * @param pathValue - the `PATH` environment value (absent or empty scans nothing).
 * @param isExecutable - executability predicate ({@link canExecute} in production; injected for deterministic tests).
 * @returns whether any PATH directory holds an executable chooser binary.
 */
export function hasLinuxChooserBinary(pathValue: string | undefined, isExecutable: (candidate: string) => boolean): boolean {
  for (const dir of (pathValue ?? '').split(delimiter)) {
    if (dir === '') continue
    for (const name of LINUX_CHOOSER_BINARIES) {
      if (isExecutable(join(dir, name))) return true
    }
  }
  return false
}
