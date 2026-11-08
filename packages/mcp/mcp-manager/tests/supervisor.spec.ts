/** The diffing mount supervisor: add/change/disable/remove/restart semantics. */
import { describe, expect, it } from 'vitest'
import { McpSupervisor } from '../src/supervisor.ts'
import type { MountedClient } from '../src/supervisor.ts'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import type { McpServerDef } from '../src/types.ts'

function def(overrides: Partial<McpServerDef> = {}): McpServerDef {
  return {
    id: 'a',
    serverName: 'alpha',
    enabled: true,
    transport: 'stdio',
    command: '/bin/true',
    ...overrides,
  }
}

interface FakeMount extends MountedClient {
  config: McpClientConfig
  disposed: boolean
}

/** Deterministic mount fake with optional failure by serverName. */
function harness(failNames: string[] = []) {
  const mounts: FakeMount[] = []
  const mount = async (config: McpClientConfig): Promise<MountedClient> => {
    if (failNames.includes(config.serverName)) throw new Error(`spawn ${config.serverName}: ENOENT`)
    const fake: FakeMount = { config, disposed: false, dispose: async () => { fake.disposed = true } }
    mounts.push(fake)
    return fake
  }
  return { mounts, supervisor: new McpSupervisor(mount) }
}

function stateOf(outcome: Awaited<ReturnType<McpSupervisor['sync']>>, id: string): string {
  return outcome.get(id)?.state ?? 'absent'
}

describe('McpSupervisor', () => {
  it('mounts enabled definitions and reports them running', async () => {
    const { supervisor } = harness()
    const outcome = await supervisor.sync([def()])
    expect(stateOf(outcome, 'a')).toBe('running')
  })

  it('holds no fiber and reports disabled for disabled definitions', async () => {
    const { supervisor, mounts } = harness()
    await supervisor.sync([def()])
    expect(mounts).toHaveLength(1)
    const outcome = await supervisor.sync([def({ enabled: false })])
    expect(stateOf(outcome, 'a')).toBe('disabled')
    expect(mounts[0]!.disposed).toBe(true)
    expect(mounts).toHaveLength(1)
  })

  it('disposes on removal and re-mounts if the definition returns', async () => {
    const { supervisor, mounts } = harness()
    await supervisor.sync([def()])
    await supervisor.sync([])
    expect(mounts[0]!.disposed).toBe(true)
    await supervisor.sync([def()])
    expect(mounts).toHaveLength(2)
    expect(stateOf(await supervisor.sync([def()]), 'a')).toBe('running')
  })

  it('restarts a changed definition and keeps an unchanged one mounted', async () => {
    const { supervisor, mounts } = harness()
    const other = def({ id: 'b', serverName: 'beta' })
    await supervisor.sync([def(), other])
    await supervisor.sync([def({ command: '/bin/false' }), other])
    expect(mounts).toHaveLength(3)
    expect(mounts[0]!.disposed).toBe(true)
    expect(mounts[1]!.disposed).toBe(false)
    expect((mounts[2]!.config as { command?: string }).command).toBe('/bin/false')
  })

  it('does not restart when only non-mount fields changed', async () => {
    const { supervisor, mounts } = harness()
    await supervisor.sync([def()])
    await supervisor.sync([def()])
    expect(mounts).toHaveLength(1)
    expect(mounts[0]!.disposed).toBe(false)
  })

  it('contains failures per server and never rejects sync', async () => {
    const { supervisor, mounts } = harness(['alpha'])
    const outcome = await supervisor.sync([def(), def({ id: 'b', serverName: 'beta' })])
    expect(stateOf(outcome, 'a')).toBe('failed')
    expect(outcome.get('a')?.lastError).toContain('ENOENT')
    expect(stateOf(outcome, 'b')).toBe('running')
    expect(mounts).toHaveLength(1)
  })

  it('restart() forces a remount even when the fingerprint is unchanged', async () => {
    const { supervisor, mounts } = harness()
    await supervisor.sync([def()])
    await supervisor.restart(def())
    expect(mounts).toHaveLength(2)
    expect(mounts[0]!.disposed).toBe(true)
  })

  it('disposes everything it mounted through disposeAll', async () => {
    const { supervisor, mounts } = harness()
    await supervisor.sync([def(), def({ id: 'b', serverName: 'beta' })])
    supervisor.disposeAll()
    expect(mounts.every(m => m.disposed)).toBe(true)
  })
})
