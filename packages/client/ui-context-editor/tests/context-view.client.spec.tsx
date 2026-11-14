// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { ContextView } from '../src/client/ContextView.tsx'
import type { ContextEditorApi } from '../src/client/api.ts'
import type { ContextPreview } from '@deepseek-ai/dsh-context-editor/types'
import { en } from '../src/client/locales.ts'

let rendered = false
afterEach(() => {
  if (rendered) cleanup()
  rendered = false
})

function labelsOf(dictionary: Record<string, string>): (key: string) => string {
  return (key: string) => dictionary[key] ?? key
}

function fixturePreview(): ContextPreview {
  return {
    sessionId: 'ctx-view',
    rows: [
      { seq: 1, role: 'user', text: 'the question', blocks: [], excluded: false, estimateTokens: 6 },
      {
        seq: 4, role: 'assistant', text: 'the answer', blocks: [], excluded: false,
        editedFrom: [4], estimateTokens: 9,
      },
    ],
    totalTokens: 15,
    config: { temperature: 0.7 },
  }
}

function mockApi(preview: Promise<ContextPreview>): ContextEditorApi {
  return {
    preview: () => preview,
    editMessage: () => { throw new Error('unused') },
    excludeRange: () => { throw new Error('unused') },
    excludeFrom: () => { throw new Error('unused') },
    restoreRange: () => { throw new Error('unused') },
    expandCheckpoint: () => { throw new Error('unused') },
    createRecoveryBranch: () => { throw new Error('unused') },
    condenseRange: () => { throw new Error('unused') },
    listRequests: () => Promise.resolve({ entries: [], hasMore: false, captureDegraded: false }),
    getRequest: () => { throw new Error('unused') },
    setTools: () => { throw new Error('unused') },
    setParams: () => { throw new Error('unused') },
    getOverrides: () => Promise.resolve({ record: null, inheritedByForks: false }),
  } as never as ContextEditorApi
}

describe('ContextView', () => {
  it('renders preview rows with badges and totals', async () => {
    rendered = true
    render(<ContextView sessionId="ctx-view" api={mockApi(Promise.resolve(fixturePreview()))} labels={(key: string) => (en as Record<string, string>)[key] ?? key} />)
    await waitFor(() => { expect(screen.getByTestId('context-rows')).toBeDefined() })
    expect(screen.getAllByTestId('context-row-user')).toHaveLength(1)
    expect(screen.getAllByTestId('context-row-assistant')).toHaveLength(1)
    expect(screen.getByText('edited').textContent).toBeTruthy()
    expect(screen.getByTestId('context-total').textContent).toContain('15')
  })

  it('renders the error state when the remote rejects', async () => {
    rendered = true
    render(<ContextView sessionId="ctx-view" api={mockApi(Promise.reject(new Error('remote down')))} labels={(key: string) => (en as Record<string, string>)[key] ?? key} />)
    await waitFor(() => { expect(screen.getByTestId('context-error').textContent).toContain('remote down') })
  })

  it('wires the edit flow: save calls editMessage and reloads', async () => {
    rendered = true
    const calls: unknown[] = []
    const edited = fixturePreview()
    const rows = [{ ...edited.rows[0]!, text: 'new text' }, ...edited.rows.slice(1)]
    const previews = [edited, { ...edited, rows }]
    let reloads = 0
    const api = {
      ...mockApi(Promise.resolve(edited)),
      preview: () => { const next = previews[Math.min(reloads, previews.length - 1)]!; reloads += 1; return Promise.resolve(next) },
      editMessage: (args: { text: string }) => { calls.push(args); return Promise.resolve(previews[1]!) },
      listRequests: () => Promise.resolve({ entries: [], hasMore: false, captureDegraded: false }),
      getOverrides: () => Promise.resolve({ record: null, inheritedByForks: false }),
    } as never as ContextEditorApi
    render(<ContextView sessionId="ctx-view" api={api} labels={labelsOf(en)} />)
    await waitFor(() => { expect(screen.getAllByTestId('context-row-user')).toHaveLength(1) })
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByTestId('edit-1'), { target: { value: 'new text' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => { expect(calls).toHaveLength(1) })
    expect((calls[0] as { text: string }).text).toBe('new text')
    await waitFor(() => { expect(screen.getAllByText('new text').length).toBeGreaterThan(0) })
  })

  it('excludes a row through the confirm dialog', async () => {
    rendered = true
    const calls: unknown[] = []
    const api = {
      ...mockApi(Promise.resolve(fixturePreview())),
      excludeRange: (args: { startSeq: number }) => { calls.push(args); return Promise.resolve(fixturePreview()) },
      listRequests: () => Promise.resolve({ entries: [], hasMore: false, captureDegraded: false }),
      getOverrides: () => Promise.resolve({ record: null, inheritedByForks: false }),
    } as never as ContextEditorApi
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ContextView sessionId="ctx-view" api={api} labels={labelsOf(en)} />)
    await waitFor(() => { expect(screen.getAllByTestId('context-rows')).toHaveLength(1) })
    fireEvent.click(screen.getAllByText('Exclude')[0]!)
    await waitFor(() => { expect(calls).toHaveLength(1) })
    expect((calls[0] as { startSeq: number }).startSeq).toBe(1)
    confirm.mockRestore()
  })

  it('renders an excluded stub with its coverage and restore affordance', async () => {
    rendered = true
    const preview = fixturePreview()
    const rows = [{
      seq: 6, role: 'user' as const, text: '', blocks: [], excluded: true,
      excludes: [1, 4], excludesText: 'the question\nthe answer', estimateTokens: 0,
    }]
    const api = {
      ...mockApi(Promise.resolve({ ...preview, rows })),
      restoreRange: () => Promise.resolve(preview),
      listRequests: () => Promise.resolve({ entries: [], hasMore: false, captureDegraded: false }),
      getOverrides: () => Promise.resolve({ record: null, inheritedByForks: false }),
    } as never as ContextEditorApi
    render(<ContextView sessionId="ctx-view" api={api} labels={labelsOf(en)} />)
    await waitFor(() => { expect(screen.getByTestId('excluded-6')).toBeDefined() })
    expect(screen.getByTestId('excluded-6').textContent).toContain('Excludes #1–#4')
    expect(screen.getByTestId('excluded-6').textContent).toContain('the question')
    expect(screen.getByTestId('restore-6')).toBeDefined()
  })

  it('excludes a row and its tail through one confirm', async () => {
    rendered = true
    const calls: unknown[] = []
    const api = {
      ...mockApi(Promise.resolve(fixturePreview())),
      excludeFrom: (args: { startSeq: number }) => { calls.push(args); return Promise.resolve(fixturePreview()) },
      listRequests: () => Promise.resolve({ entries: [], hasMore: false, captureDegraded: false }),
      getOverrides: () => Promise.resolve({ record: null, inheritedByForks: false }),
    } as never as ContextEditorApi
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ContextView sessionId="ctx-view" api={api} labels={labelsOf(en)} />)
    await waitFor(() => { expect(screen.getAllByTestId('context-rows')).toHaveLength(1) })
    fireEvent.click(screen.getByTestId('exclude-to-end-1'))
    await waitFor(() => { expect(calls).toHaveLength(1) })
    expect((calls[0] as { startSeq: number }).startSeq).toBe(1)
    expect(confirm).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('lists captured requests and exposes their JSON', async () => {
    rendered = true
    const api = {
      ...mockApi(Promise.resolve(fixturePreview())),
      listRequests: () => Promise.resolve({
        entries: [{
          seq: 1, time: '2026-10-29T00:00:00.000Z', purpose: 'compaction' as const,
          provider: 'actual', model: 'm.gguf', config: {}, messages: [], status: 'error' as const, error: 'boom',
        }],
        hasMore: false, captureDegraded: true,
      }),
      getOverrides: () => Promise.resolve({ record: null, inheritedByForks: false }),
    } as never as ContextEditorApi
    render(<ContextView sessionId="ctx-view" api={api} labels={labelsOf(en)} />)
    fireEvent.click(screen.getByText('Requests'))
    await waitFor(() => { expect(screen.getByTestId('request-1')).toBeDefined() })
    expect(screen.getByTestId('degraded-notice').textContent).toContain('failing')
    fireEvent.click(screen.getByTestId('request-1').querySelector('button')!)
    expect(screen.getByTestId('request-json-1').textContent).toContain('boom')
  })

  it('edits params from the tools pane', async () => {
    rendered = true
    const calls: unknown[] = []
    const api = {
      ...mockApi(Promise.resolve(fixturePreview())),
      getOverrides: () => Promise.resolve({
        record: { removedTools: [], toolEdits: {}, params: { temperature: 0.5 } }, inheritedByForks: false,
      }),
      setParams: (args: { params: { temperature?: number } }) => {
        calls.push(args)
        return Promise.resolve({ removedTools: [], toolEdits: {}, params: args.params })
      },
      listRequests: () => Promise.resolve({ entries: [], hasMore: false, captureDegraded: false }),
    } as never as ContextEditorApi
    render(<ContextView sessionId="ctx-view" api={api} labels={labelsOf(en)} />)
    fireEvent.click(screen.getByText('Tools & params'))
    await waitFor(() => { expect(screen.getByTestId('param-temperature')).toBeDefined() })
    fireEvent.change(screen.getByTestId('param-temperature'), { target: { value: '0.3' } })
    fireEvent.blur(screen.getByTestId('param-temperature'))
    await waitFor(() => { expect(calls).toHaveLength(1) })
    expect((calls[0] as { params: { temperature?: number } }).params.temperature).toBe(0.3)
  })
})
