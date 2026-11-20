/**
 * @deepseek-ai/dsh-superpowers-bootstrap — automatic superpowers bootstrap.
 *
 * fork(superpowers): loads the bundled `using-superpowers` skill once per
 * session — on the first fresh user prompt that has no visible invocation
 * already — exactly as if the user had typed `/using-superpowers` themselves,
 * so the workflow discipline reaches the users who would forget to invoke it
 * without re-sending the body on every turn of a long back-and-forth. If a
 * later compaction drops the invocation out of the model's visible surface,
 * the next prompt re-asserts it once; a Context Editor exclusion of the
 * invocation is respected and does not re-trigger. The skills themselves live
 * in `@deepseek-ai/dsh-superpowers-skills` (vendored from superpowers 7.0.1,
 * MIT — see that package's README); this plugin only decides whether the
 * bootstrap fires.
 *
 * The toggle is a volatile config field projected into the settings system as
 * the `superpowers-bootstrap` namespace, surfaced on the General settings
 * page by `@deepseek-ai/dsh-client-ui-fork-auto-skills`. Volatile writes
 * commit into the stable reference without remounting, so the gate is read
 * per fire and a flip takes effect on the next prompt.
 *
 * @module @deepseek-ai/dsh-superpowers-bootstrap
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionSeq, UserMessage } from '@deepseek-ai/dsh-session'
import { contextEditShadowedSeqs } from '@deepseek-ai/dsh-session/surface'
import {
  isUserInvocable,
  renderSkillContent,
  type SkillInvocationSource,
} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-working-directory'
import z from '@deepseek-ai/schemastery'

/** Stable Cordis plugin name; also the settings namespace id. */
export const name = 'superpowers-bootstrap'

/** Required services: the skill registry and the per-agent working directory. */
export const inject = ['skills', 'workingDirectory']

/** The skill every session is bootstrapped with. */
export const BOOTSTRAP_SKILL = 'using-superpowers'

/** Runtime toggle projected to the browser. */
export interface Config {
  /** Keep the using-superpowers skill loaded in every session. */
  autoUsingSuperpowers: Volatile<boolean>
}

/** Live toggle; new installations default it on. */
export const Config = z.object({
  autoUsingSuperpowers: z.boolean().default(true).volatile(),
})

/**
 * A whitespace-bounded `/using-superpowers` token, the same shape tool-skill's
 * gesture scan uses, so an explicit invocation in the same prompt suppresses
 * the automatic one instead of doubling it.
 */
const EXPLICIT_GESTURE = /(^|\s)\/using-superpowers(?=\s|$)/

/**
 * Whether the claimed batch carries at least one direct user message. A turn's
 * first step claims the user's prompt; continuation steps claim only tool
 * results, so the bootstrap decision runs once per prompt, not per model call.
 * @param messages - the step's claimed batch.
 * @returns whether a fresh user prompt begins this step.
 */
function hasFreshPrompt(messages: readonly UserMessage[]): boolean {
  return messages.some(message => (message.source as { kind?: unknown }).kind === 'user')
}

/**
 * Whether the user already invoked the bootstrap skill themselves in this
 * prompt; their gesture wins and tool-skill injects the same body.
 * @param messages - the step's claimed batch.
 * @returns whether any text block names the skill with the `/name` gesture.
 */
function explicitlyInvoked(messages: readonly UserMessage[]): boolean {
  for (const message of messages) {
    if ((message.source as { kind?: unknown }).kind !== 'user') continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      if (EXPLICIT_GESTURE.test(block.text)) return true
    }
  }
  return false
}

/** The latest persisted `using-superpowers` invocation in the session log, if any. */
function latestInvocation(events: readonly SessionEvent[]): SessionEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.type !== 'user/message') continue
    const source = (event.data as { source?: { kind?: unknown; name?: unknown } }).source
    if (source?.kind === 'skill-invocation' && source.name === BOOTSTRAP_SKILL) return event
  }
  return undefined
}

/**
 * Whether the session already shows the bootstrap to the model. Absent means
 * inject; present but shadowed by a Context Editor replacement means the
 * user's edit wins; present and visible means nothing to do; present but
 * NOT visible means a compaction summarized it away — the one case that
 * re-asserts, so compression can silently drop the discipline.
 * @param agent - the agent whose session log and surface are read.
 * @returns whether the session still carries a visible invocation.
 */
function sessionCarriesBootstrap(agent: Agent): boolean {
  const session = agent.session
  const events = session.snapshotEvents()
  const last = latestInvocation(events)
  if (last === undefined) return false
  const shadowed = contextEditShadowedSeqs(events.map(event => ({ event })))
  if (shadowed.has(Number(last.seq))) return true
  const visible = new Set<SessionSeq>(session.surface.nodes)
  return visible.has(last.seq)
}

/**
 * Mount the bootstrap listener. Registration happens once; the volatile
 * toggle, skill availability, gesture suppression, and the once-per-session
 * history check are all decided per fire, so toggling, uninstalling, or
 * shadowing the skill all take effect without remounting.
 * @param ctx - host context carrying the skill registry and working directory.
 * @param config - plugin config; the volatile reference is read on every step.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('agent/pre-step', async (
    { agent, messages, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    if (config.autoUsingSuperpowers.get() !== true) return decision
    if (!hasFreshPrompt(messages) || explicitlyInvoked(messages)) return decision
    signal.throwIfAborted()
    if (sessionCarriesBootstrap(agent)) return decision
    const cwd = await ctx.workingDirectory.ensure(agent, signal)
    const skill = await ctx.skills.get(BOOTSTRAP_SKILL, { cwd, signal, scope: agent })
    // A missing, unreadable, or user-disabled skill stays silent: the
    // bootstrap must never fail a turn that would have worked without it.
    if (skill === undefined || !isUserInvocable(skill)) return decision
    const source: SkillInvocationSource = {
      kind: 'skill-invocation',
      name: BOOTSTRAP_SKILL,
      form: 'instructions',
    }
    return {
      ...decision,
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text: renderSkillContent(skill) }],
        source,
      })],
    }
  })
  // The General page owns this preference's UI; suppress an auto-generated
  // duplicate page the way ui-settings does for the developer-tools toggle.
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}

/** Cordis loader shape: the plugin name, required services, config schema, and the {@link apply} mount. */
export default { name, inject, Config, apply }
