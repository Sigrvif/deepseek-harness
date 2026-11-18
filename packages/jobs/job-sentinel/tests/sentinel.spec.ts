/** Still-running reports on agent/pre-step. */
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { JobId, type JobEvent, type JobEventListener, type JobRegistry, type JobView } from '@deepseek-ai/dsh-jobs'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import { installSentinel } from '../src/sentinel.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

const CONFIG = resolveConfig({ minAgeMs: 100, minIntervalMs: 300 })

const SIGNAL = new AbortController().signal

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

function view(overrides: Partial<JobView> & { startedAt: number }): JobView {
  return {
    id: JobId('bash-1'),
    kind: 'bash',
    label: 'sleep 600',
    status: 'running',
    output: { total: 0, earliest: 0 },
    ...overrides,
  }
}

/** A context with a counting fake registry, a fire() for its events, and a pre-step driver. */
async function bench() {
  const ctx = new Context()
  contexts.push(ctx)
  const fired: JobEvent[] = []
  let listener: JobEventListener | undefined
  let unsubscribed = false
  ctx.provide('jobs', {
    events: {
      subscribe: (_filter: unknown, registered: JobEventListener) => {
        listener = registered
        return () => { unsubscribed = true }
      },
    },
  } as unknown as JobRegistry)
  const fire = (event: JobEvent): void => { fired.push(event); listener?.(event) }
  const step = async (session: Session): Promise<PreStepDecision> =>
    agentEvents(ctx, { session } as unknown as Agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'p', model: 'm' }, messages: [], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] as UserMessage[] }),
    )
  const enter = (decision: PreStepDecision): UserMessage[] => {
    if (decision.kind !== 'enter') throw new Error(`expected enter decision, got ${decision.kind}`)
    return decision.messages
  }
  return { ctx, fire, fired, step, enter, isUnsubscribed: () => unsubscribed }
}

describe('installSentinel', () => {
  it('stays silent with no live jobs', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    expect(b.enter(await b.step(Session.create(SessionId('sentinel-a'))))).toHaveLength(0)
  })

  it('stays silent while the only job is younger than minAgeMs', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    b.fire({ type: 'registered', job: view({ owner: SessionId('sentinel-b'), startedAt: Date.now() - 10 }) })
    expect(b.enter(await b.step(Session.create(SessionId('sentinel-b'))))).toHaveLength(0)
  })

  it('reports one old job with pid, runtime, and the job_kill hint', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    b.fire({
      type: 'registered',
      job: view({ owner: SessionId('sentinel-c'), startedAt: Date.now() - 200, progress: 'pid 4242' }),
    })
    const messages = b.enter(await b.step(Session.create(SessionId('sentinel-c'))))
    expect(messages).toHaveLength(1)
    const text = JSON.stringify(messages)
    expect(text).toContain('Still-running background processes')
    expect(text).toContain('sleep 600')
    expect(text).toContain('pid 4242')
    expect(text).toContain('bash-1')
    expect(text).toContain('job_kill')
  })

  // fork(context-editor): a settled command's surviving processes keep their job
  // alive with a suffixed progress line (2.4.30); the pid still leads the notice.
  it('reports a survivor job whose progress line carries the processes-remain suffix', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    b.fire({
      type: 'registered',
      job: view({ owner: SessionId('sentinel-c'), startedAt: Date.now() - 200, progress: 'pid 4242 (processes remain)' }),
    })
    const messages = b.enter(await b.step(Session.create(SessionId('sentinel-c'))))
    expect(messages).toHaveLength(1)
    const text = JSON.stringify(messages)
    expect(text).toContain('pid 4242')
    expect(text).not.toContain('(processes remain)')
  })

  it('keeps the per-session interval before reporting again', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    b.fire({ type: 'registered', job: view({ owner: SessionId('sentinel-d'), startedAt: Date.now() - 200 }) })
    const session = Session.create(SessionId('sentinel-d'))
    expect(b.enter(await b.step(session))).toHaveLength(1)
    expect(b.enter(await b.step(session))).toHaveLength(0)
    await sleep(320)
    expect(b.enter(await b.step(session))).toHaveLength(1)
  })

  it('does not report another session’s jobs', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    b.fire({ type: 'registered', job: view({ owner: SessionId('sentinel-other'), startedAt: Date.now() - 60_000 }) })
    expect(b.enter(await b.step(Session.create(SessionId('sentinel-e'))))).toHaveLength(0)
  })

  it('drops a settled job from the report', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    const job = view({ owner: SessionId('sentinel-f'), startedAt: Date.now() - 60_000 })
    b.fire({ type: 'registered', job })
    const session = Session.create(SessionId('sentinel-f'))
    expect(b.enter(await b.step(session))).toHaveLength(1)
    b.fire({ type: 'settled', job: { ...job, status: 'completed' as const, finishedAt: Date.now() }, cause: 'producer' as const, awaited: false })
    expect(b.enter(await b.step(session))).toHaveLength(0)
  })

  it('keeps a stopping job listed with the stopping marker', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    b.fire({ type: 'stopping', job: view({ owner: SessionId('sentinel-g'), startedAt: Date.now() - 60_000, status: 'stopping' }) })
    const text = JSON.stringify(b.enter(await b.step(Session.create(SessionId('sentinel-g')))))
    expect(text).toContain('stopping')
  })

  it('omits the pid when the producer published none', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    b.fire({ type: 'registered', job: view({ owner: SessionId('sentinel-h'), startedAt: Date.now() - 60_000 }) })
    const text = JSON.stringify(b.enter(await b.step(Session.create(SessionId('sentinel-h')))))
    expect(text).not.toContain('pid ')
    expect(text).toContain('sleep 600')
  })

  it('does not report unowned (host-internal) jobs', async () => {
    const b = await bench()
    installSentinel(b.ctx, CONFIG)
    b.fire({ type: 'registered', job: view({ startedAt: Date.now() - 60_000 }) })
    expect(b.enter(await b.step(Session.create(SessionId('sentinel-i'))))).toHaveLength(0)
  })

  it('unsubscribes on dispose', async () => {
    const b = await bench()
    const dispose = installSentinel(b.ctx, CONFIG)
    expect(b.isUnsubscribed()).toBe(false)
    dispose()
    expect(b.isUnsubscribed()).toBe(true)
  })

  it('mounts nothing when disabled', async () => {
    const b = await bench()
    let subscribed = 0
    // A second fake on a fresh context: apply() resolves the registry itself.
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('jobs', {
      events: { subscribe: () => { subscribed += 1; return () => {} } },
    } as unknown as JobRegistry)
    const { apply } = await import('../src/index.ts')
    apply(ctx, { enabled: false, minAgeMs: 100, minIntervalMs: 300 })
    expect(subscribed).toBe(0)
    // The unused bench context keeps afterEach disposal symmetric.
    void b
  })

  it('rejects an interval smaller than the age', () => {
    expect(() => resolveConfig({ minAgeMs: 1000, minIntervalMs: 500 })).toThrow(TypeError)
  })
})
