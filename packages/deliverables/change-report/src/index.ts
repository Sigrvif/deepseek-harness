/**
 * @deepseek-ai/dsh-change-report — per-turn files-changed notices telling the
 * model what its last turn changed in the workspace (fork addition).
 *
 * The workspace-changes plugin announces each turn's summary through a
 * `workspace/changes` Session event, but only the Web UI reads it — the model
 * itself never learns what it touched. This plugin closes that loop on the
 * agent/pre-step seam in the job-sentinel style: the announcement is held as
 * pending, and when the session is about to step anyway (never waking an idle
 * session), one compact notice joins the step's messages. The volatile
 * `enabled` toggle (default on) is read per fire — flipping it on the General
 * settings page takes effect on the next step without remounting, for small
 * models that the extra context would only confuse.
 *
 * Surfaced on the General settings page by
 * `@deepseek-ai/dsh-client-ui-fork-change-report`.
 * @module @deepseek-ai/dsh-change-report
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-workspace-changes'
import z from '@deepseek-ai/schemastery'
import { reportMessage } from './report.ts'

export { REPORT_FILE_CAP, reportMessage, reportText } from './report.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'change-report': { kind: 'change-report' } & ContextFormed
  }
}

/** Runtime toggle projected to the browser. */
export interface Config {
  /** Report each announced turn's changed files to the model at its next step. */
  enabled: Volatile<boolean>
}

/** Live toggle; new installations default it ON. */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
})

/** Stable Cordis plugin name; also the settings namespace id. */
export const name = 'change-report'

/** Required services: the recorder whose summaries are reported. */
export const inject = ['workspaceChanges']

/**
 * Mount the per-turn change reporter.
 * @param ctx - host context with the `workspaceChanges` service.
 * @param config - validated config.
 */
export function apply(ctx: Context, config: Config): void {
  // The latest unreported announcement per session; the summary itself is
  // fetched lazily at step time, because the recorder stores it only after
  // the event listeners run.
  const pending = new Map<string, { seq: number; turn: number }>()
  ctx.on('session/event', (session, event) => {
    if (event.type === 'workspace/changes') pending.set(String(session.id), { seq: event.seq, turn: event.data.turn })
  })
  ctx.on('session/disposed', (session) => { pending.delete(String(session.id)) })
  ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const key = String(agent.session.id)
    const announcement = pending.get(key)
    if (announcement === undefined) return decision
    pending.delete(key)
    if (!config.enabled.get()) return decision
    const summary = ctx.workspaceChanges.summary(agent.session.id, announcement.seq)
    if (summary === undefined || summary.files.length === 0) return decision
    return { ...decision, messages: [...decision.messages, reportMessage(summary)] }
  })
  // The General page owns this preference's UI; suppress an auto-generated
  // duplicate page the way ui-settings does for the developer-tools toggle.
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}

// fork(deliverables): the loader mounts `exports.default` and reads the config
// schema off it — without `Config` here the runtime mounts schema-less, the
// volatile toggle never binds, and the raw undefined config crashes the first
// pre-step after an announcement (found in the 2.4.29 browser pass).
/** Cordis loader shape: the plugin name, required services, config schema, and the {@link apply} mount. */
export default { name, inject, Config, apply }
