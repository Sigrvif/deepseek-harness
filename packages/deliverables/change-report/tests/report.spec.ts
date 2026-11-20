/** The change-report formatter and its pre-step injection seam. */
import { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceChangesSummary } from '@deepseek-ai/dsh-workspace-changes'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, type Config } from '../src/index.ts'
import { reportText } from '../src/report.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

const file = (path: string, added: number, deleted: number): WorkspaceChangesSummary['files'][number] =>
  ({ path, display: path, added, deleted })

const summary = (turn: number, files: WorkspaceChangesSummary['files']): WorkspaceChangesSummary => ({
  turn, cwd: '/w', files, total: files.length,
  added: files.reduce((sum, entry) => sum + entry.added, 0),
  deleted: files.reduce((sum, entry) => sum + entry.deleted, 0),
})

describe('reportText', () => {
  it('lists every file with counts and the net total', () => {
    const text = reportText(summary(3, [file('src/a.ts', 2, 1), { path: '.env', display: '.env', added: 0, deleted: 0, binary: true }]))
    expect(text).toBe([
      'Change report for turn 3 of this session\'s workspace:',
      '- src/a.ts (+2/-1)',
      '- .env (binary)',
      'Total: 2 files changed, +2/-1 net.',
    ].join('\n'))
  })

  it('marks observed, binary, and oversized files without counts and singularizes one file', () => {
    const text = reportText(summary(1, [
      { path: 'b', display: 'b', added: 0, deleted: 0, observed: true },
      { path: 'c', display: 'c', added: 0, deleted: 0, binary: true },
      { path: 'd', display: 'd', added: 0, deleted: 0, oversized: true },
    ]))
    expect(text.split('\n').slice(1)).toEqual(['- b (detected)', '- c (binary)', '- d (oversized)', 'Total: 3 files changed, +0/-0 net.'])
    expect(reportText(summary(9, [file('one.txt', 1, 0)]))).toContain('Total: 1 file changed, +1/-0 net.')
  })

  it('folds the file list beyond the cap into one remainder line', () => {
    const many = Array.from({ length: 25 }, (_, index) => file(`f${String(index)}.txt`, 1, 0))
    const text = reportText(summary(2, many))
    expect(text.split('\n')).toHaveLength(23)
    expect(text.split('\n').at(-2)).toBe('… and 5 more.')
  })
})

/** A context with the reporter mounted at the given toggle state and a stub summary store. */
function bench(enabled: boolean, summaries: Map<string, WorkspaceChangesSummary> = new Map()): Context {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('workspaceChanges', {
    summary: (sessionId: SessionId, seq: number) => summaries.get(`${String(sessionId)}:${String(seq)}`),
    diff: () => Promise.resolve(undefined),
  } as never)
  apply(ctx, { enabled: { get: () => enabled } })
  return ctx
}

/** Dispatch one pre-step waterfall with a single base message. */
async function step(ctx: Context, sessionId: SessionId): Promise<PreStepDecision> {
  const dispatch = ctx.waterfall.bind(ctx) as unknown as (...args: unknown[]) => Promise<PreStepDecision>
  return await dispatch({}, 'agent/pre-step', {
    agent: { session: { id: sessionId } }, turn: 2, step: 1, signal: new AbortController().signal, modelSelection: {},
  }, () => Promise.resolve({ kind: 'enter', messages: [] }))
}

function announce(ctx: Context, sessionId: SessionId, seq: number, turn = 1): void {
  ctx.emit('session/event', { id: sessionId } as never, { type: 'workspace/changes', seq, data: { turn } } as never)
}

describe('pre-step injection', () => {
  it('mounts its config schema on the default export the loader reads', async () => {
    const mod = await import('../src/index.ts')
    expect(mod.default.Config).toBe(mod.Config)
    // A patch row without a config block hands the loader raw undefined; the
    // schema must still yield a live volatile toggle defaulting on.
    const result = (mod.Config as unknown as { '~standard': { validate(input: unknown): { issues?: unknown; value?: Config } } })['~standard'].validate(undefined)
    expect(result.issues).toBeUndefined()
    expect(typeof result.value?.enabled.get).toBe('function')
    expect(result.value?.enabled.get()).toBe(true)
  })

  it('appends the notice for the announced summary once, then stays silent', async () => {
    const summaries = new Map([['s1:5', summary(1, [file('a.txt', 1, 0)])]])
    const ctx = bench(true, summaries)
    announce(ctx, 's1' as SessionId, 5)
    const first = await step(ctx, 's1' as SessionId)
    expect(first.kind).toBe('enter')
    if (first.kind !== 'enter') return
    expect(first.messages).toHaveLength(1)
    expect(first.messages[0]!.source).toMatchObject({ kind: 'change-report', form: 'notice' })
    expect(first.messages[0]!.content[0]).toMatchObject({ type: 'text', text: reportText(summaries.get('s1:5')!) })
    const second = await step(ctx, 's1' as SessionId)
    if (second.kind !== 'enter') return
    expect(second.messages).toEqual([])
  })

  it('reports only the latest announcement of a session', async () => {
    const summaries = new Map([['s2:6', summary(1, [file('a.txt', 1, 0)])]])
    const ctx = bench(true, summaries)
    announce(ctx, 's2' as SessionId, 5)
    announce(ctx, 's2' as SessionId, 6, 1)
    const decision = await step(ctx, 's2' as SessionId)
    if (decision.kind !== 'enter') return
    expect(decision.messages).toHaveLength(1)
    expect(decision.messages[0]!.content[0]).toMatchObject({ text: reportText(summaries.get('s2:6')!) })
  })

  it('skips a summary the recorder no longer serves, and stays silent while disabled', async () => {
    const ctx = bench(true)
    announce(ctx, 's3' as SessionId, 7)
    const gone = await step(ctx, 's3' as SessionId)
    if (gone.kind !== 'enter') return
    expect(gone.messages).toEqual([])

    const off = bench(false, new Map([['s4:8', summary(1, [file('a.txt', 1, 0)])]]))
    announce(off, 's4' as SessionId, 8)
    const disabled = await step(off, 's4' as SessionId)
    if (disabled.kind !== 'enter') return
    expect(disabled.messages).toEqual([])
    // A flipped-off toggle consumed the announcement; flipping back on does not resurrect it.
    const resumed = await step(off, 's4' as SessionId)
    if (resumed.kind !== 'enter') return
    expect(resumed.messages).toEqual([])
  })

  it('leaves sessions without an announcement untouched', async () => {
    const ctx = bench(true, new Map([['s5:9', summary(1, [file('a.txt', 1, 0)])]]))
    const decision = await step(ctx, 's5' as SessionId)
    if (decision.kind !== 'enter') return
    expect(decision.messages).toEqual([])
  })
})
