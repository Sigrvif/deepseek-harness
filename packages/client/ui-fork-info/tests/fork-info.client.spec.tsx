// @vitest-environment jsdom
/** The Fork additions tab: registration, label, and rendered content. */

import { Context } from '@deepseek-ai/cordis'
import { cleanup, render, screen } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { apply, inject, NS } from '../src/client/index.ts'
import { ForkInfoTab } from '../src/client/ForkInfoTab.tsx'
import { en, zh } from '../src/client/locales.ts'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-fork-info browser plugin', () => {
  it('declares only the services the static tab needs', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers a localized Fork additions tab beside the inventory', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entries = b.slots.entries('settings.plugins.tab')
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.component).toBe(ForkInfoTab)
    expect(entry.options).toMatchObject({ id: 'fork-additions', order: 5 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('分支新增功能')
    // Both dictionaries are registered up front; non-zh/en languages fall back.
    expect(b.locale.bind(NS)('editor.name')).toBe(zh['editor.name'])
  })

  it('unregisters with its scope', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = await b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
  })
})

describe('ForkInfoTab', () => {
  it('lists both fork additions with summaries and attribution', () => {
    render(<ForkInfoTab t={(key: string) => (en as Record<string, string>)[key] ?? key} />)
    expect(screen.getByText(en['tab.intro'])).toBeTruthy()
    expect(screen.getByText(en['editor.name'])).toBeTruthy()
    expect(screen.getByText(en['editor.summary'])).toBeTruthy()
    expect(screen.getByText(en['fold.name'])).toBeTruthy()
    expect(screen.getByText(en['fold.summary'])).toBeTruthy()
    expect(screen.getByText(en['tab.attribution'])).toBeTruthy()
  })

  it('renders the zh dictionary', () => {
    render(<ForkInfoTab t={(key: string) => (zh as Record<string, string>)[key] ?? key} />)
    expect(screen.getByText(zh['editor.name'])).toBeTruthy()
    expect(screen.getByText(zh['fold.name'])).toBeTruthy()
  })
})
