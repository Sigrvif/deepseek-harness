/** Localized copy for the auto-superpowers General settings row: en + zh,
 * registered under the `forkAutoSkills` namespace. Other languages fall back
 * to English through the locale chain. */

export const en = {
  'autoSkills.title': 'Auto Superpowers',
  'autoSkills.description': 'Load the using-superpowers skill at the start of every task, so the bundled superpowers workflow skills get used. Turn off to invoke skills manually.',
  'autoSkills.error': 'The preference was not saved. Try again.',
} as const

export type AutoSkillsKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The auto-superpowers row's copy. */
    'forkAutoSkills': AutoSkillsKey
  }
}

export const zh: Record<AutoSkillsKey, string> = {
  'autoSkills.title': '自动 Superpowers',
  'autoSkills.description': '在每个任务开始时自动加载 using-superpowers 技能，让捆绑的 superpowers 工作流技能得到使用。关闭后可手动调用技能。',
  'autoSkills.error': '偏好未被保存，请重试。',
}
