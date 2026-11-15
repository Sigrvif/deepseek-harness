// @vitest-environment jsdom
/** The unrestricted-mode General row: registration, toggle posture, and write flow. */

import { Context } from '@deepseek-ai/cordis'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it, vi, onTestFinished } from 'vitest'
import { UnrestrictedRow } from '../src/client/UnrestrictedRow.tsx'
import { apply, inject, NS } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const unusedHook = (() => { throw new Error('unused by the unrestricted row') }) as never
const kit = {
  useSessions: unusedHook,
  useSessionStatus: unusedHook,
  usePanelInfo,
  useSessionRetainInfo: () => undefined,
  useResource,
  useWorkspaces: unusedHook,
  ...allowAllAccess,
}

const t = (key: string) => (en as unknown as Record<string, string>)[key] ?? key

/** An in-memory ConfigForm stand-in over one section value. */
function fakeForm(initial: { enabled?: boolean } | undefined): ConfigForm<{ enabled?: boolean }> & {
  store: ReturnType<typeof createSnapshotStore<ConfigFormSnapshot<{ enabled?: boolean }>>>
} {
  const store = createSnapshotStore<ConfigFormSnapshot<{ enabled?: boolean }>>({
    status: initial === undefined ? 'loading' : 'ready',
    value: initial,
    base: initial,
    user: initial,
    revision: 1,
    writable: true,
  })
  const form: ConfigForm<{ enabled?: boolean }> = {
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
    set: async (field, value) => {
      if (field !== 'enabled' || typeof value !== 'boolean') return false
      store.update((draft) => {
        draft.value = { enabled: value }
        draft.revision = (draft.revision ?? 0) + 1
      })
      return true
    },
    unset: async () => false,
    mutate: async () => false,
  }
  return Object.assign(form, { store })
}

describe('ui-fork-unrestricted browser plugin', () => {
  it('declares the services the row needs', () => {
    expect(inject).toEqual(['slots', 'locale', 'configForms'])
  })

  it('registers a localized General row beside the core preferences', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    ctx.provide('configForms', { get: () => fakeForm({ enabled: false }) })
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()

    const entries = slots.entries('settings.general.item')
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.component).toBe(UnrestrictedRow)
    expect(entry.options).toMatchObject({ id: 'fork-unrestricted', order: 17 })
    expect(entry.locale).toBe(NS)
    // Default browser language resolves en; both dictionaries registered.
    expect(locale.bind(NS)('unrestricted.title')).toBe(en['unrestricted.title'])
    expect(zh['unrestricted.title']).not.toBe(en['unrestricted.title'])
  })

  it('unregisters with its scope', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('configForms', { get: () => fakeForm({ enabled: false }) })
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
    } as never, () => null)
    const fiber = await ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('settings.general.item')).toHaveLength(1)
    await fiber.dispose()
    expect(slots.entries('settings.general.item')).toHaveLength(0)
  })

  it('derives the row value from the namespace, defaulting off while unavailable', async () => {
    const mounted = async (initial: { enabled?: boolean } | undefined): Promise<boolean> => {
      const ctx = new Context()
      onTestFinished(async () => { await ctx.fiber.dispose() })
      await ctx.plugin(SlotRegistry).await()
      ctx.provide('locale', new LocaleRuntime(ctx))
      ctx.provide('configForms', { get: () => fakeForm(initial) })
      const slots = ctx.get('slots') as SlotRegistry
      slots.register({
        name: 'root',
        children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
      } as never, () => null)
      await ctx.plugin({ inject: [...inject], apply }).await()
      const entry = slots.entries('settings.general.item')[0]!
      const injected = (entry.inject as unknown as () => UnrestrictedRowInjectionStub)()
      return injected.hooks.unrestricted.getSnapshot()
    }
    expect(await mounted(undefined)).toBe(false)
    expect(await mounted({ enabled: false })).toBe(false)
    expect(await mounted({ enabled: true })).toBe(true)
  })
})

type UnrestrictedRowInjectionStub = {
  hooks: { unrestricted: { getSnapshot(): boolean } }
  setUnrestricted(enabled: boolean): Promise<void>
}

describe('UnrestrictedRow', () => {
  it('renders the localized copy and the accepted state', () => {
    const state = createSnapshotStore(false)
    render(<UnrestrictedRow {...kit} t={t} useUnrestricted={bindSnapshotSelector(state)} setUnrestricted={vi.fn()} />)
    expect(screen.getByText(en['unrestricted.title'])).toBeTruthy()
    expect(screen.getByText(en['unrestricted.description'])).toBeTruthy()
    expect(screen.getByRole('switch', { name: en['unrestricted.title'] }).getAttribute('aria-checked')).toBe('false')
  })

  it('writes through the form and reflects the accepted value', async () => {
    const state = createSnapshotStore(false)
    let finish!: () => void
    const setUnrestricted = vi.fn((enabled: boolean) => new Promise<void>((resolve) => {
      finish = () => { state.set(enabled); resolve() }
    }))
    render(<UnrestrictedRow {...kit} t={t} useUnrestricted={bindSnapshotSelector(state)} setUnrestricted={setUnrestricted} />)
    const toggle = screen.getByRole('switch', { name: en['unrestricted.title'] })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(setUnrestricted).toHaveBeenCalledWith(true)
    expect(toggle.hasAttribute('disabled')).toBe(true)
    finish()
    await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('true') })
    expect(toggle.hasAttribute('disabled')).toBe(false)
  })

  it('alerts when the Host refuses the write', async () => {
    const state = createSnapshotStore(false)
    const setUnrestricted = vi.fn(() => Promise.reject(new Error('not saved')))
    render(<UnrestrictedRow {...kit} t={t} useUnrestricted={bindSnapshotSelector(state)} setUnrestricted={setUnrestricted} />)
    const toggle = screen.getByRole('switch', { name: en['unrestricted.title'] })
    fireEvent.click(toggle)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(en['unrestricted.error']) })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
