/** Context Editor copy: en + zh, registered under the `contextEditor` namespace. */

export const en = {
  'view.label': 'Context',
  'pane.context': 'Context',
  'pane.requests': 'Requests',
  'pane.tools': 'Tools & params',
  'context.total': '{tokens} tokens (est.)',
  'context.search': 'Search context…',
  'badge.edited': 'edited',
  'badge.excluded': 'excluded from model',
  'action.restore': 'Restore original',
  'action.edit': 'Edit',
  'action.exclude': 'Exclude',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'state.loading': 'Loading context…',
  'state.empty': 'No context rows.',
  'state.error': 'Context Editor unavailable: {message}',
  'state.captureDegraded': 'Request log writes are failing; model requests are unaffected.',
} as const

export type EnKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Context Editor's copy. */
    'contextEditor': EnKey
  }
}

export const zh: Record<EnKey, string> = {
  'view.label': '上下文',
  'pane.context': '上下文',
  'pane.requests': '请求',
  'pane.tools': '工具与参数',
  'context.total': '约 {tokens} tokens',
  'context.search': '搜索上下文…',
  'badge.edited': '已编辑',
  'badge.excluded': '不发送给模型',
  'action.restore': '恢复原文',
  'action.edit': '编辑',
  'action.exclude': '排除',
  'action.save': '保存',
  'action.cancel': '取消',
  'state.loading': '正在加载上下文…',
  'state.empty': '暂无上下文。',
  'state.error': '上下文编辑器不可用：{message}',
  'state.captureDegraded': '请求日志写入失败；模型请求不受影响。',
}
