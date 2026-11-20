/** Localized copy for the change-report General settings row, registered
 * under the `forkChangeReport` namespace: zh, en, ja, es, fr, de, ru, pt. */

export const en = {
  'changeReport.title': 'Change reports',
  'changeReport.description': 'After every turn that changed files in the workspace, a compact notice listing the changed files joins the conversation context, so the model knows what it last touched. Turn this off if the extra context confuses small models.',
  'changeReport.error': 'The preference was not saved. Try again.',
} as const

/** Change-report locale keys. */
export type ChangeReportKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The change-report row's copy. */
    'forkChangeReport': ChangeReportKey
  }
}

/** Chinese change-report copy. */
export const zh: Record<ChangeReportKey, string> = {
  'changeReport.title': '变更报告',
  'changeReport.description': '每轮改动工作区文件后，一条列出所改文件的简短通知会进入对话上下文，让模型知道自己刚改过什么。如果这些额外上下文会干扰小模型，可以关闭。',
  'changeReport.error': '偏好未被保存，请重试。',
}

/** Japanese copy, checked against the English keys. */
export const ja = {
  'changeReport.title': '変更レポート',
  'changeReport.description': 'ワークスペースのファイルを変更した各ターンの後に、変更されたファイルを一覧する簡潔な通知が会話コンテキストに加わり、モデルが最後にどこに触れたかを把握できます。余分なコンテキストが小さなモデルを混乱させる場合はオフにしてください。',
  'changeReport.error': '設定を保存できませんでした。もう一度お試しください。',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'changeReport.title': 'Informes de cambios',
  'changeReport.description': 'Después de cada turno que cambió archivos del espacio de trabajo, un aviso compacto con la lista de los archivos modificados se une al contexto de la conversación, para que el modelo sepa qué tocó por última vez. Desactive esto si el contexto adicional confunde a los modelos pequeños.',
  'changeReport.error': 'La preferencia no se guardó. Inténtelo de nuevo.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'changeReport.title': 'Rapports de modifications',
  'changeReport.description': "Après chaque tour ayant modifié des fichiers de l'espace de travail, un avis compact listant les fichiers modifiés rejoint le contexte de la conversation, afin que le modèle sache ce qu'il a touché en dernier. Désactivez cette option si le contexte supplémentaire perturbe les petits modèles.",
  'changeReport.error': "La préférence n'a pas été enregistrée. Réessayez.",
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'changeReport.title': 'Änderungsberichte',
  'changeReport.description': 'Nach jedem Durchlauf, der Dateien im Arbeitsbereich geändert hat, ergänzt ein kompakter Hinweis mit den geänderten Dateien den Gesprächskontext, damit das Modell weiß, woran es zuletzt gearbeitet hat. Schalten Sie dies aus, wenn der zusätzliche Kontext kleine Modelle verwirrt.',
  'changeReport.error': 'Die Einstellung wurde nicht gespeichert. Bitte erneut versuchen.',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'changeReport.title': 'Отчёты об изменениях',
  'changeReport.description': 'После каждого хода, изменившего файлы в рабочем пространстве, в контекст беседы добавляется компактное уведомление со списком изменённых файлов, чтобы модель знала, к чему она обращалась в последний раз. Отключите это, если дополнительный контекст сбивает с толку небольшие модели.',
  'changeReport.error': 'Настройку не удалось сохранить. Попробуйте снова.',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'changeReport.title': 'Relatórios de alterações',
  'changeReport.description': 'Após cada turno que alterou arquivos no espaço de trabalho, um aviso compacto listando os arquivos alterados entra no contexto da conversa, para que o modelo saiba o que tocou por último. Desative isso se o contexto extra confundir modelos pequenos.',
  'changeReport.error': 'A preferência não foi salva. Tente novamente.',
} satisfies Record<keyof typeof en, string>
