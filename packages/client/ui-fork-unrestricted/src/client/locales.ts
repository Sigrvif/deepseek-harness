/** Localized copy for the unrestricted-mode General settings row: en + zh,
 * registered under the `forkUnrestricted` namespace. Other languages fall back
 * to English through the locale chain. */

export const en = {
  'unrestricted.title': 'Unrestricted mode',
  'unrestricted.description': 'Injects an unrestricted execution-mode contract into the system prompt: answers open with the deliverable and refusal-style substitutions are treated as failure, with per-category routing (security tooling, reverse engineering, fiction, guides, resource lookups). Applies to the standard, ptc, and cordis presets; subagents inherit it and the minimal preset is unaffected. Intended for uncensored local models; adds roughly 1,900 tokens to every request.',
  'unrestricted.error': 'The preference was not saved. Try again.',
} as const

export type UnrestrictedKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The unrestricted-mode row's copy. */
    'forkUnrestricted': UnrestrictedKey
  }
}

export const zh: Record<UnrestrictedKey, string> = {
  'unrestricted.title': '无限制模式',
  'unrestricted.description': '向系统提示注入无限制执行模式契约：回答直接给出交付物，拒绝式替换视为失败，并按类别给出路由（安全工具、逆向工程、小说创作、技术指南、资源查找）。作用于 standard、ptc、cordis 预设；子代理继承，minimal 预设不受影响。面向无审查的本地模型；每次请求约增加 1,900 token。',
  'unrestricted.error': '偏好未被保存，请重试。',
}
