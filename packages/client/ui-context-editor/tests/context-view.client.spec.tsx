// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ContextView } from '../src/client/ContextView.tsx'
import type { ContextEditorApi } from '../src/client/api.ts'
import type { ContextPreview } from '@deepseek-ai/dsh-context-editor/types'
import { en } from '../src/client/locales.ts'

let rendered = false
afterEach(() => {
  if (rendered) cleanup()
  rendered = false
})

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
    restoreRange: () => { throw new Error('unused') },
    expandCheckpoint: () => { throw new Error('unused') },
    createRecoveryBranch: () => { throw new Error('unused') },
    condenseRange: () => { throw new Error('unused') },
    listRequests: () => { throw new Error('unused') },
    getRequest: () => { throw new Error('unused') },
    setTools: () => { throw new Error('unused') },
    setParams: () => { throw new Error('unused') },
    getOverrides: () => { throw new Error('unused') },
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
})
