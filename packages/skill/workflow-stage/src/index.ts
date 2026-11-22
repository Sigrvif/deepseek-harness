/**
 * @deepseek-ai/dsh-workflow-stage — stage tracking for the bundled workflow skills.
 *
 * fork(workflow-stage, 2.4.36): the bundled workflow skills are a pipeline —
 * brainstorming owns the spec stage; working-in-steps, test-driven-development,
 * systematic-debugging, and verification-before-completion own execution — and
 * small models follow it best when the context carries only the stage they are
 * in. This plugin records the session's stage in the durable log (`workflow/
 * stage`; the last event wins) and, while the workflow is armed:
 *
 * 1. renders a per-stage discipline section in every request (`workflow:stage`),
 * 2. lets tool-skill narrow the skill catalog and the `skill` tool to the
 *    current stage — the stage is read straight from the session log, so no
 *    service couples the two plugins (skills tag themselves with frontmatter
 *    `metadata: { stage: … }`; untagged skills and an unarmed session keep
 *    today's full catalog), and
 * 3. retires spec-stage instruction bodies from the visible surface the moment
 *    the spec is approved — a Context-Editor-style replace over the invocation
 *    leaves a one-line tombstone, so the earlier stage's instructions stop
 *    occupying context instead of riding pinned forever.
 *
 * The workflow arms itself at the first pre-step that sees a visible invocation
 * of a stage-tagged skill (a bootstrap-only session stays unarmed), and the
 * spec is approved either by the user's `/spec` command or by the SPEC.md
 * convention the skills themselves write (`Status: approved`). The durable log
 * keeps the retired originals; decompression and search can still read them.
 *
 * Preset-owned like the skill plugins themselves, this plugin publishes no
 * root-realm service (preset scopes must not leak those); the stage is a log
 * fact any consumer can read.
 *
 * @module @deepseek-ai/dsh-workflow-stage
 */

import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionSeq, UserMessage } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition, ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import type { SkillDefinition } from '@deepseek-ai/dsh-skill'
import type { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-working-directory'
import { z as zod } from 'zod'

/** The workflow stages, in pipeline order. */
export type WorkflowStage = 'spec' | 'execute'

/** Folded `workflow-stage` unit state; `null` until the workflow arms. */
export interface WorkflowStageUnitState {
  readonly stage: WorkflowStage | null
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Whether this stage is in force from this point on: log-only,
     * non-surface, whole-value replace. The last `workflow/stage` wins; a
     * log with none folds to unarmed (null) through the projection unit.
     */
    'workflow/stage': { stage: WorkflowStage }
  }
}

/** Durable source for the tombstone that replaces a retired skill invocation. */
export interface SkillRetiredSource {
  readonly kind: 'skill-retired'
  /** The spec-stage skill whose instructions this message replaced. */
  readonly name: string
}

/** Durable source for the notice injected when the user switches the stage. */
export interface WorkflowStageNoticeSource {
  readonly kind: 'workflow-stage'
  readonly form: 'notice'
  readonly summary: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** A stage flip retired a spec-stage skill's instructions. */
    'skill-retired': SkillRetiredSource
    /** A user-driven stage transition notice. */
    'workflow-stage': WorkflowStageNoticeSource
  }
}

/** Projection of logged workflow stages; the last event wins, null = unarmed. */
export const workflowStageProjectionDefinition = {
  key: 'workflow-stage',
  stateVersion: 1,
  stateSchema: zod.object({ stage: zod.enum(['spec', 'execute']).nullable() }),
  init: () => ({ stage: null }),
  apply: (state: WorkflowStageUnitState, event: SessionEvent): WorkflowStageUnitState => {
    if (event.type === 'workflow/stage') return { stage: event.data.stage }
    return state
  },
} satisfies ProjectionDefinition<'workflow-stage', WorkflowStageUnitState>

const SPEC_STAGE_SECTION = [
  '## Workflow stage: spec',
  '',
  'This session is working through the bundled workflow skills and is in the',
  'spec stage. Follow brainstorming: settle the genuinely open choices one',
  'question at a time, then write `SPEC.md` (with `Status: draft`) in the',
  'working folder and show it to the user. Do not implement yet — their',
  'approval (they send `/spec approve`, or tell you and you flip the Status',
  'line to `approved`) moves the session to the execution stage and makes the',
  'execution skills available.',
].join('\n')

const EXECUTE_STAGE_SECTION = [
  '## Workflow stage: execute',
  '',
  'The spec is approved; this session is in the execution stage. Follow',
  'working-in-steps: keep the `todo_write` list current, one verified step at',
  'a time, and check every step against SPEC.md. For behavior changes follow',
  'test-driven-development (one failing test first). Before claiming anything',
  'is done, produce the evidence verification-before-completion demands. Do',
  'not restart brainstorming or re-open the spec\'s settled choices — if the',
  'user wants the spec reopened, they will say so (`/spec reopen`).',
].join('\n')

/** The SPEC.md status line the skills write and this plugin honors as a fallback. */
const SPEC_APPROVED = /^\s*status:\s*approved\s*$/im

/** The spec file the brainstorming skill writes, relative to the working directory. */
const SPEC_FILE = 'SPEC.md'

/**
 * Read a skill's stage tag from its frontmatter metadata, if it carries a
 * valid one. Anything else (missing metadata, unknown stage value) is
 * stage-less: it stays visible in every stage.
 * @param skill - a loaded skill definition.
 * @returns the skill's stage, or undefined when untagged.
 */
export function stageOfSkill(skill: SkillDefinition | undefined): WorkflowStage | undefined {
  const stage = skill?.metadata?.stage
  return stage === 'spec' || stage === 'execute' ? stage : undefined
}

/**
 * The session's logged stage: the last `workflow/stage` event wins. The scan
 * runs from the tail and stops at the first hit, so unarmed sessions (the
 * common case) cost one pass over nothing.
 * @param events - complete session log in seq order.
 * @returns the stage, or null while the workflow is unarmed.
 */
export function loggedWorkflowStage(events: readonly SessionEvent[]): WorkflowStage | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'workflow/stage') {
      const stage = (event.data as { stage?: unknown }).stage
      return stage === 'spec' || stage === 'execute' ? stage : null
    }
  }
  return null
}

/** The minimum fs surface this plugin reads SPEC.md through. */
interface FsLike {
  resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<string>
  readText(target: string, signal?: AbortSignal): Promise<string>
}

/** Live runtimes by mounting context; tests and diagnostics reach theirs through {@link runtimeOf}. */
const runtimes = new WeakMap<Context, WorkflowStageRuntime>()

/**
 * The runtime a mounted `workflow-stage` plugin owns on a context.
 * @param ctx - a context of the composition the plugin mounted into.
 * @returns the runtime, or undefined when the plugin is not mounted there.
 */
export function runtimeOf(ctx: Context): WorkflowStageRuntime | undefined {
  return runtimes.get(ctx)
}

/**
 * Owns the logged workflow stage: arms the workflow, appends stage
 * transitions, retires spec-stage invocations at the flip, and renders the
 * `workflow:stage` section. A failed sync never stalls a turn.
 */
export class WorkflowStageRuntime {
  private readonly ctx: Context
  private stageHandle: ProjectionHandle<WorkflowStageUnitState> | undefined

  /**
   * Latest `/spec` selection per session awaiting the next accepted in-turn
   * pre-step; between turns the command commits immediately.
   */
  private readonly pendingStages = new WeakMap<Session, WorkflowStage>()

  constructor(ctx: Context) {
    this.ctx = ctx
  }

  /** Register the section, the projection, the pre-step sync, and the `/spec` command. */
  async start(): Promise<void> {
    const ctx = this.ctx
    ctx.systemPrompt.section({
      name: 'workflow:stage',
      order: ctx.systemPrompt.getSectionOrder('WORKFLOW_STAGE'),
      text: (context) => {
        if (context.agent === undefined) return ''
        const stage = this.stageOf(context.agent.session)
        if (stage === null) return ''
        return stage === 'spec' ? SPEC_STAGE_SECTION : EXECUTE_STAGE_SECTION
      },
    })
    this.stageHandle = await ctx.sessionProjections.register(workflowStageProjectionDefinition)
    // Pre-step is outside Session.append publication, so it can append the
    // log-only stage event inside an open turn without re-entering the session;
    // a failed sync leaves the stage untouched for a later step to retry.
    ctx.on('agent/pre-step', async (
      { agent, signal },
      next,
    ): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      let notice: UserMessage | undefined
      try {
        notice = await this.sync(agent, signal)
      } catch (error) {
        ctx.logger.warn('dsh-workflow-stage: pre-step sync failed: %o', error)
      }
      return notice === undefined
        ? decision
        : { ...decision, messages: [...decision.messages, notice] }
    })
    // The command child activates only when a command registry is composed.
    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        definitionId: brandString<CommandDefinitionId>('@deepseek-ai/dsh-workflow-stage'),
        name: 'spec',
        description: 'Approve the workflow spec, or reopen the spec stage',
        input: { hint: '[approve|reopen]' },
        handler: ({ agent, rawInput }) => {
          const argument = rawInput.trim()
          if (argument !== '' && argument !== 'approve' && argument !== 'reopen') {
            return { kind: 'error', text: 'Usage: /spec [approve|reopen].' }
          }
          const stage: WorkflowStage = argument === 'reopen' ? 'spec' : 'execute'
          switch (this.select(agent, stage)) {
            case 'committed':
              return {
                kind: 'success',
                text: stage === 'execute'
                  ? 'Spec approved — the execution skills are now available.'
                  : 'Spec stage reopened — brainstorming is available again.',
              }
            case 'queued':
              return {
                kind: 'success',
                text: stage === 'execute'
                  ? 'Approving the spec; it applies from the next step.'
                  : 'Reopening the spec stage; it applies from the next step.',
              }
            case 'cancelled':
              return { kind: 'success', text: 'The pending selection was cancelled; the stage is unchanged.' }
            case 'noop':
              return {
                kind: 'success',
                text: stage === 'execute'
                  ? 'The spec is already approved.'
                  : 'The spec stage is already open.',
              }
          }
        },
      })
    })
  }

  /**
   * The session's current stage.
   * @param session - the session whose folded workflow-stage unit is read.
   * @returns the stage, or null while the workflow is unarmed (or the
   * projection registration has not completed).
   */
  stageOf(session: Session): WorkflowStage | null {
    return this.stageHandle?.stateOf(session).stage ?? null
  }

  /**
   * Select the stage for a session. Between turns the selection commits
   * immediately (a `/spec` typed into the composer); during an open turn it
   * stays pending until the next accepted in-turn pre-step, like `/plan`.
   * @param agent - the agent whose session switches stage.
   * @param stage - the target stage.
   * @returns what happened: `committed`, `queued`, `cancelled`, or `noop`.
   */
  select(agent: Agent, stage: WorkflowStage): 'committed' | 'queued' | 'cancelled' | 'noop' {
    const session = agent.session
    const pending = this.pendingStages.get(session)
    const current = this.stageOf(session)
    const target = pending ?? current
    if (stage === target) return 'noop'
    if (this.ctx.agents.turnBoundaryOf(session).openTurnStartSeq !== null) {
      this.pendingStages.set(session, stage)
      return current === stage ? 'cancelled' : 'queued'
    }
    if (stage === current) {
      this.pendingStages.delete(session)
      return 'cancelled'
    }
    const notice = this.commit(session, stage)
    // Delete only after append succeeds so a failed durable write leaves the
    // selection retryable, not dropped.
    this.pendingStages.delete(session)
    agent.inject(notice)
    return 'committed'
  }

  /**
   * Reconcile the stage with the world: commit a pending `/spec` selection,
   * arm at the first visible staged-skill invocation, honor an approved
   * SPEC.md as the file fallback, and retire spec-stage invocations while
   * the session executes. Idempotent; safe to run every step.
   * @param agent - the agent whose session is reconciled.
   * @param signal - aborts the filesystem and registry lookups.
   * @returns a transition notice to surface this step, when one happened.
   */
  private async sync(agent: Agent, signal: AbortSignal | undefined): Promise<UserMessage | undefined> {
    const session = agent.session
    let notice: UserMessage | undefined
    const pending = this.pendingStages.get(session)
    if (pending !== undefined) {
      this.pendingStages.delete(session)
      if (pending !== this.stageOf(session)) notice = this.commit(session, pending)
    }
    if (notice === undefined) {
      const logged = this.stageOf(session)
      if (logged === null) {
        // Arming is bookkeeping, not a user transition: the event lands, the
        // section starts rendering, and no notice interrupts the step.
        if (await this.stagedInvocationVisible(agent, signal)) {
          session.append('workflow/stage', { stage: 'spec' })
        }
      } else if (logged === 'spec' && !this.reopened(session) && await this.specFileApproved(agent, signal)) {
        notice = this.commit(session, 'execute')
      }
    }
    if (this.stageOf(session) === 'execute') await this.retireSpecInvocations(agent, signal)
    return notice
  }

  /**
   * Whether the log records a spec stage entered after an execute stage — a
   * `/spec reopen`. Reopen is the user overriding the file convention, so it
   * is sticky: the fallback stops applying to a reopened session instead of
   * flipping it straight back over a still-approved SPEC.md. The rule reads
   * the log alone, so resume and fork keep it.
   */
  private reopened(session: Session): boolean {
    // oxlint-disable-next-line typescript/no-deprecated -- Existing synchronous history read; migration deferred.
    const events = session.snapshotEvents()
    let seenExecute = false
    for (const event of events) {
      if (event.type !== 'workflow/stage') continue
      const stage = (event.data as { stage?: unknown }).stage
      if (stage === 'execute') seenExecute = true
      else if (seenExecute) return true
    }
    return false
  }

  /** Append one stage transition and return its user-facing notice. */
  private commit(session: Session, stage: WorkflowStage): UserMessage {
    session.append('workflow/stage', { stage })
    return this.notice(stage)
  }

  private notice(stage: WorkflowStage): UserMessage {
    const text = stage === 'execute'
      ? 'The user approved the spec — this session is now in the execution stage. Follow working-in-steps; the execution skills are in the catalog.'
      : 'The user reopened the spec stage — brainstorming is available again; execution skills stay hidden until the spec is re-approved.'
    return createUserMessage({
      content: [{ type: 'text', text }],
      // The notice is already one sentence, so it is its own summary.
      source: { kind: 'workflow-stage', form: 'notice', summary: text },
    })
  }

  /**
   * Whether a visible skill invocation names a stage-tagged skill: the arming
   * signal. Bootstrap-only sessions (no staged skill ever invoked) stay
   * unarmed, so their catalogs and prompts are unchanged.
   */
  private async stagedInvocationVisible(agent: Agent, signal: AbortSignal | undefined): Promise<boolean> {
    const names = this.invokedStagedCandidates(agent)
    if (names.size === 0) return false
    const cwd = await this.ctx.workingDirectory.ensure(agent, signal)
    for (const name of names) {
      const skill = await this.ctx.skills.get(name, { cwd, ...signal === undefined ? {} : { signal }, scope: agent })
      if (stageOfSkill(skill) !== undefined) return true
    }
    return false
  }

  /**
   * The SPEC.md fallback the skills' own prose writes: a `Status: approved`
   * line upgrades an armed spec stage to execute. One-directional on purpose
   * (deleting the file does not reopen the spec — `/spec reopen` does), so a
   * stray write cannot flap the stage.
   */
  private async specFileApproved(agent: Agent, signal: AbortSignal | undefined): Promise<boolean> {
    const fs = this.ctx.get('fs') as FsLike | undefined
    if (fs === undefined) return false
    try {
      const cwd = await this.ctx.workingDirectory.ensure(agent, signal)
      const target = await fs.resolve(SPEC_FILE, { cwd, ...signal === undefined ? {} : { signal } })
      const content = await fs.readText(target, signal)
      return SPEC_APPROVED.test(content)
    } catch {
      // Missing or unreadable SPEC.md simply leaves the stage alone.
      return false
    }
  }

  /**
   * Names carried by visible skill invocations — the candidates for arming
   * and retirement. Resolved against the skill registry by the callers.
   */
  private invokedStagedCandidates(agent: Agent): Set<string> {
    const session = agent.session
    // oxlint-disable-next-line typescript/no-deprecated -- Existing synchronous history read; migration deferred.
    const events = session.snapshotEvents()
    const visible = new Set<SessionSeq>(session.surface.nodes)
    const names = new Set<string>()
    for (const event of events) {
      if (event.type !== 'user/message' || !visible.has(event.seq)) continue
      const source = (event.data as { source?: { kind?: unknown; name?: unknown } }).source
      if (source?.kind === 'skill-invocation' && typeof source.name === 'string') names.add(source.name)
    }
    return names
  }

  /**
   * Replace every still-visible invocation of a spec-stage skill with a
   * one-line tombstone (Context-Editor-style surfaced replace over that
   * single seq). The durable log keeps the originals.
   */
  private async retireSpecInvocations(agent: Agent, signal: AbortSignal | undefined): Promise<void> {
    const session = agent.session
    const names = this.invokedStagedCandidates(agent)
    if (names.size === 0) return
    const cwd = await this.ctx.workingDirectory.ensure(agent, signal)
    const stages = new Map<string, WorkflowStage | undefined>()
    for (const name of names) {
      const skill = await this.ctx.skills.get(name, { cwd, ...signal === undefined ? {} : { signal }, scope: agent })
      stages.set(name, stageOfSkill(skill))
    }
    const visible = new Set<SessionSeq>(session.surface.nodes)
    // oxlint-disable-next-line typescript/no-deprecated -- Existing synchronous history read; migration deferred.
    for (const event of session.snapshotEvents()) {
      if (event.type !== 'user/message' || !visible.has(event.seq)) continue
      const source = (event.data as { source?: { kind?: unknown; name?: unknown } }).source
      if (source?.kind !== 'skill-invocation' || typeof source.name !== 'string') continue
      if (stages.get(source.name) !== 'spec') continue
      session.append('user/message', createUserMessage({
        content: [{
          type: 'text',
          text: `The ${source.name} instructions were retired: the spec is approved. Follow working-in-steps for the rest of this task.`,
        }],
        source: { kind: 'skill-retired', name: source.name },
      }), {
        surfaceOp: { op: 'replace', startSeq: event.seq, endSeq: event.seq },
        sourceEventSeqs: [event.seq],
      })
    }
  }
}

/** Stable Cordis plugin name. */
export const name = 'workflow-stage'

/** Required services: the skill registry, projections, prompts, and the working directory. */
export const inject = ['skills', 'workingDirectory', 'sessionProjections', 'systemPrompt', 'agents']

/**
 * Mount the runtime. Registration happens once per context; tests and
 * diagnostics reach the instance through {@link runtimeOf}.
 * @param ctx - composition context carrying the required services.
 */
export async function apply(ctx: Context): Promise<void> {
  const runtime = new WorkflowStageRuntime(ctx)
  runtimes.set(ctx, runtime)
  await runtime.start()
}

/** Cordis loader shape: the plugin name, required services, and the {@link apply} mount. */
export default { name, inject, apply }
