/** fork(context-editor): empty excluded replacements derive to nothing. */
import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'

function userText(text: string) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

describe('fork(context-editor) derivation rule', () => {
  it('skips an empty excluded replacement in deriveMessages', () => {
    const session = Session.create(SessionId('ctx-edit-rule'))
    session.append('user/message', userText('kept question'), { surfaceOp: 'append' })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'kept answer' }],
        source: { kind: 'model', provider: 'm', model: 'm' },
      }),
    }, { surfaceOp: 'append' })
    const assistantSeq = session.surface.nodes[1]!
    session.append('user/message', {
      ...createUserMessage({ content: [], source: { kind: 'user' } }),
      contextEdit: { mode: 'excluded' },
    } as never, {
      surfaceOp: { op: 'replace', startSeq: assistantSeq, endSeq: assistantSeq },
      sourceEventSeqs: [assistantSeq],
    })
    const derived = session.deriveMessages().map(message => JSON.stringify(message.content))
    expect(derived).toHaveLength(1)
    expect(derived[0]).toContain('kept question')
  })

  it('keeps non-excluded messages: non-empty context-edit and empty non-marked user events', () => {
    const session = Session.create(SessionId('ctx-edit-rule-2'))
    session.append('user/message', userText('regular'), { surfaceOp: 'append' })
    const regularSeq = session.surface.nodes[0]!
    // A NON-empty context-edit replacement still derives (edits derive; only exclusions skip).
    session.append('user/message', {
      ...userText('edited text'),
      contextEdit: { mode: 'edited' },
    } as never, {
      surfaceOp: { op: 'replace', startSeq: regularSeq, endSeq: regularSeq },
      sourceEventSeqs: [regularSeq],
    })
    // An empty user event WITHOUT the marker keeps deriving (upstream behavior unchanged).
    session.append('user/message', createUserMessage({ content: [], source: { kind: 'user' } }), { surfaceOp: 'append' })
    // The replacement shadows the original: edited text + the unmarked empty user event.
    const derived = session.deriveMessages()
    expect(derived).toHaveLength(2)
    expect(JSON.stringify(derived[0])).toContain('edited text')
    expect(JSON.stringify(derived[1])).toContain('[]')
  })
})
