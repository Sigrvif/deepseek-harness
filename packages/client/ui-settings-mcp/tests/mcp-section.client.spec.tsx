// @vitest-environment jsdom
/** The MCP Servers settings section: card render, states, and the add/save/remove flows. */

import type { GlobalStandardProps, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { allowAllAccess } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpSection } from '../src/client/McpSection.tsx'
import type { McpManagerApi, McpListValue } from '../src/client/api.ts'
import { en } from '../src/client/locales.ts'
import type { McpServerDef, McpServerEntry } from '../src/client/api.ts'

afterEach(cleanup)

const unusedHook = (() => { throw new Error('unused by the MCP section') }) as never
const kit = {
  close: () => {},
  useSessions: unusedHook,
  useSessionStatus: unusedHook,
  usePanelInfo: (<S,>(selector: (value: { activePanelId: null }) => S) => selector({ activePanelId: null })) as GlobalStandardProps['usePanelInfo'],
  useSessionRetainInfo: () => undefined,
  useResource: (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource'],
  useWorkspaces: unusedHook,
  ...allowAllAccess,
}

// Typed as the locale runtime's binder; en covers every merged key.
const t: TranslateNS<'mcpSettings'> = (key, values) => {
  let text = en[key as keyof typeof en] as string
  for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

function def(overrides: Partial<McpServerDef> = {}): McpServerDef {
  return { id: 'srv-1', serverName: 'camofox', enabled: true, transport: 'stdio', command: 'npx', args: ['-y', 'camofox-mcp@latest'], ...overrides }
}

/** A scripted api fake over a mutable entry list. */
function fakeApi(entries: McpServerEntry[]): McpManagerApi & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    list: vi.fn(async () => {
      calls.push('list')
      return { servers: entries } satisfies McpListValue
    }),
    upsert: vi.fn(async (candidate: McpServerDef) => {
      calls.push(`upsert:${candidate.serverName}:${String(candidate.enabled)}`)
      const index = entries.findIndex(entry => entry.def.id === candidate.id)
      if (index >= 0) entries[index] = { def: candidate, status: { state: 'running' } }
      else entries.push({ def: candidate, status: { state: 'running' } })
      return { servers: [...entries] } satisfies McpListValue
    }),
    remove: vi.fn(async (id: string) => {
      calls.push(`remove:${id}`)
      return { servers: entries.filter(entry => entry.def.id !== id) } satisfies McpListValue
    }),
    restart: vi.fn(async (id: string) => {
      calls.push(`restart:${id}`)
      return { servers: [...entries] } satisfies McpListValue
    }),
  }
}

describe('McpSection', () => {
  it('renders server cards with status and actions', async () => {
    const api = fakeApi([{ def: def(), status: { state: 'running' } }])
    render(<McpSection {...kit} t={t} api={api} labels={t} />)
    await waitFor(() => expect(screen.getByText('camofox')).toBeTruthy())
    expect(screen.getByText(t('stateRunning'))).toBeTruthy()
    expect(screen.getByText('npx -y camofox-mcp@latest')).toBeTruthy()
    expect(screen.getByText(t('edit'))).toBeTruthy()
    expect(screen.getByText(t('restart'))).toBeTruthy()
    expect(screen.getByText(t('remove'))).toBeTruthy()
  })

  it('shows a failed server with its error text', async () => {
    const api = fakeApi([{ def: def(), status: { state: 'failed', lastError: 'spawn ENOENT' } }])
    render(<McpSection {...kit} t={t} api={api} labels={t} />)
    await waitFor(() => expect(screen.getByText(/spawn ENOENT/)).toBeTruthy())
  })

  it('saves a new stdio server through the form', async () => {
    const api = fakeApi([])
    render(<McpSection {...kit} t={t} api={api} labels={t} />)
    await waitFor(() => expect(screen.getByText(t('empty'))).toBeTruthy())
    fireEvent.click(screen.getByText(t('add')))
    fireEvent.change(screen.getByLabelText(/^Server name/), { target: { value: 'everything' } })
    fireEvent.change(screen.getByLabelText(/^Command/), { target: { value: 'node' } })
    fireEvent.click(screen.getByText(t('save')))
    await waitFor(() => expect(api.calls).toContain('upsert:everything:true'))
    expect(screen.queryByText(t('empty'))).toBeNull()
  })

  it('blocks the save with the invalid-name message and never calls the api', async () => {
    const api = fakeApi([])
    render(<McpSection {...kit} t={t} api={api} labels={t} />)
    await waitFor(() => expect(screen.getByText(t('empty'))).toBeTruthy())
    fireEvent.click(screen.getByText(t('add')))
    fireEvent.change(screen.getByLabelText(/^Server name/), { target: { value: 'not valid!' } })
    fireEvent.change(screen.getByLabelText(/^Command/), { target: { value: 'node' } })
    fireEvent.click(screen.getByText(t('save')))
    expect(screen.getByText(t('invalidName'))).toBeTruthy()
    expect(api.calls).toHaveLength(1) // only the initial list
  })

  it('confirms before removing a server', async () => {
    const api = fakeApi([{ def: def(), status: { state: 'running' } }])
    render(<McpSection {...kit} t={t} api={api} labels={t} />)
    await waitFor(() => expect(screen.getByText('camofox')).toBeTruthy())
    fireEvent.click(screen.getByText(t('remove')))
    fireEvent.click(screen.getByText(t('confirmDelete')))
    await waitFor(() => expect(api.calls).toContain('remove:srv-1'))
  })
})
