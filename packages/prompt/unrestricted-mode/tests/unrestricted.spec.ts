/** The unrestricted-mode fusion: toggle gating, placement, notes, idempotency. */
import { Context } from '@deepseek-ai/cordis'
import type { AssembledSection, PromptPresentation } from '@deepseek-ai/dsh-system-prompt'
import { afterEach, describe, expect, it } from 'vitest'
import { fuseSections } from '../src/fuse.ts'
import { BLOCK_SECTION, EXECUTION_MODE_BLOCK, PERSONA_POINTER, PTC_ONLY_NOTE, PLAN_NOTE, STRUCTURED_OUTPUT_NOTE } from '../src/text.ts'
import { apply } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

const section = (name: string, text: string): AssembledSection => ({ name, text })

/** A stock-shaped assembly: identity, persona, suffix. */
const STOCK: AssembledSection[] = [
  section('harness:identity', 'You are an AI agent powered by DSLRH.'),
  section('deployment:persona-prefix', 'You are a coding agent powered by the {{model}} model.'),
  section('deployment:persona-suffix', ''),
]

/** One assembly's runtime-context input. */
type RunContext = { name: string; text: string }

/** Dispatch one assemble waterfall through a context carrying the listener. */
async function run(ctx: Context, sections: AssembledSection[], contexts: RunContext[] = []): Promise<PromptPresentation> {
  const assembly: PromptPresentation = { sections, contexts, variables: {} }
  // Unscoped dispatch: an inert thisArg (no scope filter) like the registry's
  // global-layer assemblies see.
  const dispatch = ctx.waterfall.bind(ctx) as unknown as (...args: unknown[]) => Promise<PromptPresentation>
  return await dispatch({}, 'system-prompt/assemble', assembly, {}, () => Promise.resolve(assembly))
}

/** A context with the listener mounted at the given toggle state. */
function bench(enabled: boolean): Context {
  const ctx = new Context()
  contexts.push(ctx)
  apply(ctx, { enabled: { get: () => enabled } })
  return ctx
}

describe('fuseSections', () => {
  it('extends the persona and inserts the block directly behind it', () => {
    const result = fuseSections(STOCK)
    if (!('sections' in result)) throw new Error(`unexpected issues: ${String(result.issues)}`)
    expect(result.sections.map(s => s.name)).toEqual([
      'harness:identity', 'deployment:persona-prefix', BLOCK_SECTION, 'deployment:persona-suffix',
    ])
    expect(result.sections[1]?.text).toBe(`You are a coding agent powered by the {{model}} model.${PERSONA_POINTER}`)
    expect(result.sections[2]?.text).toBe(EXECUTION_MODE_BLOCK)
  })

  it('is idempotent: an existing block section passes through untouched', () => {
    const once = fuseSections(STOCK)
    if (!('sections' in once)) throw new Error('unexpected issues')
    const twice = fuseSections(once.sections)
    expect(twice).toEqual({ sections: once.sections })
  })

  it('appends the plan note while a plan policy is active', () => {
    const result = fuseSections([...STOCK, section('plan:policy', 'You are in plan mode.')])
    if (!('sections' in result)) throw new Error('unexpected issues')
    const plan = result.sections.find(s => s.name === 'plan:policy')
    expect(plan?.text).toBe(`You are in plan mode.${PLAN_NOTE}`)
  })

  it('appends the ptc and structured notes when their sections carry text', () => {
    const result = fuseSections([...STOCK, section('tools:ptc-only', 'Write programs.'), section('tool:structured_output', 'Report via tool.')])
    if (!('sections' in result)) throw new Error('unexpected issues')
    const byName = new Map(result.sections.map(s => [s.name, s.text]))
    expect(byName.get('tools:ptc-only')).toBe(`Write programs.${PTC_ONLY_NOTE}`)
    expect(byName.get('tool:structured_output')).toBe(`Report via tool.${STRUCTURED_OUTPUT_NOTE}`)
  })

  it('keeps an empty persona suffix and absent optional sections absent', () => {
    const result = fuseSections(STOCK)
    if (!('sections' in result)) throw new Error('unexpected issues')
    expect(result.sections.find(s => s.name === 'deployment:persona-suffix')?.text).toBe('')
    expect(result.sections.some(s => s.name === 'plan:policy')).toBe(false)
  })

  it('fails soft without a persona', () => {
    const result = fuseSections([section('harness:identity', 'You are an AI agent powered by DSLRH.')])
    expect(result).toEqual({ issues: ['missing-persona'] })
  })

  it('tolerates an absent persona on subagents, inserting behind the identity', () => {
    const result = fuseSections([section('harness:identity', 'You are an AI agent powered by DSLRH.')], { isSubagent: true })
    if (!('sections' in result)) throw new Error('unexpected issues')
    expect(result.sections.map(s => s.name)).toEqual(['harness:identity', BLOCK_SECTION])
  })
})

describe('apply — the assemble listener', () => {
  it('passes the assembly through while disabled', async () => {
    const ctx = bench(false)
    const result = await run(ctx, STOCK)
    expect(result.sections).toEqual(STOCK)
    expect(result.sections.some(s => s.name === BLOCK_SECTION)).toBe(false)
  })

  it('fuses while enabled, end to end through the waterfall', async () => {
    const ctx = bench(true)
    const result = await run(ctx, STOCK, [{ name: 'working-directory', text: '' }])
    expect(result.sections.map(s => s.name)).toEqual([
      'harness:identity', 'deployment:persona-prefix', BLOCK_SECTION, 'deployment:persona-suffix',
    ])
    expect(result.contexts).toEqual([{ name: 'working-directory', text: '' }])
    expect(result.variables).toEqual({})
  })

  it('fuses a subagent assembly lacking a persona', async () => {
    const ctx = bench(true)
    const result = await run(ctx, STOCK.filter(s => s.name !== 'deployment:persona-prefix'), [{ name: 'subagent:delegation', text: '' }])
    if (!('sections' in result)) throw new Error('listener returned issues')
    expect(result.sections.map(s => s.name)).toEqual(['harness:identity', BLOCK_SECTION, 'deployment:persona-suffix'])
  })
})
