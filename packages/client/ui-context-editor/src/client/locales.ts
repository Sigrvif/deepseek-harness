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
  'action.excludeToEnd': 'Exclude to end',
  'action.condense': 'Condense',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'state.loading': 'Loading context…',
  'state.empty': 'No context rows.',
  'state.error': 'Context Editor unavailable: {message}',
  'state.captureDegraded': 'Request log writes are failing; model requests are unaffected.',
  'action.showJson': 'Next request JSON',
  'action.loadMore': 'Load more',
  'action.removeTool': 'Remove from requests',
  'action.includeTool': 'Restore tool',
  'tools.note': 'Overrides apply to agent turns (not title/compaction requests) and are not inherited by forks.',
  'confirm.exclude': 'Exclude the selected messages from every future model request?',
  'confirm.excludeToEnd': 'Exclude this message and everything after it from every future model request?',
  'confirm.condense': 'Summarize the selected range into a checkpoint and free its context? The rows are replaced by one condensed summary.',
  'confirm.branch': 'Mid-history restoration needs a recovery branch. Create one now?',
  'confirm.branchCreated': 'Created recovery branch {id}',
  'prompt.batchEdit': 'Replacement text for all selected messages',
  'stub.range': 'Excludes #{start}–#{end}',
  'edit.action': 'Edit & resend',
  'edit.confirm': 'Exclude this message and everything after it from the model context (restorable in the Context tab), then send the edited text as a new prompt?',
  'edit.save': 'Save & resend',
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
  'action.excludeToEnd': '排除到末尾',
  'action.condense': '压缩',
  'action.save': '保存',
  'action.cancel': '取消',
  'state.loading': '正在加载上下文…',
  'state.empty': '暂无上下文。',
  'state.error': '上下文编辑器不可用：{message}',
  'state.captureDegraded': '请求日志写入失败；模型请求不受影响。',
  'action.showJson': '下一次请求 JSON',
  'action.loadMore': '加载更多',
  'action.removeTool': '从请求中移除',
  'action.includeTool': '恢复工具',
  'tools.note': '覆盖仅作用于代理请求（标题/压缩请求不受影响），且不会被分叉继承。',
  'confirm.exclude': '将所选消息从之后的所有模型请求中排除？',
  'confirm.excludeToEnd': '将这条消息及之后的所有内容从后续模型请求中排除？',
  'confirm.condense': '将所选范围摘要为一个检查点并释放其上下文？这些行会被替换为一条压缩摘要。',
  'confirm.branch': '历史中段的恢复需要恢复分支。现在创建？',
  'confirm.branchCreated': '已创建恢复分支 {id}',
  'prompt.batchEdit': '所有选中消息的替换文本',
  'stub.range': '已排除 #{start}–#{end}',
  'edit.action': '编辑并重发',
  'edit.confirm': '将这条消息及之后的内容从模型上下文中排除（可在上下文标签页恢复），并将修改后的文本作为新提示发送？',
  'edit.save': '保存并重发',
}
