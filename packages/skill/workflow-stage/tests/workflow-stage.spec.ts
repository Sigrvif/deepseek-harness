/** Stage tracking on agent/pre-step: arming, the /spec gate, file fallback, retirement. */
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type MessageSource } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent, type SessionSeq, type UserMessage } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { SkillDefinition, SkillRegistry } from '@deepseek-ai/dsh-skill'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { WorkingDirectoryService } from '@deepseek-ai/dsh-working-directory'
import type { FileSystem } from '@deepseek-ai/dsh-fs'

/** The checkpoint brand on a compaction source, the tool-skill spec's pattern. */
type CheckpointSource = Extract<MessageSource, { readonly kind: 'compact-checkpoint' }>
import { afterEach, describe, expect, it } from 'vitest'
import { apply, runtimeOf,
  stageOfSkill,
  workflowStageProjectionDefinition,
  type WorkflowStageUnitState,
} from '../src/index.ts'

const SIGNAL = new AbortController().signal

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

/** A minimal loaded skill; `stage` lands in frontmatter metadata. */
function skill(name: string, stage?: string): SkillDefinition {
  return {
    name,
    path: `/skills/${name}/SKILL.md`,
    description: `test skill ${name}`,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: 'filesystem',
    resourceBase: { kind: 'directory', path: `/skills/${name}` },
    content: `# ${name}`,
    ...stage !== undefined ? { metadata: { stage } } : {},
  }
}

interface SectionRegistration {
  name: string
  order: number | string
  text: (context: { agent?: Agent }) => string
}

async function mounted(options: {
  /** Registry contents the controller resolves invocation names against. */
  skills?: SkillDefinition[]
  /** SPEC.md text the fs stub serves; absent means the read fails (missing file). */
  spec?: string
} = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const defs = new Map((options.skills ?? []).map(entry => [entry.name, entry]))
  ctx.provide('skills', {
    get: (name: string) => Promise.resolve(defs.get(name)),
  } as unknown as SkillRegistry)
  ctx.provide('workingDirectory', { ensure: () => Promise.resolve('/workspace') } as unknown as WorkingDirectoryService)
  const sections: SectionRegistration[] = []
  ctx.provide('systemPrompt', {
    section: (registration: SectionRegistration) => { sections.push(registration) },
    getSectionOrder: () => 2340,
  } as unknown as SystemPrompt)
  ctx.provide('fs', {
    resolve: (path: string, opts: { cwd?: string }) => Promise.resolve(`${opts.cwd ?? '/workspace'}/${path}`),
    readText: () => options.spec === undefined
      ? Promise.reject(new Error('missing'))
      : Promise.resolve(options.spec),
  } as unknown as FileSystem)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await apply(ctx)
  const controller = runtimeOf(ctx)
  if (controller === undefined) throw new Error('workflow-stage runtime did not start')
  const agent = {
    id: SessionId('s1'),
    session: Session.create(SessionId('s1')),
    options: {},
    inject(message: UserMessage) {
      agent.session.append('user/message', message, { surfaceOp: 'append' })
    },
  } as unknown as Agent & { session: Session }
  const step = () =>
    agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'p', model: 'm' }, messages: [], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] as UserMessage[] }),
    )
  return { ctx, controller, agent, sections, step }
}

/** A persisted skill-invocation event the surface still shows. */
function addInvocation(
  agent: Agent & { session: Session },
  name: string,
  options: { visible?: boolean } = {},
): SessionSeq {
  const session = agent.session
  session.append('turn/start', { turn: 1 })
  const event = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: `<skill_content name="${name}">body</skill_content>` }],
    source: { kind: 'skill-invocation', name, form: 'instructions' },
  }), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  if (options.visible === false) {
    // An engine compaction shadowed the invocation out of the visible surface.
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'compacted' }],
      source: { kind: 'compact-checkpoint', compactionId: 'c1' as CheckpointSource['compactionId'] },
    }), {
      surfaceOp: { op: 'replace', startSeq: event.seq, endSeq: event.seq },
      sourceEventSeqs: [event.seq],
    })
  }
  return event.seq
}

function stageEvents(session: Session): SessionEvent[] {
  return session.snapshotEvents().filter(event => event.type === 'workflow/stage')
}

function sourceOf(event: SessionEvent | undefined): { kind?: string; name?: string } | undefined {
  return (event?.data as { source?: { kind?: string; name?: string } }).source
}

function textOf(event: SessionEvent | undefined): string {
  return (((event?.data) as { content?: { text?: string }[] } | undefined)?.content ?? [])
    .map(block => block.text ?? '').join('')
}

/** Real surfaces expose `nodes` as a readonly array; membership checks go through a Set. */
function visibleSeqs(session: Session): Set<SessionSeq> {
  return new Set(session.surface.nodes)
}

/** Text of an injected UserMessage riding a step decision. */
function messageText(message: UserMessage | undefined): string {
  return (message?.content ?? []).map(block => block.type === 'text' ? block.text : '').join('')
}

describe('workflow-stage', () => {
  it('folds the last workflow/stage event and starts unarmed', () => {
    let state: WorkflowStageUnitState = workflowStageProjectionDefinition.init()
    expect(state.stage).toBe(null)
    state = workflowStageProjectionDefinition.apply(state, { type: 'workflow/stage', data: { stage: 'spec' } } as SessionEvent)
    expect(state.stage).toBe('spec')
    state = workflowStageProjectionDefinition.apply(state, { type: 'workflow/stage', data: { stage: 'execute' } } as SessionEvent)
    expect(state.stage).toBe('execute')
    const untouched = workflowStageProjectionDefinition.apply(state, { type: 'turn/start', data: { turn: 2 } } as SessionEvent)
    expect(untouched).toBe(state)
  })

  it('reads a valid stage tag from skill metadata and ignores everything else', () => {
    expect(stageOfSkill(skill('brainstorming', 'spec'))).toBe('spec')
    expect(stageOfSkill(skill('working-in-steps', 'execute'))).toBe('execute')
    expect(stageOfSkill(skill('using-workflow'))).toBeUndefined()
    expect(stageOfSkill(skill('odd', 'draft'))).toBeUndefined()
    expect(stageOfSkill(undefined)).toBeUndefined()
  })

  it('stays unarmed without a staged-skill invocation: no event, empty section, no notice', async () => {
    const { agent, sections, step } = await mounted({ skills: [skill('using-workflow'), skill('brainstorming', 'spec')] })
    const decision = await step()
    expect(decision).toMatchObject({ kind: 'enter' })
    expect((decision as { messages: UserMessage[] }).messages).toHaveLength(0)
    expect(stageEvents(agent.session)).toHaveLength(0)
    expect(sections[0]?.text({ agent })).toBe('')
  })

  it('does not arm for a stageless invocation', async () => {
    const { agent, step } = await mounted({ skills: [skill('using-workflow'), skill('brainstorming', 'spec')] })
    addInvocation(agent, 'using-workflow')
    await step()
    expect(stageEvents(agent.session)).toHaveLength(0)
  })

  it('does not arm for an invocation the surface no longer shows', async () => {
    const { agent, step } = await mounted({ skills: [skill('brainstorming', 'spec')] })
    addInvocation(agent, 'brainstorming', { visible: false })
    await step()
    expect(stageEvents(agent.session)).toHaveLength(0)
  })

  it('arms silently at the first visible staged-skill invocation and renders the spec section', async () => {
    const { agent, sections, step } = await mounted({ skills: [skill('brainstorming', 'spec')] })
    addInvocation(agent, 'brainstorming')
    const decision = await step()
    expect((decision as { messages: UserMessage[] }).messages).toHaveLength(0)
    expect(stageEvents(agent.session)).toEqual([expect.objectContaining({ data: { stage: 'spec' } })])
    const section = sections[0]?.text({ agent })
    expect(section).toContain('spec stage')
    expect(section).toContain('SPEC.md')
    expect(section).toContain('/spec approve')
  })

  it('honors an approved SPEC.md as the file fallback', async () => {
    const { agent, controller, step } = await mounted({
      skills: [skill('brainstorming', 'spec')],
      spec: '# Spec\n\nStatus: approved\n\n- Goal: fix the thing\n',
    })
    addInvocation(agent, 'brainstorming')
    await step()
    expect(controller.stageOf(agent.session)).toBe('spec')
    const decision = await step()
    expect(controller.stageOf(agent.session)).toBe('execute')
    const notice = (decision as { messages: UserMessage[] }).messages.at(-1)
    expect(messageText(notice)).toContain('approved the spec')
  })

  it('keeps the spec stage while SPEC.md is a draft', async () => {
    const { agent, controller, step } = await mounted({
      skills: [skill('brainstorming', 'spec')],
      spec: '# Spec\n\nStatus: draft\n',
    })
    addInvocation(agent, 'brainstorming')
    await step()
    await step()
    expect(controller.stageOf(agent.session)).toBe('spec')
  })

  it('retires the brainstorming invocation at the flip and keeps the original in the log', async () => {
    const { agent, controller, step } = await mounted({
      skills: [skill('brainstorming', 'spec'), skill('working-in-steps', 'execute')],
      spec: 'Status: approved\n',
    })
    const invocationSeq = addInvocation(agent, 'brainstorming')
    const workingSeq = addInvocation(agent, 'working-in-steps')
    await step()
    await step()
    expect(controller.stageOf(agent.session)).toBe('execute')
    expect(visibleSeqs(agent.session).has(invocationSeq)).toBe(false)
    const events = agent.session.snapshotEvents()
    const retired = events.find(event => sourceOf(event)?.kind === 'skill-retired')
    expect(sourceOf(retired)?.name).toBe('brainstorming')
    expect(textOf(retired)).toContain('retired')
    // The shadowed original is still in the durable log.
    expect(events.some(event => event.seq === invocationSeq && sourceOf(event)?.kind === 'skill-invocation')).toBe(true)
    // The execute-stage invocation stays visible.
    expect(visibleSeqs(agent.session).has(workingSeq)).toBe(true)
  })

  it('/spec commits between turns and reports each outcome', async () => {
    const { agent, controller } = await mounted({ skills: [skill('brainstorming', 'spec')] })
    addInvocation(agent, 'brainstorming')
    expect(controller.select(agent, 'execute')).toBe('committed')
    expect(stageEvents(agent.session)).toEqual([expect.objectContaining({ data: { stage: 'execute' } })])
    expect(controller.select(agent, 'execute')).toBe('noop')
    expect(controller.select(agent, 'spec')).toBe('committed')
    expect(controller.select(agent, 'execute')).toBe('committed')
    // The between-turns commit injects its notice as a visible user message.
    const notice = agent.session.snapshotEvents().find(event => sourceOf(event)?.kind === 'workflow-stage')
    expect(textOf(notice)).toContain('approved the spec')
  })

  it('queues a /spec selection during an open turn and commits it at the next pre-step', async () => {
    const { agent, controller, step } = await mounted({ skills: [skill('brainstorming', 'spec')] })
    addInvocation(agent, 'brainstorming')
    await step()
    agent.session.append('turn/start', { turn: 2 })
    expect(controller.select(agent, 'execute')).toBe('queued')
    expect(stageEvents(agent.session)).toHaveLength(1)
    const decision = await step()
    expect(stageEvents(agent.session)).toHaveLength(2)
    const notice = (decision as { messages: UserMessage[] }).messages.at(-1)
    expect(messageText(notice)).toContain('approved the spec')
  })

  it('keeps a /spec reopen sticky against the still-approved SPEC.md', async () => {
    const { agent, controller, step } = await mounted({
      skills: [skill('brainstorming', 'spec')],
      spec: 'Status: approved\n',
    })
    addInvocation(agent, 'brainstorming')
    await step()
    await step()
    expect(controller.stageOf(agent.session)).toBe('execute')
    expect(controller.select(agent, 'spec')).toBe('committed')
    // The file still says approved; the reopened stage must survive it.
    await step()
    await step()
    expect(controller.stageOf(agent.session)).toBe('spec')
  })

  it('renders the execute section only after the flip', async () => {
    const { agent, sections, step } = await mounted({
      skills: [skill('brainstorming', 'spec')],
      spec: 'Status: approved\n',
    })
    addInvocation(agent, 'brainstorming')
    await step()
    expect(sections[0]?.text({ agent })).toContain('spec stage')
    await step()
    const section = sections[0]?.text({ agent })
    expect(section).toContain('execution stage')
    expect(section).toContain('test-driven-development')
    expect(section).not.toContain('spec stage')
  })
})
