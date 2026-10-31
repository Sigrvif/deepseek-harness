// @vitest-environment jsdom
/** The auto-superpowers General row: registration, toggle posture, and write flow. */

import { Context } from '@deepseek-ai/cordis'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it, vi, onTestFinished } from 'vitest'
import { AutoSkillsRow } from '../src/client/AutoSkillsRow.tsx'
import { apply, inject, NS } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const unusedHook = (() => { throw new Error('unused by the auto-skills row') }) as never
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
function fakeForm(initial: { autoUsingSuperpowers?: boolean } | undefined): ConfigForm<{ autoUsingSuperpowers?: boolean }> & {
  store: ReturnType<typeof createSnapshotStore<ConfigFormSnapshot<{ autoUsingSuperpowers?: boolean }>>>
} {
  const store = createSnapshotStore<ConfigFormSnapshot<{ autoUsingSuperpowers?: boolean }>>({
    status: initial === undefined ? 'loading' : 'ready',
    value: initial,
    base: initial,
    user: initial,
    revision: 1,
    writable: true,
  })
  const form: ConfigForm<{ autoUsingSuperpowers?: boolean }> = {
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
    set: async (field, value) => {
      if (field !== 'autoUsingSuperpowers' || typeof value !== 'boolean') return false
      store.update((draft) => {
        draft.value = { autoUsingSuperpowers: value }
        draft.revision = (draft.revision ?? 0) + 1
      })
      return true
    },
    unset: async () => false,
    mutate: async () => false,
  }
  return Object.assign(form, { store })
}

describe('ui-fork-auto-skills browser plugin', () => {
  it('declares the services the row needs', () => {
    expect(inject).toEqual(['slots', 'locale', 'configForms'])
  })

  it('registers a localized General row beside the core preferences', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    ctx.provide('configForms', { get: () => fakeForm({ autoUsingSuperpowers: true }) })
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()

    const entries = slots.entries('settings.general.item')
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.component).toBe(AutoSkillsRow)
    expect(entry.options).toMatchObject({ id: 'fork-auto-skills', order: 16 })
    expect(entry.locale).toBe(NS)
    // Default browser language resolves en; both dictionaries registered.
    expect(locale.bind(NS)('autoSkills.title')).toBe(en['autoSkills.title'])
    expect(zh['autoSkills.title']).not.toBe(en['autoSkills.title'])
  })

  it('unregisters with its scope', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('configForms', { get: () => fakeForm({ autoUsingSuperpowers: true }) })
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

  it('derives the row value from the namespace, defaulting on while unavailable', async () => {
    const mounted = async (initial: { autoUsingSuperpowers?: boolean } | undefined): Promise<boolean> => {
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
      const injected = (entry.inject as unknown as () => AutoSkillsRowInjectionStub)()
      return injected.hooks.autoSuperpowers.getSnapshot()
    }
    expect(await mounted(undefined)).toBe(true)
    expect(await mounted({ autoUsingSuperpowers: true })).toBe(true)
    expect(await mounted({ autoUsingSuperpowers: false })).toBe(false)
  })
})

type AutoSkillsRowInjectionStub = {
  hooks: { autoSuperpowers: { getSnapshot(): boolean } }
  setAuto(enabled: boolean): Promise<void>
}

describe('AutoSkillsRow', () => {
  it('renders the localized copy and the accepted state', () => {
    const state = createSnapshotStore(true)
    render(<AutoSkillsRow {...kit} t={t} useAutoSuperpowers={bindSnapshotSelector(state)} setAuto={vi.fn()} />)
    expect(screen.getByText(en['autoSkills.title'])).toBeTruthy()
    expect(screen.getByText(en['autoSkills.description'])).toBeTruthy()
    expect(screen.getByRole('switch', { name: en['autoSkills.title'] }).getAttribute('aria-checked')).toBe('true')
  })

  it('writes through the form and reflects the accepted value', async () => {
    const state = createSnapshotStore(false)
    let finish!: () => void
    const setAuto = vi.fn((enabled: boolean) => new Promise<void>((resolve) => {
      finish = () => { state.set(enabled); resolve() }
    }))
    render(<AutoSkillsRow {...kit} t={t} useAutoSuperpowers={bindSnapshotSelector(state)} setAuto={setAuto} />)
    const toggle = screen.getByRole('switch', { name: en['autoSkills.title'] })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(setAuto).toHaveBeenCalledWith(true)
    expect(toggle.hasAttribute('disabled')).toBe(true)
    finish()
    await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('true') })
    expect(toggle.hasAttribute('disabled')).toBe(false)
  })

  it('alerts when the Host refuses the write', async () => {
    const state = createSnapshotStore(false)
    const setAuto = vi.fn(() => Promise.reject(new Error('not saved')))
    render(<AutoSkillsRow {...kit} t={t} useAutoSuperpowers={bindSnapshotSelector(state)} setAuto={setAuto} />)
    const toggle = screen.getByRole('switch', { name: en['autoSkills.title'] })
    fireEvent.click(toggle)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(en['autoSkills.error']) })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
