// @vitest-environment jsdom
/** fork(context-editor): the chat prompt edit-and-resend components. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { en } from '../src/client/locales.ts'
import { provideChatEditFace, chatEdit, ChatPromptEditAction, ContextEditUserNodeView } from '../src/client/chat-edit.tsx'
import type { ContextEditorApi } from '../src/client/api.ts'

/** The stubbed standard bubble: the fallback branch the editor delegates to. */
function StandardBubble(): object {
  return <div data-testid="standard-user-view" />
}

/** The stubbed bubble is passed to the face directly (the seat-scan result). */
function bubbleOf(): unknown {
  return StandardBubble
}

afterEach(() => {
  cleanup()
  chatEdit.close('m-1')
})

function labelsOf(): (key: string) => string {
  return (key: string) => (en as Record<string, string>)[key] ?? key
}

function mockApi(): ContextEditorApi & {
  excludeFrom: ReturnType<typeof vi.fn>
} {
  return {
    excludeFrom: vi.fn(() => Promise.resolve({ sessionId: 's', rows: [], totalTokens: 0, config: {} })),
    preview: () => Promise.resolve({ sessionId: 's', rows: [], totalTokens: 0, config: {} }),
    editMessage: () => { throw new Error('unused') },
    excludeRange: () => { throw new Error('unused') },
    restoreRange: () => { throw new Error('unused') },
    expandCheckpoint: () => { throw new Error('unused') },
    createRecoveryBranch: () => { throw new Error('unused') },
    condenseRange: () => { throw new Error('unused') },
    listRequests: () => Promise.resolve({ entries: [], hasMore: false, captureDegraded: false }),
    getRequest: () => { throw new Error('unused') },
    setTools: () => { throw new Error('unused') },
    setParams: () => { throw new Error('unused') },
    getOverrides: () => Promise.resolve({ record: null, inheritedByForks: false }),
  } as never as ContextEditorApi & { excludeFrom: ReturnType<typeof vi.fn> }
}

/** A durable user node carrying one text block. */
function userNode() {
  return {
    target: 'chat',
    kind: 'user',
    anchorSeq: 5,
    location: { kind: 'step', turn: { turn: 1 }, step: { turn: 1, step: 1 } },
    visibility: 'visible',
    data: {
      messageId: 'm-1',
      seq: 5,
      time: 0,
      content: [{ type: 'text', text: 'typo text' }],
      source: { kind: 'user' },
    },
  } as never
}

function freshStandard(): { sessionId: string; inputActions: { setDraft: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn> } } {
  return { sessionId: 's-1', inputActions: { setDraft: vi.fn(), submit: vi.fn() } }
}

describe('ChatPromptEditor', () => {
  it('opens with the message text, and cancel restores the standard view without calls', async () => {
    const api = mockApi()
    provideChatEditFace(api, labelsOf(), bubbleOf())
    chatEdit.open('m-1')
    const standard = freshStandard()
    const view = render(createElement(ContextEditUserNodeView, {
      node: userNode(), ...standard,
    } as never))
    const editor = await waitFor(() => view.container.querySelector('[data-testid="prompt-editor"]')!)
    expect(editor.querySelector('textarea')!.value).toBe('typo text')
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => { expect(view.container.querySelector('[data-testid="standard-user-view"]')).not.toBeNull() })
    expect(api.excludeFrom).not.toHaveBeenCalled()
    expect(standard.inputActions.setDraft).not.toHaveBeenCalled()
  })

  it('save & resend excludes from the message seq and submits the edited text', async () => {
    const api = mockApi()
    provideChatEditFace(api, labelsOf(), bubbleOf())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    chatEdit.open('m-1')
    const standard = freshStandard()
    const view = render(createElement(ContextEditUserNodeView, {
      node: userNode(), ...standard,
    } as never))
    await waitFor(() => { expect(view.container.querySelector('[data-testid="prompt-editor"]')).not.toBeNull() })
    fireEvent.change(view.container.querySelector('[data-testid="prompt-editor"] textarea')!, { target: { value: 'fixed text' } })
    fireEvent.click(screen.getByText('Save & resend'))
    await waitFor(() => { expect(api.excludeFrom).toHaveBeenCalledTimes(1) })
    expect(api.excludeFrom).toHaveBeenCalledWith({ sessionId: 's-1', startSeq: 5 })
    expect(standard.inputActions.setDraft).toHaveBeenCalledWith('fixed text')
    expect(standard.inputActions.submit).toHaveBeenCalledTimes(1)
    await waitFor(() => { expect(view.container.querySelector('[data-testid="standard-user-view"]')).not.toBeNull() })
    confirm.mockRestore()
  })

  it('keeps the editor open with the error when the exclusion fails', async () => {
    const api = mockApi()
    api.excludeFrom = vi.fn(() => Promise.reject(new Error('session has an open turn')))
    provideChatEditFace(api, labelsOf(), bubbleOf())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    chatEdit.open('m-1')
    const standard = freshStandard()
    const view = render(createElement(ContextEditUserNodeView, {
      node: userNode(), ...standard,
    } as never))
    await waitFor(() => { expect(view.container.querySelector('[data-testid="prompt-editor"]')).not.toBeNull() })
    fireEvent.click(screen.getByText('Save & resend'))
    await waitFor(() => { expect(screen.getByText('session has an open turn')).not.toBeNull() })
    expect(view.container.querySelector('[data-testid="prompt-editor"]')).not.toBeNull()
    expect(standard.inputActions.submit).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})

describe('ChatPromptEditAction', () => {
  const access = (allowed: boolean) => () => allowed
  const session = (running: boolean) => (selector: (snapshot: { running: boolean }) => boolean) => selector({ running })
  const base = { messageId: 'm-1' }

  it('renders nothing while the session runs', () => {
    provideChatEditFace(mockApi(), labelsOf(), bubbleOf())
    const view = render(createElement(ChatPromptEditAction, {
      ...base, useSession: session(true), useAccess: access(true),
    } as never))
    expect(view.container.querySelector('button')).toBeNull()
  })

  it('renders nothing without prompt access', () => {
    provideChatEditFace(mockApi(), labelsOf(), bubbleOf())
    const view = render(createElement(ChatPromptEditAction, {
      ...base, useSession: session(false), useAccess: access(false),
    } as never))
    expect(view.container.querySelector('button')).toBeNull()
  })

  it('opens the editor for the clicked message on a settled session', () => {
    provideChatEditFace(mockApi(), labelsOf(), bubbleOf())
    const view = render(createElement(ContextEditUserNodeView, {
      node: userNode(), ...freshStandard(),
    } as never))
    expect(view.container.querySelector('[data-testid="standard-user-view"]')).not.toBeNull()
    const action = render(createElement(ChatPromptEditAction, {
      ...base, useSession: session(false), useAccess: access(true),
    } as never))
    fireEvent.click(action.container.querySelector('button')!)
    return waitFor(() => { expect(view.container.querySelector('[data-testid="prompt-editor"]')).not.toBeNull() })
  })
})
