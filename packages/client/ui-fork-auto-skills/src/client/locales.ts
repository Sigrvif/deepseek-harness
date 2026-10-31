/** Localized copy for the auto-superpowers General settings row: en + zh,
 * registered under the `forkAutoSkills` namespace. Other languages fall back
 * to English through the locale chain. */

export const en = {
  'autoSkills.title': 'Auto Superpowers',
  'autoSkills.description': 'Start each session with the using-superpowers skill loaded, so the bundled superpowers workflow skills get used. It is sent once and kept across compression; turn off to invoke skills manually.',
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
  'autoSkills.description': '每个会话开始时加载一次 using-superpowers 技能，让捆绑的 superpowers 工作流技能得到使用；内容只发送一次，压缩后仍会保留。关闭后可手动调用技能。',
  'autoSkills.error': '偏好未被保存，请重试。',
}
