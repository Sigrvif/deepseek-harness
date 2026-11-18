/**
 * Still-running job reports: per-step notices telling the model which of its
 * background processes survive.
 *
 * fork(job-sentinel): the registry already reports settlements (tool-jobs'
 * completion notices) and the system prompt tells the model to poll — but a
 * model that started a long command, moved on, and forgot, never hears about
 * the survivor. This plugin closes that loop on the agent/pre-step seam: when
 * the agent is about to step anyway (never waking an idle session), and at
 * least one of its jobs has been running past `minAgeMs`, one compact notice
 * lists the survivors (kind, command, pid, runtime, job id). The cadence
 * re-reports at most every `minIntervalMs` per session, so an intentionally
 * long dev server costs one line per twenty minutes, not a per-step flood.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { JobEvent, JobId, JobRegistry, JobView } from '@deepseek-ai/dsh-jobs'
import type { ContextFormed, UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Config } from './config.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'job-sentinel': { kind: 'job-sentinel' } & ContextFormed
  }
}

/** Longest command label rendered per row before truncation. */
const LABEL_MAX_CHARS = 80

/**
 * The registry's live-job state, as the sentinel sees it. `stopping` jobs are
 * still live (the kill is in flight) and stay listed with that marker.
 */
interface SentinelState {
  /** Latest view per job id; `registered`/`progress` refresh, `settled`/`removed` drop. */
  readonly live: Map<JobId, JobView>
  /** Epoch ms of the last report per session id; absent until the first one. */
  readonly lastNotice: Map<string, number>
}

function truncateLabel(label: string): string {
  const flat = label.replace(/\s+/gu, ' ').trim()
  return flat.length <= LABEL_MAX_CHARS ? flat : `${flat.slice(0, LABEL_MAX_CHARS - 1)}…`
}

/** Humanized elapsed time: `34s`, `14m`, `3h 05m`. */
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 1) return `${Math.max(1, Math.floor(ms / 1_000))}s`
  const hours = Math.floor(totalMinutes / 60)
  if (hours < 1) return `${totalMinutes}m`
  return `${hours}h ${String(totalMinutes % 60).padStart(2, '0')}m`
}

/**
 * The pid the producer published as its progress line (`pid 1234`, optionally
 * with a suffix such as `(processes remain)`), when present.
 */
function pidOf(view: JobView): string | undefined {
  if (view.progress === undefined) return undefined
  const match = /^pid (\d+)/u.exec(view.progress)
  return match === null ? undefined : `pid ${match[1] as string}`
}

function noticeText(session: string, views: readonly JobView[], now: number): string {
  const lines = views.map((view) => {
    const pid = pidOf(view)
    const runtime = formatDuration(now - view.startedAt)
    const stopping = view.status === 'stopping' ? ' (stopping)' : ''
    const pidPart = pid === undefined ? '' : ` — ${pid}`
    return `- [${view.kind}] ${truncateLabel(view.label)}${pidPart} — running ${runtime}${stopping} — job ${String(view.id)}`
  })
  return [
    'Still-running background processes in this session (started earlier, not finished):',
    ...lines,
    `If one of these is not supposed to run any more, stop it with job_kill; an intentionally long-running process can simply be ignored. (job-sentinel, session ${session})`,
  ].join('\n')
}

function noticeMessage(session: string, views: readonly JobView[], now: number): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: noticeText(session, views, now) }],
    source: {
      kind: 'job-sentinel',
      form: 'notice',
      summary: `${views.length} background process${views.length === 1 ? '' : 'es'} still running`,
    },
  })
}

/**
 * Decide whether this step carries a report, and advance the cadence state.
 * @param state - per-plugin live map and cadence memory.
 * @param sessionId - the stepping agent's owning session.
 * @param config - resolved thresholds.
 * @param now - epoch ms of this step.
 * @returns the still-old live views of this session, or undefined for silence.
 */
function decide(
  state: SentinelState,
  sessionId: SessionId,
  config: Config,
  now: number,
): JobView[] | undefined {
  const old = [...state.live.values()]
    .filter(view => view.owner === sessionId && now - view.startedAt >= config.minAgeMs)
  if (old.length === 0) return undefined
  const last = state.lastNotice.get(String(sessionId))
  if (last !== undefined && now - last < config.minIntervalMs) return undefined
  state.lastNotice.set(String(sessionId), now)
  return old
}

/**
 * Install the still-running reporter on a context.
 * @param ctx - plugin context; the `jobs` registry supplies the event stream.
 * @param config - resolved thresholds.
 * @returns disposer removing the listener and the event subscription.
 */
export function installSentinel(ctx: Context, config: Config): () => void {
  const state: SentinelState = { live: new Map(), lastNotice: new Map() }
  const registry = ctx.get('jobs') as JobRegistry
  const unsubscribe = registry.events.subscribe({ owners: 'all' }, (event: JobEvent): void => {
    if (event.type === 'registered' || event.type === 'progress' || event.type === 'stopping') {
      if (event.job.finishedAt === undefined) state.live.set(event.job.id, event.job)
      else state.live.delete(event.job.id)
      return
    }
    if (event.type === 'settled' || event.type === 'removed') state.live.delete(event.job.id)
  })
  const disposeListener = ctx.on('agent/pre-step', async (
    { agent, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const now = Date.now()
    const views = decide(state, agent.session.id, config, now)
    if (views === undefined) return decision
    return { ...decision, messages: [...decision.messages, noticeMessage(String(agent.session.id), views, now)] }
  })
  return () => {
    disposeListener()
    unsubscribe()
  }
}
