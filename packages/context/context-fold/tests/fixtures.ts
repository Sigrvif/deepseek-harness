/** Shared session fixtures for context-fold specs. */
import {
  createMessage,
  createToolResultMessage,
  createUserMessage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Session, SessionId, SessionSeq, foldSurface } from '@deepseek-ai/dsh-session'

export const MODEL = 'm.gguf'

export function user(text: string) {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
}

export function assistant(text: string) {
  return createMessage({
    role: 'assistant',
    content: [{ type: 'text', text }],
    source: { kind: 'model', provider: MODEL, model: MODEL },
  })
}

export function assistantCall(callId: string, text = 'calling') {
  return createMessage({
    role: 'assistant',
    content: [
      { type: 'text', text },
      { type: 'tool-call', id: ToolCallId(callId), name: 'read', arguments: '{}' },
    ],
    source: { kind: 'model', provider: MODEL, model: MODEL },
  })
}

export function toolResult(callId: string, text = 'tool output') {
  return createToolResultMessage({
    callId: ToolCallId(callId),
    content: [{ type: 'text', text }],
    isError: false,
  })
}

export type TurnMessage =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'call'; callId: string; text?: string }
  | { kind: 'result'; callId: string; text?: string }

export function addTurn(session: Session, turn: number, messages: readonly TurnMessage[], close = true) {
  session.append('turn/start', { turn })
  for (const [index, entry] of messages.entries()) {
    const step = index + 1
    session.append('step/start', { turn, step })
    if (entry.kind === 'user') {
      session.append('user/message', user(entry.text), { surfaceOp: 'append' })
    } else if (entry.kind === 'assistant') {
      session.append('assistant/message', { stream: [], turn, step, message: assistant(entry.text) }, { surfaceOp: 'append' })
    } else if (entry.kind === 'call') {
      session.append('assistant/message', { stream: [], turn, step, message: assistantCall(entry.callId, entry.text ?? 'calling') }, { surfaceOp: 'append' })
      session.append('tool/call', { turn, step, callId: ToolCallId(entry.callId), name: 'read', arguments: '{}' })
    } else {
      session.append('tool/result', { turn, step, message: toolResult(entry.callId, entry.text ?? 'tool output') }, { surfaceOp: 'append' })
    }
    session.append('step/end', { turn, step })
  }
  if (close) session.append('turn/end', { turn, reason: { kind: 'stop' } as never })
}

export function plainSession(id = 'fold-plain'): Session {
  const session = Session.create(SessionId(id))
  addTurn(session, 1, [
    { kind: 'user', text: 'first user message stays visible' },
    { kind: 'assistant', text: 'assistant answer one with enough body text to fold' },
    { kind: 'user', text: 'second user message' },
    { kind: 'assistant', text: 'assistant answer two with enough body text to fold' },
    { kind: 'user', text: 'recent user message' },
    { kind: 'assistant', text: 'recent assistant answer' },
  ])
  return session
}

export function surfaceSeqs(session: Session): SessionSeq[] {
  return [...foldSurface(session.snapshotEvents()).nodes]
}

/** The assistant/message event carrying a given tool-call id, if any. */
export function assistantWithCall(events: readonly SessionEvent[], callId: string) {
  return events.find((event) => {
    if (event.type !== 'assistant/message') return false
    return event.data.message.content.some(block => block.type === 'tool-call' && String(block.id) === callId)
  })
}
