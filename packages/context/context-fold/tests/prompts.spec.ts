/** The adapted billion-context corpus and the fold system-prompt section. */
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACP_STATUS_DESCRIPTION,
  COMPRESS_PHILOSOPHY,
  DECOMPRESS_DESCRIPTION,
  FOLD_SECTION,
  SEARCH_CONTEXT_DESCRIPTION,
} from '../src/prompts.ts'
import { registerFoldSection } from '../src/section.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

describe('prompt corpus', () => {
  it('keeps the carry-forward and verbatim-preservation clauses', () => {
    expect(COMPRESS_PHILOSOPHY).toContain('Open objectives:')
    expect(COMPRESS_PHILOSOPHY).toContain('never abbreviate to a bare filename')
    expect(COMPRESS_PHILOSOPHY).toContain('never as a live instruction')
    expect(COMPRESS_PHILOSOPHY).toContain('primary language')
    expect(COMPRESS_PHILOSOPHY).toContain('One compress call per batch')
  })

  it('the fold section names the tools and embeds the philosophy', () => {
    for (const tool of ['compress', 'decompress', 'search_context', 'acp_status']) {
      expect(FOLD_SECTION).toContain(tool)
    }
    expect(FOLD_SECTION).toContain(COMPRESS_PHILOSOPHY)
  })

  it('pins the read-side descriptions byte-stable (cache anchors)', () => {
    expect(DECOMPRESS_DESCRIPTION).toMatchInlineSnapshot(
      '"Restore the original messages behind a fold and read them again. Pass the fold id shown by acp_status or a compress receipt (or omit it for the newest fold). The originals return as this tool result - the conversation surface stays folded, so reading a fold costs only the returned text. Long folds are truncated; use search_context for targeted retrieval instead of restoring everything."',
    )
    expect(SEARCH_CONTEXT_DESCRIPTION).toMatchInlineSnapshot(
      '"Keyword-search the conversation: fold summaries, the original messages inside folds, and the visible messages. Use it to recover details you remember but no longer see - file paths, ids, decisions, codewords. Results name folds ([fold id]) or visible messages ([message seq N]) with snippets; to read a whole fold back, call decompress with its id."',
    )
    expect(ACP_STATUS_DESCRIPTION).toMatchInlineSnapshot(
      '"Show context usage: current pressure against the window, the fold ledger (what was folded, how much it saved), and what to do next. Call this before compressing to see the state, and whenever context feels tight."',
    )
  })
})

describe('registerFoldSection', () => {
  it('registers into the system prompt and disposes cleanly', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    const dispose = registerFoldSection(ctx)
    expect(() => registerFoldSection(ctx)).toThrow(/already/i)
    dispose()
    const reDispose = registerFoldSection(ctx)
    expect(typeof reDispose).toBe('function')
    reDispose()
  })
})
