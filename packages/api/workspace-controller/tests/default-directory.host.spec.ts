import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { defaultWorkspaceDirectory, validateDocumentsDirectory } from '../src/default-directory.ts'

describe('system Documents directory', () => {
  it.each([
    ['darwin', '/Users/a/文档/\n', '/Users/a/文档/deepseek-harness/default-workspace', 'osascript'],
    ['win32', 'D:\\Redirected Documents\r\n', 'D:\\Redirected Documents\\deepseek-harness\\default-workspace', 'powershell.exe'],
    ['linux', '/home/a/My Documents\n', '/home/a/My Documents/deepseek-harness/default-workspace', 'xdg-user-dir'],
  ] as const)('uses the %s account directory and preserves spaces and Unicode', async (platform, stdout, path, command) => {
    const run = vi.fn<NativeCommandRunner>(async () => ({ stdout, stderr: '' }))
    const signal = new AbortController().signal
    await expect(defaultWorkspaceDirectory(undefined, signal, { platform, run })).resolves.toBe(path)
    expect(run).toHaveBeenCalledWith(command, expect.any(Array), signal, 'hidden')
  })

  it('uses the configured directory without a system lookup', async () => {
    const run = vi.fn<NativeCommandRunner>()
    await expect(defaultWorkspaceDirectory('/documents', new AbortController().signal, { platform: 'linux', run }))
      .resolves.toBe('/documents/deepseek-harness/default-workspace')
    expect(run).not.toHaveBeenCalled()
  })

  it.each(['', '\r\n', '/home/a\n'])('rejects an unavailable XDG directory %j', async (stdout) => {
    const run: NativeCommandRunner = async () => ({ stdout, stderr: '' })
    await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, { platform: 'linux', home: '/home/a', run }))
      .rejects.toThrow('unavailable')
  })

  it('propagates lookup failure and cancellation', async () => {
    const run: NativeCommandRunner = async () => { throw new Error('lookup denied') }
    await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, { platform: 'darwin', run }))
      .rejects.toThrow('lookup denied')
    await expect(defaultWorkspaceDirectory('/documents', AbortSignal.abort(), { platform: 'linux' }))
      .rejects.toThrow()
    await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, { platform: 'freebsd' }))
      .rejects.toThrow('unavailable')
  })

  it.each(['relative', 'C:relative', '\\rooted'])('rejects a Windows path without a fully qualified root: %s', (path) => {
    expect(() => validateDocumentsDirectory(path, 'win32')).toThrow('fully qualified')
  })

  it('accepts redirected UNC Documents directories', () => {
    expect(validateDocumentsDirectory('\\\\server\\share\\Documents', 'win32')).toBe('\\\\server\\share\\Documents')
    expect(() => validateDocumentsDirectory('relative', 'linux')).toThrow('fully qualified')
  })

  // fork(picker-fallback): hosts without the xdg-user-dirs binary still get a
  // usable first-use default; every other failure keeps propagating.
  describe('linux fallback without xdg-user-dir', () => {
    const missing = (): NativeCommandRunner => async () => {
      throw Object.assign(new Error('spawn xdg-user-dir ENOENT'), { code: 'ENOENT' })
    }

    it('falls back to ~/Documents when it exists', async () => {
      const run = missing()
      await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, {
        platform: 'linux', home: '/home/a', run, documentsExists: candidate => candidate === '/home/a/Documents',
      })).resolves.toBe('/home/a/Documents/deepseek-harness/default-workspace')
    })

    it('falls back to the home directory when ~/Documents does not exist', async () => {
      const run = missing()
      await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, {
        platform: 'linux', home: '/home/a', run, documentsExists: () => false,
      })).resolves.toBe('/home/a/deepseek-harness/default-workspace')
    })

    it('probes the real filesystem for ~/Documents by default', async () => {
      const root = mkdtempSync(join(tmpdir(), 'dsh-docs-fallback-'))
      try {
        mkdirSync(join(root, 'Documents'))
        await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, {
          platform: 'linux', home: root, run: missing(),
        })).resolves.toBe(`${join(root, 'Documents')}/deepseek-harness/default-workspace`)

        rmSync(join(root, 'Documents'), { recursive: true })
        await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, {
          platform: 'linux', home: root, run: missing(),
        })).resolves.toBe(`${join(root, 'deepseek-harness')}/default-workspace`)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('keeps propagating failures that are not a missing binary', async () => {
      const denied: NativeCommandRunner = async () => {
        throw Object.assign(new Error('lookup denied'), { code: 'EACCES' })
      }
      await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, {
        platform: 'linux', home: '/home/a', run: denied,
      })).rejects.toThrow('lookup denied')
      await expect(defaultWorkspaceDirectory(undefined, new AbortController().signal, {
        platform: 'darwin', run: missing(),
      })).rejects.toThrow('ENOENT')
    })
  })
})
