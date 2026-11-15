/**
 * Structural fusion of the unrestricted execution mode into one assembly's
 * sections, adapted from yexi-by/dsh-unrestricted v0.2.10 (`src/rules.js`,
 * MIT; see ./THIRD_PARTY_NOTICES.md). Fusion keys on structural section names
 * — `deployment:persona-prefix`, `plan:policy`, `tools:ptc-only`,
 * `tool:structured_output` — never on upstream prose.
 * @module
 */

import type { AssembledSection } from '@deepseek-ai/dsh-system-prompt'
import {
  BLOCK_SECTION, EXECUTION_MODE_BLOCK, PTC_ONLY_NOTE, PERSONA_POINTER, PLAN_NOTE, STRUCTURED_OUTPUT_NOTE,
} from './text.ts'

/** Fusion options. */
export interface FuseOptions {
  /** Tolerate an absent persona on delegated subagents. */
  isSubagent?: boolean
}

/** A successful fusion, or the structured issue codes that kept the stock prompt. */
export type FuseResult = { sections: AssembledSection[] } | { issues: string[] }

/**
 * Append a suffix once (idempotent when called on an already-appended text).
 */
function appendOnce(text: string, suffix: string): string {
  return text.endsWith(suffix) ? text : text + suffix
}

/**
 * Fuse the unrestricted execution mode into one assembly's sections.
 * @param sections - AssembledSection rows from the waterfall.
 * @param options - {@link FuseOptions}.
 * @returns `{ sections }` with the fusion applied, or `{ issues }` when the
 *   assembly lacks a persona (and is not a subagent's).
 */
export function fuseSections(sections: AssembledSection[], options: FuseOptions = {}): FuseResult {
  if (sections.some(section => section.name === BLOCK_SECTION)) {
    return { sections }
  }

  const byName = new Map(sections.map(section => [section.name, section]))
  const persona = byName.get('deployment:persona-prefix')
  let fusedPersona: AssembledSection | undefined
  if (persona !== undefined && persona.text.trim() !== '') {
    fusedPersona = { ...persona, text: appendOnce(persona.text, PERSONA_POINTER) }
  } else if (!options.isSubagent) {
    return { issues: ['missing-persona'] }
  }

  let fusedPlan: AssembledSection | undefined
  const plan = byName.get('plan:policy')
  if (plan !== undefined && plan.text.trim() !== '') {
    fusedPlan = { ...plan, text: appendOnce(plan.text, PLAN_NOTE) }
  }

  let fusedPtcOnly: AssembledSection | undefined
  const ptcOnly = byName.get('tools:ptc-only')
  if (ptcOnly !== undefined && ptcOnly.text.trim() !== '') {
    fusedPtcOnly = { ...ptcOnly, text: appendOnce(ptcOnly.text, PTC_ONLY_NOTE) }
  }

  let fusedStructured: AssembledSection | undefined
  const structured = byName.get('tool:structured_output')
  if (structured !== undefined && structured.text.trim() !== '') {
    fusedStructured = { ...structured, text: appendOnce(structured.text, STRUCTURED_OUTPUT_NOTE) }
  }

  const replaced = new Map(
    [fusedPersona, fusedPlan, fusedPtcOnly, fusedStructured]
      .filter(section => section !== undefined)
      .map(section => [section.name, section]),
  )
  const fused = sections.map(section => replaced.get(section.name) ?? section)
  const personaIndex = fused.findIndex(section => section.name === 'deployment:persona-prefix')
  const identityIndex = fused.findIndex(section => section.name === 'harness:identity')
  const insertAt = personaIndex >= 0 ? personaIndex + 1 : (identityIndex >= 0 ? identityIndex + 1 : 0)
  fused.splice(insertAt, 0, { name: BLOCK_SECTION, text: EXECUTION_MODE_BLOCK })
  return { sections: fused }
}
