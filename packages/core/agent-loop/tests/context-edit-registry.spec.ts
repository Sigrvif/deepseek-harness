/** fork(context-editor): the override registry is a plain session-keyed lookup. */
import { describe, expect, it } from 'vitest'
import { lookupContextEditOverrides, registerContextEditOverrides } from '../src/context-edit-registry.ts'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'

describe('context-edit override registry', () => {
  it('registers, looks up, and clears per-session overrides', () => {
    expect(lookupContextEditOverrides('s1')).toBeUndefined()
    const overrides = { params: (config: LlmCallConfig) => config }
    registerContextEditOverrides('s1', overrides)
    expect(lookupContextEditOverrides('s1')).toBe(overrides)
    registerContextEditOverrides('s1', undefined)
    expect(lookupContextEditOverrides('s1')).toBeUndefined()
  })
})
