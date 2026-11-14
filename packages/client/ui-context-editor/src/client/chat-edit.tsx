/**
 * The chat-side prompt edit-and-resend (fork context-editor): a pencil action
 * on every durable user/steering bubble and an inline editor that replaces
 * the bubble. Saving excludes the message and its whole tail from model
 * context (restorable in the Context tab) and resubmits the edited text
 * through the composer's normal send path, so a stopped turn with a typo
 * needs no Context-tab round trip.
 * @module @deepseek-ai/dsh-client-ui-context-editor/client/chat-edit
 */

import { memo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { UserMessageNodeView } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ChatNode, ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IconEditOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ContextEditorApi } from './api.ts'
import css from './ChatEdit.module.css'

/** Message ids with the inline editor open (message ids are globally unique; the roster stays tiny). */
const editing = createSnapshotStore<string[]>([])

/** Open/close the inline editor for one message. */
export const chatEdit = {
  open: (messageId: string): void => { editing.update((draft) => { if (!draft.includes(messageId)) draft.push(messageId) }) },
  // In-place splice: the snapshot store's update discards the mutator's
  // return value, so a filter-return would silently keep the editor open.
  close: (messageId: string): void => {
    editing.update((draft) => {
      const index = draft.indexOf(messageId)
      if (index >= 0) draft.splice(index, 1)
    })
  },
}

/** The shared remote face and copy seat, provisioned once at plugin apply. */
let shared: {
  api: ContextEditorApi
  labels: (key: string) => string
} | undefined

/**
 * Wire the chat components to the mounted `contextEditor` remote and the
 * plugin's own dictionary. `locale.bind` returns the stable per-namespace
 * translate, so the seat stays live across dictionary switches.
 * @param api - the camelCase-adapted remote face.
 * @param labels - the `contextEditor` translate seat.
 */
export function provideChatEditFace(api: ContextEditorApi, labels: (key: string) => string): void {
  shared = { api, labels }
}

function face(): { api: ContextEditorApi; labels: (key: string) => string } {
  if (shared === undefined) throw new Error('context-editor: chat edit face provisioned after use')
  return shared
}

/** Plain text of a message's content blocks (the editor edits text only). */
function textOf(content: readonly unknown[]): string {
  return content
    .map(block => (block as { type?: string }).type === 'text' ? ((block as { text?: string }).text ?? '') : '')
    .filter(text => text !== '')
    .join('\n')
}

/** Props of the pencil button, narrowed from the wrapper's standard face. */
export interface ChatPromptEditActionProps {
  messageId: string
  useSession: ContextEditUserViewProps['useSession']
  useAccess: ContextEditUserViewProps['useAccess']
}

/**
 * The pencil in the user bubble's action strip. Hidden while the Session runs
 * (the tail must be settled before an exclusion is admitted) or without
 * prompt access.
 * @param props - owner message id and the session selectors.
 * @returns the icon button, or nothing while gated.
 */
export const ChatPromptEditAction = memo(function ChatPromptEditAction({
  messageId, useSession, useAccess,
}: ChatPromptEditActionProps): ReactNode {
  const settled = useSession(snapshot => !snapshot.running && !snapshot.removed) ?? false
  const allowed = useAccess('session/prompt')
  if (!settled || !allowed) return null
  return (
    <Tooltip label={face().labels('edit.action')} side="bottom">
      <button
        type="button"
        className={css.action}
        aria-label={face().labels('edit.action')}
        onClick={() => { chatEdit.open(messageId) }}
      >
        <IconEditOutlineRegular />
      </button>
    </Tooltip>
  )
})

/** Full props of the keyed user/steering replacement renderer. */
type ContextEditUserViewProps = ChatNodeViewProps<'user' | 'steering'> & {
  /** Bound by the replacement registration's declared seat. */
  renderSlotChain: PropsRenderSlots<'conversation.chat.user.before'>['renderSlotChain']
}

/**
 * The fork's replacement for the standard user/steering Chat renderers: the
 * standard bubble until this message's editor is open, then the inline
 * editor in its place.
 * @param props - the standard node-view face plus the declared seat.
 * @returns the bubble or the editor.
 */
export const ContextEditUserNodeView = memo(function ContextEditUserNodeView(props: ContextEditUserViewProps): ReactNode {
  const open = useSyncExternalStore(editing.subscribe, editing.getSnapshot)
  const messageId = props.node.data.messageId
  if (messageId === undefined) return <UserMessageNodeView {...props} />
  if (open.includes(messageId)) {
    return (
      <ChatPromptEditor
        node={props.node}
        messageId={messageId}
        sessionId={props.sessionId}
        inputActions={props.inputActions}
      />
    )
  }
  return (
    <UserMessageNodeView
      {...props}
      promptActions={(
        <ChatPromptEditAction
          messageId={messageId}
          useSession={props.useSession}
          useAccess={props.useAccess}
        />
      )}
    />
  )
})

/** Props of the inline editor, narrowed from the wrapper's face. */
interface ChatPromptEditorProps {
  node: ChatNode<'user'> | ChatNode<'steering'>
  /** The opened message's durable id (the wrapper only opens for defined ids). */
  messageId: string
  sessionId: ContextEditUserViewProps['sessionId']
  inputActions: ContextEditUserViewProps['inputActions']
}

/**
 * The inline prompt editor: the message's text in a resizable box; Save &
 * resend excludes the message and its whole tail (one confirm) and submits
 * the edited text through the composer's own setDraft + submit path.
 * @param props - the message, its session, and the composer face.
 * @returns the editor box.
 */
const ChatPromptEditor = memo(function ChatPromptEditor({
  node, messageId, sessionId, inputActions,
}: ChatPromptEditorProps): ReactNode {
  const { api, labels } = face()
  const [draft, setDraft] = useState(() => textOf(node.data.content))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const save = (): void => {
    if (busy || draft.trim() === '') return
    if (!window.confirm(labels('edit.confirm'))) return
    setBusy(true)
    setError(undefined)
    api.excludeFrom({ sessionId, startSeq: node.data.seq }).then(
      () => {
        // Close first: the editor must leave the transcript even if the
        // composer handoff below misbehaves.
        chatEdit.close(messageId)
        inputActions.setDraft(draft)
        try {
          inputActions.submit()
        } catch {
          // The composer surfaces admission failures itself; the edited text
          // stays in the composer for a manual Enter.
        }
      },
      (failure: unknown) => {
        setBusy(false)
        setError(failure instanceof Error ? failure.message : String(failure))
      },
    )
  }

  return (
    <div className={css.editor} data-testid="prompt-editor">
      <textarea
        className={css.text}
        value={draft}
        autoFocus
        onChange={(event) => { setDraft(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') chatEdit.close(messageId)
        }}
      />
      {error !== undefined ? <p className={css.error} role="alert">{error}</p> : null}
      <div className={css.editorActions}>
        <button type="button" className={css.button} onClick={() => { chatEdit.close(messageId) }}>
          {labels('action.cancel')}
        </button>
        <button
          type="button"
          className={`${css.button} ${css.primary}`}
          disabled={busy || draft.trim() === ''}
          onClick={save}
        >
          {labels('edit.save')}
        </button>
      </div>
    </div>
  )
})
