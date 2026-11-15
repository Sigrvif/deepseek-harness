// @vitest-environment jsdom
/** The DSLRH brand occupants: registration and rendered content. */

import { Context } from '@deepseek-ai/cordis'
import { cleanup, render, screen } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { apply, inject, ForkBrandMark, ForkBrandName } from '../src/client/index.ts'

afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-fork-brand browser plugin', () => {
  it('declares only the slot registry', () => {
    expect(inject).toEqual(['slots'])
  })

  it('claims the sidebar brand-mark and brand-name slots', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const marks = b.slots.entries('sidebar.brand.mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]!.component).toBe(ForkBrandMark)
    const names = b.slots.entries('sidebar.brand.name')
    expect(names).toHaveLength(1)
    expect(names[0]!.component).toBe(ForkBrandName)
  })

  it('renders the DSLRH mark and name plate with the fork version', async () => {
    const { container } = render(<ForkBrandMark size={24} />)
    const mark = container.querySelector('img')
    expect(mark).not.toBeNull()
    expect(mark!.getAttribute('alt')).toBe('')
    cleanup()

    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<ForkBrandName />)
    expect(screen.getByText('DSLRH')).toBeDefined()
    const plate = screen.getByText('DSLRH').parentElement!
    expect(plate.getAttribute('data-copy-version')).not.toBeNull()
    plate.click()
    // DSH_CLIENT_FORK_VERSION is baked per bundle; the plate copies whatever it shows.
    await vi.waitFor(() => { expect(writeText).toHaveBeenCalledWith(process.env.DSH_CLIENT_FORK_VERSION ?? '') })
  })
})
