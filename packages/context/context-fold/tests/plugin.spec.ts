/** Plugin boot for the fold package: tools, section, and nudges under one config. */
import { Context } from '@deepseek-ai/cordis'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { afterEach, describe, expect, it } from 'vitest'
import plugin from '../src/index.ts'
import { resolveConfig } from '../src/config.ts'
import type { ResolvedFoldConfig } from '../src/tools.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

// Runtime accepts a partial: `resolveConfig` fills every omitted knob.
async function mounted(config?: Partial<ResolvedFoldConfig>) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access' })
  const fiber = await ctx.plugin(plugin, config as ResolvedFoldConfig | undefined)
  return { ctx, dispose: async () => fiber.dispose() }
}

describe('context-fold plugin', () => {
  it('registers the four tools and the system section', async () => {
    const { ctx } = await mounted()
    const names = new Set(ctx.tools.definitions().map(tool => tool.name))
    for (const tool of ['compress', 'decompress', 'search_context', 'acp_status']) {
      expect(names.has(tool)).toBe(true)
    }
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('Context management')
  })

  it('removes tools and section on dispose', async () => {
    const { ctx, dispose } = await mounted()
    await dispose()
    const names = new Set(ctx.tools.definitions().map(tool => tool.name))
    expect(names.has('compress')).toBe(false)
    expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain('Context management')
  })

  it('registers nothing when disabled', async () => {
    const { ctx } = await mounted({ enabled: false })
    const names = new Set(ctx.tools.definitions().map(tool => tool.name))
    expect(names.has('compress')).toBe(false)
    expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain('Context management')
  })

  it('resolves documented defaults', () => {
    expect(resolveConfig({})).toEqual({
      enabled: true,
      keepLast: 8,
      minFoldChars: 2000,
      minSummaryChars: 200,
      decompressCapChars: 24000,
      searchLimit: 8,
      nudgeGrowthTokens: 30000,
      pressureNudgeRatio: 0.75,
      nudgeAdviseRatio: 0.4,
      nudgeDemandRatio: 0.7,
    })
  })
})
