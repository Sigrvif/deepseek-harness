/** Fork additions copy: en + zh, registered under the `forkInfo` namespace.
 * Other languages fall back to English through the locale chain. */

export const en = {
  'tab.label': 'Fork additions',
  'tab.intro': 'This package carries additions beyond upstream DeepSeek Harness, built into the harness itself. They are always active; this page is here so they stay easy to find.',
  'editor.name': 'Native Context Editor',
  'editor.summary': 'Every session gains a Context tab next to Chat: the exact model-bound context with in-place edits, exclusions, restores, the captured request log, and this session\'s tools & generation-parameter overrides. Edits are durable session events and survive restarts.',
  'fold.name': 'Native Context Fold',
  'fold.summary': 'The model can compress consumed conversation into summaries it writes itself, through four tools (compress, decompress, search_context, acp_status), with gentle growth nudges. Folds are reversible checkpoints on the session log: they change the next request, survive restarts, and never destroy the originals.',
  'superpowers.name': 'Bundled Superpowers Skills',
  'superpowers.summary': 'The fifteen superpowers workflow skills (brainstorming, test-driven development, systematic debugging, and friends) ship with the app and appear in every session\'s skill catalog. Project, custom, and user skill roots all outrank the bundled one, so any skill can be shadowed with your own copy.',
  'autoSkills.name': 'Auto Superpowers Toggle',
  'autoSkills.summary': 'A General settings switch (default on) that loads the using-superpowers skill at the start of every task, so the workflow discipline reaches users who would forget to invoke it. Turn it off to invoke skills manually; each task then starts without the bootstrap.',
  'tab.attribution': 'Context Fold\'s behavior is adapted from the open-source billion-context project (MIT + attribution term). The bundled superpowers skills are vendored from the open-source superpowers project by Jesse Vincent (MIT). See the fork documentation for the full inventory.',
} as const

export type ForkInfoLocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The fork additions tab's copy. */
    'forkInfo': ForkInfoLocaleKey
  }
}

export const zh: Record<ForkInfoLocaleKey, string> = {
  'tab.label': '分支新增功能',
  'tab.intro': '本包在上游 DeepSeek Harness 之外内置了以下新增功能。它们始终生效；此页面仅用于方便查找。',
  'editor.name': '原生上下文编辑器',
  'editor.summary': '每个会话在对话旁多出一个上下文标签页：模型实际收到的完整上下文，可就地编辑、排除、恢复，附请求日志与会话级的工具及生成参数覆盖。编辑是持久的会话事件，重启后仍然保留。',
  'fold.name': '原生上下文折叠',
  'fold.summary': '模型可通过四个工具（compress、decompress、search_context、acp_status）把已消耗的对话压缩为自己撰写的摘要，并伴随温和的增长提醒。折叠是会话日志上的可逆检查点：下一次请求即生效、重启后保留、绝不销毁原文。',
  'superpowers.name': '内置 Superpowers 技能',
  'superpowers.summary': '十五个 superpowers 工作流技能（头脑风暴、测试驱动开发、系统化调试等）随应用一起分发，出现在每个会话的技能目录中。项目、自定义与用户技能目录的优先级都高于内置目录，任何技能都可以用同名副本覆盖。',
  'autoSkills.name': '自动 Superpowers 开关',
  'autoSkills.summary': '常规设置页中的开关（默认开启）：在每个任务开始时自动加载 using-superpowers 技能，让工作流纪律覆盖到容易忘记调用的用户。关闭后可手动调用技能，任务不再自动引导。',
  'tab.attribution': '上下文折叠的行为改编自开源项目 billion-context（MIT + 署名条款）；内置的 superpowers 技能来自 Jesse Vincent 的开源项目 superpowers（MIT）。完整清单见分支文档。',
}
