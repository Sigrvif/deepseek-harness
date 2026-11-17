/** Localized copy for the change-report General settings row: en + zh,
 * registered under the `forkChangeReport` namespace. Other languages fall back
 * to English through the locale chain. */

export const en = {
  'changeReport.title': 'Change reports',
  'changeReport.description': 'After every turn that changed files in the workspace, a compact notice listing the changed files joins the conversation context, so the model knows what it last touched. Turn this off if the extra context confuses small models.',
  'changeReport.error': 'The preference was not saved. Try again.',
} as const

export type ChangeReportKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The change-report row's copy. */
    'forkChangeReport': ChangeReportKey
  }
}

export const zh: Record<ChangeReportKey, string> = {
  'changeReport.title': '变更报告',
  'changeReport.description': '每轮改动工作区文件后，一条列出所改文件的简短通知会进入对话上下文，让模型知道自己刚改过什么。如果这些额外上下文会干扰小模型，可以关闭。',
  'changeReport.error': '偏好未被保存，请重试。',
}
