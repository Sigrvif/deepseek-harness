// @vitest-environment jsdom
/** fork(context-editor): the chat fold shows effective content. */
import { describe, expect, it } from 'vitest'
import { createUserMessage, createMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { messageDefinition } from '../src/client/conversation-nodes/message.ts'
import { assistantDefinition } from '../src/client/conversation-nodes/assistant.ts'
import { contextEditShadowedSeqs, isContextEditReplacement } from '@deepseek-ai/dsh-client-ui-conversation/client'

function userAppend(seq: number, text: string): SessionEvent {
  return {
    type: 'user/message', seq, time: 1, surfaceOp: 'append',
    data: createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
  } as unknown as SessionEvent
}

function userReplacement(seq: number, startSeq: number, text: string, mode: 'edited' | 'excluded'): SessionEvent {
  return {
    type: 'user/message', seq, time: 2,
    surfaceOp: { op: 'replace', startSeq, endSeq: startSeq },
    sourceEventSeqs: [startSeq],
    data: {
      ...createUserMessage({ content: mode === 'excluded' ? [] : [{ type: 'text', text }], source: { kind: 'user' } }),
      contextEdit: { mode },
    },
  } as unknown as SessionEvent
}

describe('fork(context-editor) timeline fold', () => {
  it('matches context-edit replacements as message nodes', () => {
    const replacement = userReplacement(2, 0, 'edited question', 'edited')
    expect(isContextEditReplacement(replacement)).toBe(true)
    expect(messageDefinition.match(replacement)).toEqual({ id: expect.any(String), role: 'start' })
  })

  it('hides excluded replacements from the timeline', () => {
    const replacement = userReplacement(2, 0, '', 'excluded')
    expect(messageDefinition.match(replacement)).toBeNull()
  })

  it('computes the shadow set across a batch of entries', () => {
    const entries = [
      { type: 'event', event: userAppend(0, 'question') },
      { type: 'event', event: userReplacement(2, 0, 'edited question', 'edited') },
    ] as never
    expect(contextEditShadowedSeqs(entries)).toEqual(new Set([0]))
  })

  it('matches edited assistant replacements into their step', () => {
    const replacement = {
      type: 'assistant/message', seq: 5, time: 2,
      surfaceOp: { op: 'replace', startSeq: 3, endSeq: 3 },
      sourceEventSeqs: [3],
      data: {
        turn: 1, step: 1,
        message: createMessage({
          role: 'assistant', content: [{ type: 'text', text: 'edited answer' }],
          source: { kind: 'model', provider: 'm', model: 'm' },
        }),
        contextEdit: { mode: 'edited' },
      },
    } as unknown as SessionEvent
    expect(assistantDefinition.match(replacement)).toEqual({ id: '1:1', role: 'update' })
  })
})
