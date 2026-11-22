/** The automatic superpowers bootstrap on agent/pre-step. */
import { Context } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile, type Volatile } from '@deepseek-ai/cosmokit'
import { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SkillDefinition, SkillRegistry } from '@deepseek-ai/dsh-skill'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import { BOOTSTRAP_SKILL, apply, default as plugin, type Config } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

const SIGNAL = new AbortController().signal

/** A minimal loaded skill matching what the filesystem provider returns. */
function skill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: BOOTSTRAP_SKILL,
    path: '/skills/using-workflow/SKILL.md',
    description: 'Use when starting any conversation',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: 'filesystem',
    resourceBase: { kind: 'directory', path: '/skills/using-workflow' },
    content: 'test content\nInvoke relevant skills BEFORE any response.',
    ...overrides,
  }
}

function prompt(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

/**
 * A session stub over a mutable log: tests grow it with `addInvocation` (the
 * persisted skill-invocation event the real listener writes) and control
 * what the surface still shows, which is exactly the state the once-per-
 * session gate reads.
 */
function stubSession() {
  const events: Array<Record<string, unknown>> = []
  const visible = new Set<number>()
  const session = {
    id: 's',
    snapshotEvents: () => events,
    surface: { nodes: visible },
  }
  const addInvocation = (seq: number, options: { visible?: boolean; excluded?: boolean } = {}) => {
    events.push({
      seq, type: 'user/message',
      data: { source: { kind: 'skill-invocation', name: BOOTSTRAP_SKILL, form: 'instructions' }, content: [] },
    })
    if (options.excluded === true) {
      // A Context Editor replacement shadowing the invocation: the user's
      // edit wins over the bootstrap either way.
      events.push({
        seq: seq + 1, type: 'user/message',
        surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq },
        data: { contextEdit: { mode: 'excluded' } },
      })
    } else if (options.visible !== false) {
      visible.add(seq)
    }
    return session
  }
  return { session, events, visible, addInvocation }
}

async function mounted(options: {
  enabled?: boolean
  /** The registry's answer for `using-workflow`; null means the skill is missing. */
  skill?: SkillDefinition | null
  session?: ReturnType<typeof stubSession>['session']
} = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const definition = options.skill === undefined ? skill() : options.skill
  ctx.provide('skills', {
    get: (name: string) => Promise.resolve(name === BOOTSTRAP_SKILL && definition !== null ? definition : undefined),
  } as unknown as SkillRegistry)
  ctx.provide('workingDirectory', { ensure: () => Promise.resolve('/workspace') })
  const auto: Volatile<boolean> = createVolatile(options.enabled ?? true)
  apply(ctx, { autoUsingSuperpowers: auto } satisfies Config)
  const agent = { session: options.session ?? stubSession().session } as unknown as Agent
  const step = (messages: UserMessage[]) =>
    agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'p', model: 'm' }, messages, turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: [...messages] }),
    )
  return { ctx, step, auto }
}

function entered(decision: PreStepDecision): { kind: 'enter'; messages: UserMessage[] } {
  if (decision.kind !== 'enter') throw new Error(`expected enter decision, got ${decision.kind}`)
  return decision
}

describe('superpowers-bootstrap', () => {
  it('injects the using-workflow body on the first fresh user prompt', async () => {
    const { step } = await mounted()
    const decision = entered(await step([prompt('Fix the login bug')]))
    expect(decision.messages).toHaveLength(2)
    const injected = decision.messages[1]!
    expect((injected.source as { kind?: string }).kind).toBe('skill-invocation')
    expect((injected.source as { name?: string }).name).toBe(BOOTSTRAP_SKILL)
    expect((injected.source as { form?: string }).form).toBe('instructions')
    expect(injected.content[0]).toMatchObject({ type: 'text' })
    expect((injected.content[0] as { text: string }).text).toContain('<skill_content name="using-workflow">')
  })

  it('injects once per session, not again while the invocation stays visible', async () => {
    const state = stubSession()
    const { step } = await mounted({ session: state.session })
    expect(entered(await step([prompt('Task one')])).messages).toHaveLength(2)
    // The turn persisted; the second prompt of the same session sees the
    // invocation already in the visible surface and carries nothing extra.
    state.addInvocation(5)
    expect(entered(await step([prompt('Task two')])).messages).toHaveLength(1)
    expect(entered(await step([prompt('Task three')])).messages).toHaveLength(1)
  })

  it('re-asserts once when a compaction drops the invocation from the surface', async () => {
    const state = stubSession()
    const { step } = await mounted({ session: state.session })
    // Same log, but a compaction checkpoint shadowed the invocation out of
    // the visible surface: the next prompt re-asserts the bootstrap.
    state.addInvocation(5, { visible: false })
    expect(entered(await step([prompt('After compaction')])).messages).toHaveLength(2)
  })

  it('respects a Context Editor exclusion of the invocation', async () => {
    const state = stubSession()
    const { step } = await mounted({ session: state.session })
    state.addInvocation(5, { excluded: true })
    expect(entered(await step([prompt('Task')])).messages).toHaveLength(1)
  })

  it('does not inject on a continuation step without a fresh user message', async () => {
    const { step } = await mounted()
    const decision = entered(await step([]))
    expect(decision.messages).toHaveLength(0)
  })

  it('treats non-user claimed sources as continuations', async () => {
    const { step } = await mounted()
    const catalog = createUserMessage({
      content: [{ type: 'text', text: '<system-reminder>catalog</system-reminder>' }],
      source: { kind: 'skill-catalog', form: 'catalog', entries: [] },
    })
    const decision = entered(await step([catalog]))
    expect(decision.messages).toHaveLength(1)
  })

  it('stays silent when the volatile toggle is off, and fires again after it flips on', async () => {
    const { step, auto } = await mounted({ enabled: false })
    expect(entered(await step([prompt('Task one')])).messages).toHaveLength(1)
    updateVolatile(auto, createVolatile(true))
    const decision = entered(await step([prompt('Task two')]))
    expect(decision.messages).toHaveLength(2)
    expect((decision.messages[1]!.source as { kind?: string }).kind).toBe('skill-invocation')
  })

  it('stays silent when the skill is missing from the registry', async () => {
    const { step } = await mounted({ skill: null })
    expect(entered(await step([prompt('Task')])).messages).toHaveLength(1)
  })

  it('stays silent when the skill is not user-invocable', async () => {
    const { step } = await mounted({ skill: skill({ invocation: { modelInvocable: true, userInvocable: false } }) })
    expect(entered(await step([prompt('Task')])).messages).toHaveLength(1)
  })

  it('stays silent when the user already invoked the skill themselves', async () => {
    const { step } = await mounted()
    const decision = entered(await step([prompt('/using-workflow then fix the login bug')]))
    expect(decision.messages).toHaveLength(1)
  })

  it('ignores gesture-shaped text that is not the bootstrap skill', async () => {
    const { step } = await mounted()
    const decision = entered(await step([prompt('/brainstorming a new feature')]))
    expect(decision.messages).toHaveLength(2)
  })

  it('does not treat paths or fractions as the gesture', async () => {
    const { step } = await mounted()
    const decision = entered(await step([prompt('read /usr/bin/env and 5/8 of the files')]),
    )
    expect(decision.messages).toHaveLength(2)
  })

  it('passes a reject decision through untouched', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('skills', { get: () => Promise.resolve(skill()) } as unknown as SkillRegistry)
    ctx.provide('workingDirectory', { ensure: () => Promise.resolve('/workspace') })
    apply(ctx, { autoUsingSuperpowers: createVolatile(true) } satisfies Config)
    const decision = await agentEvents(ctx, { session: stubSession().session } as unknown as Agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'p', model: 'm' }, messages: [prompt('Task')], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'reject' as const }),
    )
    expect(decision).toEqual({ kind: 'reject' })
  })

  it('resolves its default config when mounted through cordis without one', async () => {
    // Regression: the loader mounts the default export; a default export
    // without the Config static left `config` undefined and the first
    // prompt died reading `autoUsingSuperpowers` of undefined (found on the
    // wire in the offline bundle, where the patch row carries no config).
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('skills', { get: () => Promise.resolve(skill()) } as unknown as SkillRegistry)
    ctx.provide('workingDirectory', { ensure: () => Promise.resolve('/workspace') })
    await ctx.plugin(plugin).await()
    const decision = entered(await agentEvents(ctx, { session: stubSession().session } as unknown as Agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'p', model: 'm' }, messages: [prompt('Task')], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] as UserMessage[] }),
    ))
    expect(decision.messages).toHaveLength(1)
    expect((decision.messages[0]!.source as { kind?: string }).kind).toBe('skill-invocation')
  })
})
