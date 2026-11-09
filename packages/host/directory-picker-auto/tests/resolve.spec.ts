import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { runNativeCommand } from '@deepseek-ai/dsh-native-command'
import { canExecute, hasLinuxChooserBinary, hasUsableLinuxChooser, type ChooserVersionRunner } from '../src/probe.ts'
import { resolveDirectoryPickerBackend } from '../src/resolve.ts'
import type { DirectoryPickerHostFacts } from '../src/resolve.ts'

/** Baseline facts that resolve to `native`; each case overrides one signal (darwin never consults `linuxChooser`). */
const attended: DirectoryPickerHostFacts = {
  bindHost: '127.0.0.1',
  allowsRemoteAuthorities: false,
  platform: 'darwin',
  ssh: false,
  env: {},
  linuxChooser: false,
}

describe('resolveDirectoryPickerBackend', () => {
  it('resolves native for a loopback bind on a display platform', () => {
    expect(resolveDirectoryPickerBackend(attended)).toBe('native')
    expect(resolveDirectoryPickerBackend({ ...attended, platform: 'win32' })).toBe('native')
    expect(resolveDirectoryPickerBackend({ ...attended, bindHost: '::1' })).toBe('native')
  })

  it('resolves browse for a non-loopback bind regardless of other signals', () => {
    expect(resolveDirectoryPickerBackend({ ...attended, bindHost: '10.1.2.3' })).toBe('browse')
    expect(resolveDirectoryPickerBackend({ ...attended, bindHost: 'fd00::1' })).toBe('browse')
  })


  it('resolves browse when the trust policy admits a remote authority, even on an attended loopback host', () => {
    expect(resolveDirectoryPickerBackend({ ...attended, allowsRemoteAuthorities: true })).toBe('browse')
  })

  it('resolves browse under an SSH launch', () => {
    expect(resolveDirectoryPickerBackend({ ...attended, ssh: true })).toBe('browse')
  })

  it('requires a display session and a chooser binary on linux', () => {
    const linux: DirectoryPickerHostFacts = { ...attended, platform: 'linux', linuxChooser: true }
    expect(resolveDirectoryPickerBackend(linux)).toBe('browse')
    expect(resolveDirectoryPickerBackend({ ...linux, env: { DISPLAY: ':0' } })).toBe('native')
    expect(resolveDirectoryPickerBackend({ ...linux, env: { WAYLAND_DISPLAY: 'wayland-1' } })).toBe('native')
    expect(resolveDirectoryPickerBackend({ ...linux, env: { DISPLAY: ':0' }, linuxChooser: false })).toBe('browse')
  })

  it('resolves browse on platforms the native backend cannot serve, display or not', () => {
    expect(resolveDirectoryPickerBackend({ ...attended, platform: 'freebsd', env: { DISPLAY: ':0' }, linuxChooser: true })).toBe('browse')
    expect(resolveDirectoryPickerBackend({ ...attended, platform: 'openbsd', env: { WAYLAND_DISPLAY: 'wayland-1' } })).toBe('browse')
  })

  it('treats blank env exports as unset', () => {
    expect(resolveDirectoryPickerBackend({
      ...attended, platform: 'linux', linuxChooser: true, env: { DISPLAY: '', WAYLAND_DISPLAY: '' },
    })).toBe('browse')
  })
})

let probeRoot: string | undefined

afterEach(() => {
  if (probeRoot !== undefined) rmSync(probeRoot, { recursive: true, force: true })
  probeRoot = undefined
})

describe('hasLinuxChooserBinary', () => {
  it('finds a chooser binary in any PATH segment, skipping empty segments', () => {
    const seen: string[] = []
    const path = ['', '/opt/none', '/usr/local/bin'].join(delimiter)
    const found = hasLinuxChooserBinary(path, (candidate) => {
      seen.push(candidate)
      return candidate === join('/usr/local/bin', 'kdialog')
    })
    expect(found).toBe(true)
    expect(seen).toEqual([
      join('/opt/none', 'zenity'), join('/opt/none', 'kdialog'),
      join('/usr/local/bin', 'zenity'), join('/usr/local/bin', 'kdialog'),
    ])
  })

  it('reports absence when no segment holds a chooser binary', () => {
    expect(hasLinuxChooserBinary(['/a', '/b'].join(delimiter), () => false)).toBe(false)
    expect(hasLinuxChooserBinary('', () => true)).toBe(false)
    expect(hasLinuxChooserBinary(undefined, () => true)).toBe(false)
  })
})

describe('canExecute', () => {
  it('accepts an executable file and rejects an absent one', () => {
    probeRoot = mkdtempSync(join(tmpdir(), 'dsh-picker-probe-'))
    const binary = join(probeRoot, 'zenity')
    writeFileSync(binary, '#!/bin/sh\n')
    chmodSync(binary, 0o755)
    expect(canExecute(binary)).toBe(true)
    expect(canExecute(join(probeRoot, 'kdialog'))).toBe(false)
  })
})

// fork(picker-probe): the boot fact runs the chooser, not just its presence.
describe('hasUsableLinuxChooser', () => {
  const passingRunner = (): Mock<ChooserVersionRunner> =>
    vi.fn(async () => ({ stdout: 'zenity 4.2\n', stderr: '' }))

  it('accepts a chooser whose version check exits cleanly, probing the exact picker resolution', async () => {
    const run = passingRunner()
    await expect(hasUsableLinuxChooser('/usr/bin', () => true, run)).resolves.toBe(true)
    expect(run.mock.calls[0]).toEqual([join('/usr/bin', 'zenity'), ['--version'], expect.any(AbortSignal), 'hidden'])
  })

  it('falls through a broken first tier to a usable second', async () => {
    const run = vi.fn<ChooserVersionRunner>()
      .mockRejectedValueOnce(Object.assign(new Error('command failed'), { stderr: 'zenity: symbol lookup error' }))
      .mockResolvedValueOnce({ stdout: 'kdialog 1.0\n', stderr: '' })
    await expect(hasUsableLinuxChooser('/usr/bin', () => true, run)).resolves.toBe(true)
    expect(run.mock.calls.map(call => call[0]))
      .toEqual([join('/usr/bin', 'zenity'), join('/usr/bin', 'kdialog')])
  })

  it('rejects a host whose every tier cannot start', async () => {
    const broken = vi.fn<ChooserVersionRunner>(async () => { throw new Error('cannot start') })
    await expect(hasUsableLinuxChooser('/usr/bin', () => true, broken)).resolves.toBe(false)
  })

  it('spawns at most one candidate per name and probes nothing without a PATH', async () => {
    const run = passingRunner()
    const path = ['/a', '/b'].join(delimiter)
    await expect(hasUsableLinuxChooser(path, candidate => candidate === join('/b', 'zenity'), run)).resolves.toBe(true)
    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0]![0]).toBe(join('/b', 'zenity'))
    await expect(hasUsableLinuxChooser(undefined, () => true, run)).resolves.toBe(false)
    expect(run).toHaveBeenCalledOnce()
  })

  it('runs the real candidate and requires a clean exit', async () => {
    probeRoot = mkdtempSync(join(tmpdir(), 'dsh-picker-probe-'))
    const good = join(probeRoot, 'zenity')
    writeFileSync(good, '#!/bin/sh\nexit 0\n')
    chmodSync(good, 0o755)
    expect(await hasUsableLinuxChooser(probeRoot, () => true, runNativeCommand)).toBe(true)

    writeFileSync(good, '#!/bin/sh\nexit 1\n')
    expect(await hasUsableLinuxChooser(probeRoot, () => true, runNativeCommand)).toBe(false)
  })
})
