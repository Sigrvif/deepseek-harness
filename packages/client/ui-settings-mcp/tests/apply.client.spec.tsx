// @vitest-environment jsdom
/** The client plugin body: apply() mounts the remote, registers copy, and docks the section. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject, NS } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'

/** A client context mock capturing the slot registration like the renderer would. */
function clientCtx() {
  const mountMock = vi.fn(async () => ({}))
  const registered: Array<{ options: Record<string, unknown>; component: unknown }> = []
  const registeredLocales: Array<{ ns: string; dicts: unknown }> = []
  const injected: Array<{ name: string; build: () => void }> = []
  const form = {
    getSnapshot: () => ({ status: 'ready' as const, value: { broker: true }, base: { broker: true }, user: { broker: true }, revision: 1, writable: true }),
    subscribe: () => () => undefined,
    set: async () => true,
  }
  const ctx = {
    configForms: { get: () => form },
    remote: { $mount: mountMock },
    effect: (fn: () => unknown, _label?: string) => { fn(); return () => undefined },
    locale: {
      register: (ns: string, dicts: unknown) => { registeredLocales.push({ ns, dicts }) },
      bind: () => (key: string) => key,
    },
    slots: {
      inject: (_slot: string, build: () => unknown) => build(),
      register: (options: Record<string, unknown>, _component: unknown) => {
        registered.push({ options, component: _component })
        return () => undefined
      },
    },
    inject: (_services: string[], build: (scoped: never) => void) => {
      // The scoped context is the same shape; invoke immediately like cordis would.
      build(ctx as never)
      injected.push({ name: _services.join('+'), build: () => undefined })
    },
  }
  return { ctx: ctx as unknown as Context, mountMock, registered, registeredLocales, injected }
}

describe('ui-settings-mcp client apply', () => {
  it('mounts the remote, registers dictionaries, and docks the settings section', async () => {
    const harness = clientCtx()
    await apply(harness.ctx)
    expect(harness.mountMock).toHaveBeenCalledTimes(1)
    expect(harness.registeredLocales).toHaveLength(1)
    const locale = harness.registeredLocales[0]!
    expect(locale.ns).toBe(NS)
    expect((locale.dicts as { en: Record<string, string> }).en.title).toBe(en.title)
    expect((locale.dicts as { zh: Record<string, string> }).zh.title).toBe(zh.title)
    // The section registers only from the child scope, after the remote lands.
    expect(harness.registered).toHaveLength(1)
    const registration = harness.registered[0]!.options as { id: string; name: string; label: () => string }
    expect(registration.id).toBe('mcp')
    expect(registration.name).toBe('settings.section')
    expect(registration.label()).toBe('nav') // the mock binder passes keys through
  })

  it('declares the services it consumes', () => {
    expect(inject).toEqual(['remote', 'slots', 'locale', 'configForms'])
  })
})
