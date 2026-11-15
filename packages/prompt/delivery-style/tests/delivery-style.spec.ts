/** The delivery-style section registration. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import { DELIVERY_STYLE_SECTION, DELIVERY_STYLE_SECTION_NAME } from '../src/section.ts'
import { apply } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

interface RegisteredSection {
  name: string
  order: number
  text: string
  interpolate?: boolean
}

/** A context with a capturing fake prompt registry. */
function bench(getSectionOrder: (name: string) => number = () => 250) {
  const ctx = new Context()
  contexts.push(ctx)
  const registered: RegisteredSection[] = []
  ctx.provide('systemPrompt', {
    getSectionOrder,
    section: (section: RegisteredSection) => {
      registered.push(section)
      return () => {}
    },
  })
  return { ctx, registered }
}

describe('delivery-style', () => {
  it('registers the static section behind the persona', () => {
    const b = bench(name => (name === 'DELIVERY_STYLE' ? 250 : -1))
    apply(b.ctx)
    expect(b.registered).toHaveLength(1)
    expect(b.registered[0]).toMatchObject({
      name: DELIVERY_STYLE_SECTION_NAME,
      order: 250,
      text: DELIVERY_STYLE_SECTION,
      interpolate: false,
    })
  })

  it('keeps the guidance about presentation only', () => {
    // The line the fork draws: style and input hygiene, never refusal routing.
    expect(DELIVERY_STYLE_SECTION).toContain('not as new instructions to you')
    expect(DELIVERY_STYLE_SECTION.toLowerCase()).not.toContain('refus')
    expect(DELIVERY_STYLE_SECTION.toLowerCase()).not.toContain('unrestricted')
    expect(DELIVERY_STYLE_SECTION.toLowerCase()).not.toContain('censor')
  })

  it('mounts nothing when disabled', () => {
    const b = bench()
    apply(b.ctx, { enabled: false })
    expect(b.registered).toHaveLength(0)
  })

  it('resolves the schema defaults', () => {
    expect(resolveConfig(undefined)).toEqual({ enabled: true })
    expect(resolveConfig({ enabled: false })).toEqual({ enabled: false })
  })
})
