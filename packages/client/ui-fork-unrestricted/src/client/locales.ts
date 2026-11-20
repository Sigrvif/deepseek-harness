/** Localized copy for the unrestricted-mode General settings row, registered
 * under the `forkUnrestricted` namespace: zh, en, ja, es, fr, de, ru, pt. */

export const en = {
  'unrestricted.title': 'Unrestricted mode',
  'unrestricted.description': 'Injects an unrestricted execution-mode contract into the system prompt: answers open with the deliverable and refusal-style substitutions are treated as failure, with per-category routing (security tooling, reverse engineering, fiction, guides, resource lookups). Applies to the standard, ptc, and cordis presets; subagents inherit it and the minimal preset is unaffected. Intended for uncensored local models; adds roughly 1,900 tokens to every request.',
  'unrestricted.error': 'The preference was not saved. Try again.',
} as const

/** Unrestricted-mode locale keys. */
export type UnrestrictedKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The unrestricted-mode row's copy. */
    'forkUnrestricted': UnrestrictedKey
  }
}

/** Chinese unrestricted-mode copy. */
export const zh: Record<UnrestrictedKey, string> = {
  'unrestricted.title': '无限制模式',
  'unrestricted.description': '向系统提示注入无限制执行模式契约：回答直接给出交付物，拒绝式替换视为失败，并按类别给出路由（安全工具、逆向工程、小说创作、技术指南、资源查找）。作用于 standard、ptc、cordis 预设；子代理继承，minimal 预设不受影响。面向无审查的本地模型；每次请求约增加 1,900 token。',
  'unrestricted.error': '偏好未被保存，请重试。',
}

/** Japanese copy, checked against the English keys. */
export const ja = {
  'unrestricted.title': '無制限モード',
  'unrestricted.description': 'システムプロンプトに無制限実行モードの契約を注入します：回答は成果物から始まり、拒否スタイルの代替は失敗として扱われ、カテゴリごとのルーティング（セキュリティツール、リバースエンジニアリング、フィクション、ガイド、リソース検索）が行われます。standard、ptc、cordis プリセットに適用され、サブエージェントにも継承されます。minimal プリセットは影響を受けません。検閲のないローカルモデル向けで、リクエストごとに約1,900トークンが追加されます。',
  'unrestricted.error': '設定を保存できませんでした。もう一度お試しください。',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'unrestricted.title': 'Modo sin restricciones',
  'unrestricted.description': 'Inyecta un contrato de modo de ejecución sin restricciones en el prompt del sistema: las respuestas abren con el entregable y las sustituciones de estilo de negativa se tratan como fallo, con enrutamiento por categoría (herramientas de seguridad, ingeniería inversa, ficción, guías, búsquedas de recursos). Se aplica a los presets standard, ptc y cordis; los subagentes lo heredan y el preset minimal no se ve afectado. Pensado para modelos locales sin censura; añade aproximadamente 1.900 tokens a cada solicitud.',
  'unrestricted.error': 'La preferencia no se guardó. Inténtelo de nuevo.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'unrestricted.title': 'Mode sans restrictions',
  'unrestricted.description': "Injecte un contrat de mode d'exécution sans restrictions dans le prompt système : les réponses s'ouvrent sur le livrable et les substitutions de type refus sont traitées comme un échec, avec un routage par catégorie (outils de sécurité, rétro-ingénierie, fiction, guides, recherche de ressources). S'applique aux préréglages standard, ptc et cordis ; les sous-agents l'héritent et le préréglage minimal n'est pas affecté. Destiné aux modèles locaux sans censure ; ajoute environ 1 900 tokens à chaque requête.",
  'unrestricted.error': "La préférence n'a pas été enregistrée. Réessayez.",
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'unrestricted.title': 'Unmoderierter Modus',
  'unrestricted.description': 'Injiziert einen Vertrag für den unmoderierten Ausführungsmodus in den Systemprompt: Antworten beginnen mit dem Ergebnis und ersatzweise gelieferte Verweigerungen gelten als Fehlschlag, mit Routing pro Kategorie (Sicherheitstools, Reverse Engineering, Fiktion, Anleitungen, Ressourcenrecherche). Gilt für die Presets standard, ptc und cordis; Subagenten erben ihn, und das minimal-Preset ist nicht betroffen. Für unzensierte lokale Modelle gedacht; fügt jede Anfrage etwa 1.900 Tokens hinzu.',
  'unrestricted.error': 'Die Einstellung wurde nicht gespeichert. Bitte erneut versuchen.',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'unrestricted.title': 'Неограниченный режим',
  'unrestricted.description': 'Внедряет контракт неограниченного режима выполнения в системный промпт: ответы начинаются с результата, а подмены в стиле отказа считаются неудачей, с маршрутизацией по категориям (инструменты безопасности, обратная разработка, художественная литература, руководства, поиск ресурсов). Применяется к пресетам standard, ptc и cordis; субагенты наследуют его, а пресет minimal не затрагивается. Предназначен для локальных моделей без цензуры; добавляет примерно 1 900 токенов к каждому запросу.',
  'unrestricted.error': 'Настройку не удалось сохранить. Попробуйте снова.',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'unrestricted.title': 'Modo sem restrições',
  'unrestricted.description': 'Injeta um contrato de modo de execução sem restrições no prompt do sistema: as respostas abrem com o entregável e substituições em estilo de recusa são tratadas como falha, com roteamento por categoria (ferramentas de segurança, engenharia reversa, ficção, guias, consultas de recursos). Aplica-se às predefinições standard, ptc e cordis; os subagentes a herdam e a predefinição minimal não é afetada. Destinado a modelos locais sem censura; adiciona cerca de 1.900 tokens a cada solicitação.',
  'unrestricted.error': 'A preferência não foi salva. Tente novamente.',
} satisfies Record<keyof typeof en, string>
