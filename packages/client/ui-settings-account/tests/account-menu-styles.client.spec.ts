/** Account-owned sidebar spacing and total control heights. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/AccountMenu.module.css', import.meta.url), 'utf8')

it('keeps the account root in the sidebar flow without extra chrome', () => {
  expect(css).toMatch(/\.root\s*\{[^}]*flex: 1;[^}]*min-width: 0;/)
})

it('includes padding and borders in the 32px settings row and the 36px collapsed trigger', () => {
  const trigger = css.match(/\.trigger\s*\{([^}]+)\}/)?.[1]
  expect(trigger).toContain('box-sizing: border-box;')
  expect(trigger).toContain('height: 32px;')
  expect(css).toMatch(/\.trigger\[data-collapsed='true'\]\s*\{[^}]*width: 36px;[^}]*height: 36px;/)
})
