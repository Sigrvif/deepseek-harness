/** Contract of the bundled skill root: what skill-filesystem parses and tool-skill catalogs. */
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SKILLS_DIR = fileURLToPath(new URL('../skills', import.meta.url))

/**
 * tool-skill's DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH: the per-step catalog
 * truncates descriptions past it, so a longer one ships half-said.
 */
const CATALOG_DESCRIPTION_MAX = 500

/** The tailored set, alphabetical; the directory must hold exactly this. */
const EXPECTED = [
  'brainstorming',
  'dispatching-parallel-agents',
  'systematic-debugging',
  'test-driven-development',
  'using-workflow',
  'verification-before-completion',
  'working-in-steps',
]

/**
 * Upstream skills dropped in the fork rewrite. A reference to one of these
 * in a shipped body is a dangling instruction: the skill cannot be loaded.
 * `test-driven-development` returned in 2.4.36 as an execution-stage skill.
 */
const REMOVED = [
  'diagnosing-superpowers',
  'executing-plans',
  'finishing-a-development-branch',
  'receiving-code-review',
  'requesting-code-review',
  'subagent-driven-development',
  'using-git-worktrees',
  'writing-plans',
  'writing-skills',
]

/** The workflow stage each skill belongs to; absent means every stage. */
const STAGES: Record<string, string | undefined> = {
  brainstorming: 'spec',
  'dispatching-parallel-agents': 'execute',
  'systematic-debugging': 'execute',
  'test-driven-development': 'execute',
  'using-workflow': undefined,
  'verification-before-completion': 'execute',
  'working-in-steps': 'execute',
}

interface Frontmatter {
  name: string
  description: string
  stage: string | undefined
  body: string
}

/** Parse a SKILL.md the way skill-filesystem does: YAML frontmatter, then the body. */
function parseSkill(raw: string): Frontmatter | undefined {
  const split = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (split === null) return undefined
  const field = (key: string): string | undefined => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(split[1] ?? '')
    if (line === null) return undefined
    return (line[1] ?? '').trim().replace(/^["']|["']$/g, '')
  }
  const name = field('name')
  const description = field('description')
  if (name === undefined || name === '' || description === undefined || description === '') return undefined
  const stageLine = /^\s{2}stage:\s*(\S+)\s*$/m.exec(split[1] ?? '')
  return { name, description, stage: stageLine?.[1], body: (split[2] ?? '').trim() }
}

function skillDirs(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

function readSkill(dir: string): { raw: string; parsed: Frontmatter | undefined } {
  const raw = readFileSync(join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8')
  return { raw, parsed: parseSkill(raw) }
}

describe('bundled superpowers skills', () => {
  it('ships exactly the tailored seven skills, one SKILL.md each', () => {
    expect(skillDirs()).toEqual(EXPECTED)
    for (const dir of skillDirs()) {
      expect(readdirSync(join(SKILLS_DIR, dir))).toEqual(['SKILL.md'])
    }
  })

  it('keeps the parser and catalog contract for every skill', () => {
    for (const dir of skillDirs()) {
      const { parsed } = readSkill(dir)
      expect(parsed, `${dir}/SKILL.md frontmatter must parse`).toBeDefined()
      const skill = parsed!
      expect(skill.name, `${dir}: name must match the directory`).toBe(dir)
      expect(isSkillName(skill.name), `${dir}: name must be kebab-case`).toBe(true)
      expect(skill.description.startsWith('Use when'), `${dir}: description states when to use`).toBe(true)
      expect(
        skill.description.length,
        `${dir}: description fits the catalog without truncation`,
      ).toBeLessThanOrEqual(CATALOG_DESCRIPTION_MAX)
      expect(skill.body.length, `${dir}: body is non-empty`).toBeGreaterThan(0)
    }
  })

  it('references only skills that ship', () => {
    for (const dir of skillDirs()) {
      const { raw } = readSkill(dir)
      for (const removed of REMOVED) {
        expect(raw, `${dir} must not reference the removed ${removed}`).not.toContain(removed)
      }
    }
  })

  it('tags every skill with the workflow stage it belongs to', () => {
    for (const dir of skillDirs()) {
      const { parsed } = readSkill(dir)
      expect(parsed!.stage, `${dir}: stage tag matches the stage contract`).toBe(STAGES[dir])
    }
  })

  it('keeps the bootstrap skill the superpowers-bootstrap plugin injects', () => {
    expect(EXPECTED).toContain('using-workflow')
    const { parsed } = readSkill('using-workflow')
    expect(parsed!.name).toBe('using-workflow')
  })
})
