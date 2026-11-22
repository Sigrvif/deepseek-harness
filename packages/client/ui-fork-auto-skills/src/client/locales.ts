/** Localized copy for the auto-workflow General settings row, registered
 * under the `forkAutoSkills` namespace: zh, en, ja, es, fr, de, ru, pt. */

export const en = {
  'autoSkills.title': 'Auto Workflow',
  'autoSkills.description': 'Start each session with the using-workflow skill loaded, so the bundled workflow skills get used. It is sent once and kept across compression; turn off to invoke skills manually.',
  'autoSkills.error': 'The preference was not saved. Try again.',
} as const

/** Auto-workflow locale keys. */
export type AutoSkillsKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The auto-workflow row's copy. */
    'forkAutoSkills': AutoSkillsKey
  }
}

/** Chinese auto-workflow copy. */
export const zh: Record<AutoSkillsKey, string> = {
  'autoSkills.title': '自动工作流',
  'autoSkills.description': '每个会话开始时加载一次 using-workflow 技能，让捆绑的工作流技能得到使用；内容只发送一次，压缩后仍会保留。关闭后可手动调用技能。',
  'autoSkills.error': '偏好未被保存，请重试。',
}

/** Japanese copy, checked against the English keys. */
export const ja = {
  'autoSkills.title': '自動ワークフロー',
  'autoSkills.description': '各セッションの開始時に using-workflow スキルを読み込み、バンドルされたワークフロースキルが使われるようにします。内容は1度だけ送信され、圧縮後も保持されます。オフにするとスキルを手動で呼び出せます。',
  'autoSkills.error': '設定を保存できませんでした。もう一度お試しください。',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'autoSkills.title': 'Flujo de trabajo automático',
  'autoSkills.description': 'Inicia cada sesión con la habilidad using-workflow cargada, para que se usen las habilidades de flujo de trabajo incluidas. Se envía una vez y se conserva tras la compresión; desactívelo para invocar las habilidades manualmente.',
  'autoSkills.error': 'La preferencia no se guardó. Inténtelo de nuevo.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'autoSkills.title': 'Flux de travail automatique',
  'autoSkills.description': 'Démarre chaque session avec la compétence using-workflow chargée, afin que les compétences de flux de travail fournies soient utilisées. Elle est envoyée une seule fois et conservée après compression ; désactivez cette option pour invoquer les compétences manuellement.',
  'autoSkills.error': "La préférence n'a pas été enregistrée. Réessayez.",
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'autoSkills.title': 'Auto-Workflow',
  'autoSkills.description': 'Startet jede Sitzung mit geladenem using-workflow-Skill, damit die mitgelieferten Workflow-Skills verwendet werden. Er wird einmal gesendet und bleibt über Komprimierungen hinweg erhalten; schalten Sie ihn aus, um Skills manuell aufzurufen.',
  'autoSkills.error': 'Die Einstellung wurde nicht gespeichert. Bitte erneut versuchen.',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'autoSkills.title': 'Автоматический рабочий процесс',
  'autoSkills.description': 'Запускает каждую сессию с загруженным навыком using-workflow, чтобы использовались входящие в комплект навыки рабочих процессов. Он отправляется один раз и сохраняется после сжатия; выключите, чтобы вызывать навыки вручную.',
  'autoSkills.error': 'Настройку не удалось сохранить. Попробуйте снова.',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'autoSkills.title': 'Fluxo de trabalho automático',
  'autoSkills.description': 'Inicia cada sessão com a habilidade using-workflow carregada, para que as habilidades de fluxo de trabalho incluídas sejam usadas. É enviada uma vez e mantida após a compactação; desligue para invocar habilidades manualmente.',
  'autoSkills.error': 'A preferência não foi salva. Tente novamente.',
} satisfies Record<keyof typeof en, string>
