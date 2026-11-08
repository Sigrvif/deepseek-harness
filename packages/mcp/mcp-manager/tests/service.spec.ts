/** The mcpManager service: persistence through a fake table, validation, and mounting. */
import { Context } from '@deepseek-ai/cordis'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { afterEach, describe, expect, it } from 'vitest'
import { mcpServersDomain } from '../src/domain.ts'
import { McpManagerService } from '../src/service.ts'
import type { MountClient, MountedClient } from '../src/supervisor.ts'
import type { McpServerDef } from '../src/types.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

/** In-memory KvTable standing in for the storage domain. */
function fakeTable() {
  const records = new Map<string, McpServerDef>()
  return {
    get: (key: string) => records.get(key),
    entries: () => records.entries(),
    keys: () => records.keys(),
    get size() { return records.size },
    put: async (key: string, value: McpServerDef) => { records.set(key, value) },
    delete: async (key: string) => records.delete(key),
    records,
  }
}

interface MountFake {
  mount: MountClient
  /** Every config the mount accepted, in order. */
  configs: McpClientConfig[]
  /** How many returned clients were disposed. */
  disposed: number
}

/** Recording mount fake; names in failNames reject like a failed spawn. */
function fakeMount(failNames: string[] = []): MountFake {
  const fake: MountFake = { mount: async () => ({ dispose: async () => undefined }), configs: [], disposed: 0 }
  fake.mount = async (config: McpClientConfig): Promise<MountedClient> => {
    if (failNames.includes(config.serverName)) throw new Error(`spawn ${config.serverName}: ENOENT`)
    fake.configs.push(config)
    return { dispose: async () => { fake.disposed += 1 } }
  }
  return fake
}

async function mounted(fake: MountFake) {
  const ctx = new Context()
  contexts.push(ctx)
  const table = fakeTable()
  const domain = { table: () => table } as unknown as Domain<typeof mcpServersDomain>
  const service = new McpManagerService(ctx, domain, fake.mount)
  await service.ready
  return { ctx, table, service }
}

function stdioDef(overrides: Partial<McpServerDef> = {}): McpServerDef {
  return { id: '', serverName: 'alpha', enabled: true, transport: 'stdio', command: 'node', args: ['server.js'], ...overrides }
}

describe('McpManagerService', () => {
  it('upsert assigns ids, persists, mounts, and reports running', async () => {
    const fake = fakeMount()
    const { table, service } = await mounted(fake)
    const upserted = await service.upsert({ def: stdioDef() })
    expect(upserted.servers).toHaveLength(1)
    const { def, status } = upserted.servers[0]!
    expect(def.id).not.toBe('')
    expect(status.state).toBe('running')
    expect(table.records.get(def.id)?.serverName).toBe('alpha')
    expect(fake.configs[0]).toMatchObject({ transport: 'stdio', serverName: 'alpha', command: 'node', failOnStartupError: true })
    const listed = await service.list()
    expect(listed.servers[0]!.def.id).toBe(def.id)
  })

  it('remove disposes the fiber and deletes the record', async () => {
    const fake = fakeMount()
    const { table, service } = await mounted(fake)
    const { servers } = await service.upsert({ def: stdioDef() })
    const afterRemove = await service.remove({ id: servers[0]!.def.id })
    expect(afterRemove.servers).toHaveLength(0)
    expect(table.records.size).toBe(0)
    expect(fake.disposed).toBe(1)
  })

  it('disabling mounts nothing; enabling again mounts', async () => {
    const fake = fakeMount()
    const { service } = await mounted(fake)
    const { servers } = await service.upsert({ def: stdioDef({ enabled: false }) })
    expect(servers[0]!.status.state).toBe('disabled')
    expect(fake.configs).toHaveLength(0)
    const enabled = await service.upsert({ def: { ...servers[0]!.def, enabled: true } })
    expect(enabled.servers[0]!.status.state).toBe('running')
    expect(fake.configs).toHaveLength(1)
  })

  it('reports a failed spawn as the server status, not an error', async () => {
    const { service } = await mounted(fakeMount(['alpha']))
    const { servers } = await service.upsert({ def: stdioDef() })
    expect(servers[0]!.status.state).toBe('failed')
    expect(servers[0]!.status.lastError).toContain('ENOENT')
  })

  it('rejects invalid names, duplicate names, and missing transport fields', async () => {
    const { service } = await mounted(fakeMount())
    const first = await service.upsert({ def: stdioDef() })
    const id = first.servers[0]!.def.id
    await expect(service.upsert({ def: stdioDef({ serverName: 'not valid!' }) })).rejects.toMatchObject({ code: 'mcpManager/invalid' })
    await expect(service.upsert({ def: stdioDef({ serverName: 'alpha' }) })).rejects.toMatchObject({ code: 'mcpManager/duplicate-name' })
    await expect(service.upsert({ def: stdioDef({ id: 'x2', serverName: 'gamma', command: ' ' }) })).rejects.toMatchObject({ code: 'mcpManager/invalid' })
    await expect(service.upsert({ def: stdioDef({ id: 'x3', serverName: 'delta', transport: 'streamable-http', url: 'ftp://nope' }) })).rejects.toMatchObject({ code: 'mcpManager/invalid' })
    expect((await service.list()).servers).toHaveLength(1)
    void id
  })

  it('normalizes transport-irrelevant fields away', async () => {
    const { service } = await mounted(fakeMount())
    const upserted = await service.upsert({ def: stdioDef({ transport: 'streamable-http', url: 'http://127.0.0.1:3000/mcp', command: 'leftover' }) })
    const def = upserted.servers[0]!.def
    expect(def.command).toBeUndefined()
    expect(def.url).toBe('http://127.0.0.1:3000/mcp')
  })

  it('restarts known ids and rejects unknown ones', async () => {
    const fake = fakeMount()
    const { service } = await mounted(fake)
    const { servers } = await service.upsert({ def: stdioDef() })
    const restarted = await service.restart({ id: servers[0]!.def.id })
    expect(restarted.servers[0]!.status.state).toBe('running')
    expect(fake.configs).toHaveLength(2)
    await expect(service.restart({ id: 'missing' })).rejects.toMatchObject({ code: 'mcpManager/unknown-id' })
  })
})
