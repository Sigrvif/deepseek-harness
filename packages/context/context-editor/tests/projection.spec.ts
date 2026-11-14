/** previewFromEvents: model-visible rows with provenance, straight over session events. */
import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { previewFromEvents } from '../src/projection.ts'

function conversation(): Session {
  const session = Session.create(SessionId('preview'))
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'hello world' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  const assistant = createAssistantMessage({
    content: [
      { type: 'reasoning', text: 'thinking hard' },
      { type: 'text', text: 'the answer' },
    ],
    source: { kind: 'model', provider: 'llm-pi-ai', model: 'm.gguf' },
  } as never)
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: assistant }, { surfaceOp: 'append' })
  session.append('request/header', {
    header: {
      config: { provider: 'llm-pi-ai', model: 'm.gguf', temperature: 0.4 },
      tools: [{ name: 'read', description: 'read', parameters: {} }] as never,
    },
    reason: 'initial',
  })
  return session
}

describe('previewFromEvents', () => {
  it('projects surface rows in model-visible order with config and tools', () => {
    const session = conversation()
    const preview = previewFromEvents('preview', session.snapshotEvents())
    expect(preview.rows.map(row => row.role)).toEqual(['user', 'assistant'])
    expect(preview.rows[0]?.text).toBe('hello world')
    expect(preview.rows[1]?.text).toContain('thinking hard')
    expect(preview.rows[1]?.text).toContain('the answer')
    expect(preview.rows.every(row => row.estimateTokens > 0)).toBe(true)
    expect(preview.totalTokens).toBeGreaterThan(0)
    expect(preview.config).toMatchObject({ temperature: 0.4 })
    expect(preview.tools).toEqual([{ name: 'read', description: 'read', parameters: {} }])
  })

  it('marks replacement rows as edited with their source provenance', () => {
    const session = conversation()
    const assistantSeq = session.surface.nodes[1]!
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      stream: [],
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'edited answer' }],
        source: { kind: 'model', provider: 'llm-pi-ai', model: 'm.gguf' },
      } as never),
    }, { surfaceOp: { op: 'replace', startSeq: assistantSeq, endSeq: assistantSeq }, sourceEventSeqs: [assistantSeq] } as never)
    const preview = previewFromEvents('preview', session.snapshotEvents())
    expect(preview.rows).toHaveLength(2)
    expect(preview.rows[1]?.text).toBe('edited answer')
    expect(preview.rows[1]?.editedFrom).toEqual([assistantSeq])
    expect(preview.rows[1]?.excluded).toBe(false)
  })

  it('marks empty context-edit replacements as excluded with the shadowed range', () => {
    const session = conversation()
    const userSeq = session.surface.nodes[0]!
    const assistantSeq = session.surface.nodes[1]!
    session.append('user/message', {
      ...createUserMessage({
        content: [],
        source: { kind: 'user' },
      }),
      contextEdit: { mode: 'excluded' },
    } as never, {
      surfaceOp: { op: 'replace', startSeq: userSeq, endSeq: assistantSeq },
      sourceEventSeqs: [userSeq, assistantSeq],
    })
    const preview = previewFromEvents('preview', session.snapshotEvents())
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0]?.excluded).toBe(true)
    expect(preview.rows[0]?.excludes).toEqual([userSeq, assistantSeq])
    // The stub carries the shadowed text so the tab can show what was removed.
    expect(preview.rows[0]?.excludesText).toContain('hello world')
    expect(preview.rows[0]?.excludesText).toContain('the answer')
  })
})
