/** Cross-platform native single-directory chooser behind the native backend's capability.
 * Linux runs zenity, falling through to kdialog on every non-cancel failure (fork picker-fallthrough). */

import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { pickWin32Directory } from './win32-dialog.ts'

/** Testable command boundary; native implementations never invoke a shell. */
export type DirectoryPickerRunner = NativeCommandRunner

/** Injectable platform facts for deterministic adapter tests. */
export interface DirectoryPickerInternals {
  platform?: NodeJS.Platform
  run?: DirectoryPickerRunner
  /** Replaces the in-process Win32 dialog (`pickWin32Directory`) for deterministic tests. */
  pickWin32Dialog?: (signal: AbortSignal) => Promise<string | null>
}

/** The prompt every native chooser shows. */
const DIALOG_TITLE = 'Select Workspace Directory'

/**
 * macOS panel source, run by the system JXA host (`osascript -l JavaScript`).
 *
 * A native panel resolves ⌘C/⌘V/⌘A/⌘X as main-menu key equivalents rather than
 * as focused-field behavior, so the script installs that menu before opening
 * `NSOpenPanel`; AppleScript's `choose folder` runs in a helper that has no
 * menu, which leaves every text field of its panel (Go to Folder, Search,
 * Tags) un-pastable. Menu items stay untargeted, so AppKit enables them
 * against the responder chain that owns the panel's field editor. The prompt
 * arrives as argv, never as executable source, and a cancel prints an empty
 * line instead of failing. A cancelled panel still reports its highlighted or
 * current directory in `URLs`, so only an OK response reads the selection.
 * Activation is queued for the modal event loop; requesting it before that
 * loop starts can leave the panel inactive.
 */
const MAC_PANEL = `
ObjC.import('AppKit');
function run(argv) {
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  var mainMenu = $.NSMenu.alloc.init;
  mainMenu.addItem($.NSMenuItem.alloc.init);
  var editMenu = $.NSMenu.alloc.initWithTitle('Edit');
  var editItem = $.NSMenuItem.alloc.init;
  editItem.submenu = editMenu;
  mainMenu.addItem(editItem);
  editMenu.addItemWithTitleActionKeyEquivalent('Undo', 'undo:', 'z');
  editMenu.addItemWithTitleActionKeyEquivalent('Redo', 'redo:', 'Z');
  editMenu.addItemWithTitleActionKeyEquivalent('Cut', 'cut:', 'x');
  editMenu.addItemWithTitleActionKeyEquivalent('Copy', 'copy:', 'c');
  editMenu.addItemWithTitleActionKeyEquivalent('Paste', 'paste:', 'v');
  editMenu.addItemWithTitleActionKeyEquivalent('Select All', 'selectAll:', 'a');
  app.mainMenu = mainMenu;
  var panel = $.NSOpenPanel.openPanel;
  panel.canChooseFiles = false;
  panel.canChooseDirectories = true;
  panel.canCreateDirectories = true;
  panel.allowsMultipleSelection = false;
  panel.message = argv[0];
  $.NSOperationQueue.mainQueue.addOperationWithBlock(function() {
    app.activateIgnoringOtherApps(true);
  });
  if (panel.runModal !== $.NSModalResponseOK) return '';
  var urls = panel.URLs;
  if (urls.count < 1) return '';
  return ObjC.unwrap(urls.objectAtIndex(0).path);
}`

function outputPath(stdout: string): string | null {
  const path = stdout.replace(/[\r\n]+$/, '')
  return path === '' ? null : path
}

function errorCode(error: unknown): string | number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}

function isMissingCommand(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

function rethrowIfAborted(signal: AbortSignal, error: unknown): void {
  if (signal.aborted) throw error
}

// fork(picker-fallthrough): a chooser that is installed but cannot start (a
// GTK/libadwaita mismatch kills zenity before any dialog) previously surfaced
// raw and dead-ended the pick even when the other tier worked. Every
// non-cancel, non-abort failure now falls through; the final failure names
// both tiers so the operator sees the real cause instead of a bare
// "Command failed" wall.

/** One tier's recorded failure: the raw error and whether the binary is absent. */
interface ChooserTierFailure {
  error: unknown
  missing: boolean
}

/** Operator-facing one-line summary of a tier failure: the child's stderr when the process ran, else the error text (capped). */
function tierSummary(error: unknown): string {
  const stderr = typeof error === 'object' && error !== null && 'stderr' in error
    ? (error as { stderr?: unknown }).stderr : undefined
  const source = typeof stderr === 'string' && stderr.trim() !== '' ? stderr : errorMessage(error)
  const line = source.split('\n').map(row => row.trim()).find(row => row !== '') ?? ''
  return line.length > 200 ? `${line.slice(0, 197)}...` : line
}

function tierLabel(name: string, tier: ChooserTierFailure): string {
  return tier.missing ? `${name}: not installed` : `${name}: ${tierSummary(tier.error)}`
}

/**
 * The Linux tiers both failed with real errors (no cancel, no missing-binary
 * exhaustion): one error naming both causes, the primary tier's failure kept
 * as the cause with its captured stdio intact.
 * @param zenity - the first tier's recorded failure.
 * @param kdialogError - the second tier's rejection.
 * @returns the combined failure to surface.
 */
function chooserFailure(zenity: ChooserTierFailure, kdialogError: unknown): Error {
  const kdialog: ChooserTierFailure = { error: kdialogError, missing: isMissingCommand(kdialogError) }
  if (zenity.missing && kdialog.missing) {
    return new Error('no supported native directory picker found (install zenity or kdialog)')
  }
  const cause = zenity.missing ? kdialog.error : zenity.error
  return new Error(`native directory chooser failed (zenity: ${tierLabel('zenity', zenity)}; ${tierLabel('kdialog', kdialog)})`, { cause })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Open the platform directory picker.
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform and runner hooks for deterministic tests.
 * @returns the selected path, or null when the user cancels.
 */
export async function pickNativeDirectory(
  signal: AbortSignal,
  internals: DirectoryPickerInternals = {},
): Promise<string | null> {
  const platform = internals.platform ?? process.platform
  const run = internals.run ?? runNativeCommand

  if (platform === 'darwin') {
    const result = await run('osascript', ['-l', 'JavaScript', '-e', MAC_PANEL, DIALOG_TITLE], signal, 'hidden')
    return outputPath(result.stdout)
  }

  if (platform === 'win32') {
    // The koffi-backed IFileOpenDialog child process — the modern picker with
    // per-monitor-v2 DPI and abort support. koffi is a packaged dependency
    // whose availability the install guarantees, so there is no fallback
    // tier: any failure surfaces as-is (no PowerShell fallback tier; see
    // .agents/notes/archived/simplification/2026-08-04-drop-windows-powershell-picker-fallback.md).
    const pickDialog = internals.pickWin32Dialog ?? pickWin32Directory
    return await pickDialog(signal)
  }

  if (platform === 'linux') {
    // fork(picker-fallthrough): only exit 1 (user cancel) maps to null; every
    // other zenity failure — missing OR broken — falls through to kdialog.
    let zenityFailure: ChooserTierFailure | undefined
    try {
      const result = await run('zenity', [
        '--file-selection', '--directory', `--title=${DIALOG_TITLE}`,
      ], signal, 'hidden')
      return outputPath(result.stdout)
    } catch (error: unknown) {
      rethrowIfAborted(signal, error)
      if (errorCode(error) === 1) return null
      zenityFailure = { error, missing: isMissingCommand(error) }
    }

    try {
      const result = await run('kdialog', [
        '--getexistingdirectory', '.', '--title', DIALOG_TITLE,
      ], signal, 'hidden')
      return outputPath(result.stdout)
    } catch (error: unknown) {
      rethrowIfAborted(signal, error)
      if (errorCode(error) === 1) return null
      if (zenityFailure === undefined) {
        // Unreachable: the first tier always records (or returned/threw) before
        // this tier runs; the guard only satisfies narrowing.
        throw error
      }
      throw chooserFailure(zenityFailure, error)
    }
  }

  throw new Error(`native directory picker is unsupported on ${platform}`)
}
