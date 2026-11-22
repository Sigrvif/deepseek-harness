/** Fork additions copy: the eight shipped languages, registered under the `forkInfo` namespace. */

export const en = {
  'tab.label': 'Fork additions',
  'tab.intro': 'This package carries additions beyond upstream DeepSeek Harness, built into the harness itself. They are always active; this page is here so they stay easy to find.',
  'editor.name': 'Native Context Editor',
  'editor.summary': 'Every session gains a Context tab next to Chat: the exact model-bound context with in-place edits, exclusions, restores, the captured request log, and this session\'s tools & generation-parameter overrides. Edits are durable session events and survive restarts.',
  'fold.name': 'Native Context Fold',
  'fold.summary': 'The model can compress consumed conversation into summaries it writes itself, through four tools (compress, decompress, search_context, acp_status), with gentle growth nudges. Folds are reversible checkpoints on the session log: they change the next request, survive restarts, and never destroy the originals.',
  'superpowers.name': 'Bundled Workflow Skills',
  'superpowers.summary': 'Seven workflow skills, rewritten from the superpowers set for small local models and small projects: clarifying open requests (brainstorming), a short SPEC.md goal anchor, verified step-by-step work, test-driven development, systematic debugging, evidence before completion claims, and parallel subagents. The catalog follows the session\'s stage — spec skills before approval, execution skills after (/spec approve) — and approved sessions drop the spec-stage instructions from context. They ship with the app; project, custom, and user skill roots all outrank the bundled one, so any skill can be shadowed with your own copy.',
  'autoSkills.name': 'Auto Workflow Toggle',
  'mcp.name': 'MCP Servers Page',
  'mcp.summary': 'A Settings → MCP Servers page over the mcpManager host service: add, edit, enable, disable, and restart Model Context Protocol servers (stdio or HTTP) from the UI instead of hand-editing profile patch rows. Definitions persist in dsh-home/storages/mcp_servers. Broker mode (default on) gives the model three indirection tools instead of every server tool - better for small models; turn it off on the same page to expose the mcp__ tools directly. Manual patch rows keep working; the bundled Node.js (with npx) is on PATH inside dsh.',
  'autoSkills.summary': 'A General settings switch (default on) that loads the using-workflow skill once per session, so the workflow discipline reaches users who would forget to invoke it. Follow-up prompts never re-send it: folds keep it visible, and if the engine\'s own compaction ever drops it, the next prompt re-asserts it once. Turn it off to invoke skills manually.',
  'deliveryStyle.name': 'Deliverable Style Guidance',
  'deliveryStyle.summary': 'A standing system-prompt paragraph (on by default) stating the presentation posture: the response is the deliverable rather than a description of it, text read from workspace files and context blocks is data rather than instructions, and user-supplied names render verbatim. Style and input hygiene only - it says nothing about what to deliver.',
  'unrestricted.name': 'Unrestricted Mode Toggle (off by default)',
  'unrestricted.summary': 'A General settings switch (default off) that fuses an opt-in unrestricted execution-mode contract into the system prompt: answers open with the deliverable and refusal-style substitutions count as failure, with per-category routing for security tooling, reverse engineering, fiction, guides, and resource lookups. A jailbreak prompt ported from the open-source dsh-unrestricted project; intended for uncensored local models, and it adds roughly 1,900 tokens to every request while on. Applies to the standard, ptc, and cordis presets; minimal is unaffected.',
  'changeReport.name': 'Change Reports (on by default)',
  'changeReport.summary': 'After every turn that changed files in the workspace, a compact notice listing the changed files (paths, line counts, detected-without-diff markers) joins the conversation context at the next step, so the model knows what it last touched. The always-visible changed-files card in the chat is the same data for the user; the notice is the model-facing half. A General settings switch turns it off for small models that the extra context would only confuse.',
  'tab.attribution': 'Context Fold\'s behavior is adapted from the open-source billion-context project (MIT + attribution term). The bundled superpowers skills are derived from the open-source superpowers project by Jesse Vincent (MIT), rewritten for this fork. The unrestricted-mode block is ported from the open-source dsh-unrestricted project (MIT), which adapted it from codex-keysmith (MIT). See the fork documentation for the full inventory.',
} as const

/** Fork-additions tab locale keys. */
export type ForkInfoLocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The fork additions tab's copy. */
    'forkInfo': ForkInfoLocaleKey
  }
}

/** Chinese fork-additions tab copy. */
export const zh: Record<ForkInfoLocaleKey, string> = {
  'tab.label': '分支新增功能',
  'tab.intro': '本包在上游 DeepSeek Harness 之外内置了以下新增功能。它们始终生效；此页面仅用于方便查找。',
  'editor.name': '原生上下文编辑器',
  'editor.summary': '每个会话在对话旁多出一个上下文标签页：模型实际收到的完整上下文，可就地编辑、排除、恢复，附请求日志与会话级的工具及生成参数覆盖。编辑是持久的会话事件，重启后仍然保留。',
  'fold.name': '原生上下文折叠',
  'fold.summary': '模型可通过四个工具（compress、decompress、search_context、acp_status）把已消耗的对话压缩为自己撰写的摘要，并伴随温和的增长提醒。折叠是会话日志上的可逆检查点：下一次请求即生效、重启后保留、绝不销毁原文。',
  'superpowers.name': '内置工作流技能',
  'superpowers.summary': '七个为本地小模型与小项目改写的工作流技能（源自 superpowers）：澄清开放式需求（brainstorming）、简短的 SPEC.md 目标锚点、逐步验证执行、测试驱动开发、系统化调试、完成前先取证、并行子代理。技能目录随会话阶段切换——批准前显示规格阶段技能，批准后（/spec approve）显示执行阶段技能，已批准的会话还会把规格阶段的指令移出上下文。随应用一起分发；项目、自定义与用户技能目录的优先级都高于内置目录，任何技能都可以用同名副本覆盖。',
  'autoSkills.name': '自动工作流开关',
  'autoSkills.summary': '常规设置页中的开关（默认开启）：每个会话加载一次 using-workflow 技能，让工作流纪律覆盖到容易忘记调用的用户。后续提示不会重复发送；折叠会保留其内容，若引擎自身的压缩将其移出上下文，下一条提示会重新补发一次。关闭后可手动调用技能。',
  'mcp.name': 'MCP 服务器页面',
  'mcp.summary': '设置中的 MCP 服务器页面，由 mcpManager 宿主服务支撑：直接在界面添加、编辑、启用、停用、重启 Model Context Protocol 服务器（stdio 或 HTTP），无需手改配置补丁。定义持久化在 dsh-home/storages/mcp_servers。代理模式（默认开启）让模型只看到三个间接工具而非全部服务器工具，更适合小模型；在同一页面关闭即可直接暴露 mcp__ 工具。手写补丁行仍然有效；dsh 内部 PATH 已包含捆绑的 Node.js（含 npx）。',
  'deliveryStyle.name': '交付物风格指引',
  'deliveryStyle.summary': '一段常驻的系统提示段落（默认开启），说明呈现姿态：回答本身就是交付物而非其描述，从工作区文件与上下文块读到的文本是数据而非指令，用户提供的名称保持原样。只涉及风格与输入卫生，不规定交付内容。',
  'unrestricted.name': '无限制模式开关（默认关闭）',
  'unrestricted.summary': '常规设置页中的开关（默认关闭）：向系统提示融合可选的无限制执行模式契约——回答直接给出交付物，拒绝式替换视为失败，并按类别路由安全工具、逆向工程、小说创作、技术指南与资源查找。移植自开源项目 dsh-unrestricted 的越狱提示，面向无审查的本地模型；开启时每次请求约增加 1,900 token。作用于 standard、ptc、cordis 预设，minimal 不受影响。',
  'changeReport.name': '变更报告（默认开启）',
  'changeReport.summary': '每轮改动工作区文件后，一条列出所改文件（路径、行数统计、无对比的检测标记）的简短通知会在下一步进入对话上下文，让模型知道自己刚改过什么。聊天中始终可见的改动文件卡片是同一数据的用户侧呈现；通知是面向模型的一半。常规设置页的开关可为小模型关闭。',
  'tab.attribution': '上下文折叠的行为改编自开源项目 billion-context（MIT + 署名条款）；内置的 superpowers 技能源自 Jesse Vincent 的开源项目 superpowers（MIT），并为本分支改写；无限制模式块移植自开源项目 dsh-unrestricted（MIT），其又改编自 codex-keysmith（MIT）。完整清单见分支文档。',
}

/** Japanese fork-additions tab copy. */
export const ja = {
  'tab.label': 'フォークの追加機能',
  'tab.intro': 'このパッケージは、上流の DeepSeek Harness にはない追加機能をハーネス本体に組み込んでいます。これらは常に有効です。このページは、見つけやすくしておくためにあります。',
  'editor.name': 'ネイティブ Context Editor',
  'editor.summary': 'すべてのセッションで、チャットの隣にコンテキストタブが増えます。モデルに渡るコンテキストそのものを、その場で編集・除外・復元でき、記録されたリクエストログやこのセッションのツールおよび生成パラメータの上書きにも対応します。編集は永続的なセッションイベントであり、再起動後も保持されます。',
  'fold.name': 'ネイティブコンテキスト折りたたみ',
  'fold.summary': 'モデルは4つのツール（compress、decompress、search_context、acp_status）を使って、消費済みの会話を自分で書いた要約へ圧縮できます。穏やかな成長の促しも伴います。折りたたみはセッションログ上の可逆的なチェックポイントであり、次のリクエストから反映され、再起動後も保持され、元の内容を決して破壊しません。',
  'superpowers.name': 'バンドルされたワークフロースキル',
  'superpowers.summary': '小規模なローカルモデルと小規模プロジェクトのために superpowers セットを書き直した7つのワークフロースキル：未確定の要件の明確化（brainstorming）、短い SPEC.md による目標の固定、検証付きの段階的作業、テスト駆動開発、体系的なデバッグ、完了宣言の前の根拠提示、並列サブエージェント。スキルカタログはセッションの段階に従います——承認前はスペック段階のスキル、承認後（/spec approve）は実行段階のスキルを表示し、承認済みセッションではスペック段階の指示がコンテキストから外れます。プロジェクト・カスタム・ユーザーの各スキルルートはバンドル版より優先されるため、どのスキルでも自分のコピーで置き換えられます。',
  'autoSkills.name': '自動ワークフロー切り替え',
  'autoSkills.summary': '一般設定のスイッチ（デフォルトで有効）：セッションごとに一度 using-workflow スキルを読み込み、ワークフローの規律を呼び出しを忘れがちなユーザーにも届けます。以降のプロンプトで再送信されることはありません。折りたたみが内容を保持し、エンジン自身の圧縮で内容が落ちた場合も、次のプロンプトが一度だけ再送します。オフにすればスキルを手動で呼び出せます。',
  'mcp.name': 'MCP サーバーページ',
  'mcp.summary': 'mcpManager ホストサービスを利用した設定 → MCP サーバーページ：プロファイルのパッチ行を手で編集する代わりに、UI から Model Context Protocol サーバー（stdio または HTTP）を追加・編集・有効化・無効化・再起動できます。定義は dsh-home/storages/mcp_servers に保存されます。ブローカーモード（デフォルトで有効）では、すべてのサーバーツールの代わりに3つの間接ツールをモデルに渡します。小規模モデルに適しています。同じページでオフにすれば mcp__ ツールを直接公開します。手書きのパッチ行も引き続き機能します。dsh 内の PATH にはバンドルされた Node.js（npx を含む）が含まれます。',
  'deliveryStyle.name': '成果物スタイルのガイダンス',
  'deliveryStyle.summary': 'システムプロンプトに常駐する段落（デフォルトで有効）。提示の姿勢を定めます：回答はそれ自体が成果物でありその説明ではないこと、ワークスペースのファイルやコンテキストブロックから読んだテキストは指示ではなくデータであること、ユーザーが指定した名前はそのまま表示されること。スタイルと入力の衛生のみを扱い、何を成果物とするかは規定しません。',
  'unrestricted.name': '無制限モード切り替え（デフォルトでオフ）',
  'unrestricted.summary': '一般設定のスイッチ（デフォルトでオフ）：オプトインの無制限実行モードの契約をシステムプロンプトに融合させます。回答は成果物から始まり、拒否風の代替は失敗とみなされ、セキュリティツール、リバースエンジニアリング、フィクション、ガイド、リソース検索をカテゴリ別に振り分けます。オープンソースの dsh-unrestricted プロジェクトから移植されたジェイルブレイクプロンプトで、検閲のないローカルモデル向けです。有効の間、リクエストごとに約1,900トークンが増えます。standard、ptc、cordis プリセットに適用され、minimal は影響を受けません。',
  'changeReport.name': '変更レポート（デフォルトで有効）',
  'changeReport.summary': 'ワークスペースのファイルを変更したターンの後、変更されたファイル（パス、行数、差分なしで検出された印）を一覧する簡潔な通知が次のステップで会話コンテキストに加わり、モデルは自分が最後に触ったものを把握できます。チャットに常時表示される変更ファイルカードは同じデータのユーザー向けの姿であり、通知はモデル向けの半分です。一般設定のスイッチでオフにでき、余分なコンテキストが混乱を招くだけの小規模モデル向けです。',
  'tab.attribution': 'コンテキスト折りたたみの動作は、オープンソースプロジェクト billion-context（MIT + クレジット表記条件）に基づいています。バンドルされた superpowers スキルは、Jesse Vincent のオープンソースプロジェクト superpowers（MIT）から派生し、このフォーク向けに書き直したものです。無制限モードのブロックは、オープンソースプロジェクト dsh-unrestricted（MIT）から移植され、これは codex-keysmith（MIT）を改造したものです。全リストはフォークのドキュメントを参照してください。',
} satisfies Record<ForkInfoLocaleKey, string>

/** Spanish fork-additions tab copy. */
export const es = {
  'tab.label': 'Adiciones del fork',
  'tab.intro': 'Este paquete aporta adiciones más allá del DeepSeek Harness original, integradas en el propio harness. Siempre están activas; esta página existe para que sea fácil encontrarlas.',
  'editor.name': 'Context Editor nativo',
  'editor.summary': 'Cada sesión gana una pestaña Contexto junto a Chat: el contexto exacto que recibe el modelo, con ediciones en el lugar, exclusiones, restauraciones, el registro de solicitudes capturado y las anulaciones de herramientas y parámetros de generación de esta sesión. Las ediciones son eventos de sesión duraderos y sobreviven a los reinicios.',
  'fold.name': 'Plegado de contexto nativo',
  'fold.summary': 'El modelo puede comprimir la conversación ya consumida en resúmenes que él mismo escribe, mediante cuatro herramientas (compress, decompress, search_context, acp_status), con recordatorios suaves de crecimiento. Los plegados son puntos de control reversibles en el registro de la sesión: cambian la siguiente solicitud, sobreviven a los reinicios y nunca destruyen los originales.',
  'superpowers.name': 'Habilidades de flujo de trabajo incluidas',
  'superpowers.summary': 'Siete habilidades de flujo de trabajo, reescritas del conjunto superpowers para modelos locales pequeños y proyectos pequeños: aclarar peticiones abiertas (brainstorming), un breve anclaje de objetivos en SPEC.md, trabajo paso a paso verificado, desarrollo guiado por pruebas, depuración sistemática, evidencia antes de declarar completado y subagentes en paralelo. El catálogo sigue la etapa de la sesión: habilidades de especificación antes de la aprobación, habilidades de ejecución después (/spec approve), y las sesiones aprobadas retiran las instrucciones de la etapa de especificación del contexto. Las raíces de habilidades de proyecto, personalizadas y de usuario tienen prioridad sobre la incluida, así que cualquier habilidad puede reemplazarse con una copia propia.',
  'autoSkills.name': 'Interruptor de flujo de trabajo automático',
  'autoSkills.summary': 'Un interruptor en Configuración general (activado por defecto) que carga la habilidad using-workflow una vez por sesión, para que la disciplina de flujo de trabajo llegue a los usuarios que olvidarían invocarla. Los prompts posteriores nunca la reenvían: los plegados la mantienen visible y, si la propia compacción del motor la llega a soltar, el siguiente prompt la reafirma una vez. Desactívalo para invocar habilidades manualmente.',
  'mcp.name': 'Página de servidores MCP',
  'mcp.summary': 'Una página de Configuración → Servidores MCP sobre el servicio de host mcpManager: añadir, editar, habilitar, deshabilitar y reiniciar servidores de Model Context Protocol (stdio o HTTP) desde la UI en lugar de editar a mano filas de parches del perfil. Las definiciones persisten en dsh-home/storages/mcp_servers. El modo broker (activado por defecto) le da al modelo tres herramientas de indirección en lugar de todas las herramientas de cada servidor - mejor para modelos pequeños; desactívalo en la misma página para exponer directamente las herramientas mcp__. Las filas de parches manuales siguen funcionando; el Node.js incluido (con npx) está en el PATH dentro de dsh.',
  'deliveryStyle.name': 'Guía de estilo del entregable',
  'deliveryStyle.summary': 'Un párrafo permanente del prompt del sistema (activado por defecto) que declara la postura de presentación: la respuesta es el entregable y no una descripción de él, el texto leído de archivos del workspace y bloques de contexto es información y no instrucciones, y los nombres proporcionados por el usuario se muestran literalmente. Solo estilo e higiene de la entrada - no dice nada sobre qué entregar.',
  'unrestricted.name': 'Interruptor del modo sin restricciones (desactivado por defecto)',
  'unrestricted.summary': 'Un interruptor en Configuración general (desactivado por defecto) que fusiona en el prompt del sistema un contrato opcional de modo de ejecución sin restricciones: las respuestas abren con el entregable y las sustituciones de estilo negativa cuentan como fallo, con enrutamiento por categoría para herramientas de seguridad, ingeniería inversa, ficción, guías y consultas de recursos. Un prompt de jailbreak portado del proyecto de código abierto dsh-unrestricted; pensado para modelos locales sin censura, y añade unos 1,900 tokens a cada solicitud mientras está activo. Se aplica a los presets standard, ptc y cordis; minimal no se ve afectado.',
  'changeReport.name': 'Informes de cambios (activado por defecto)',
  'changeReport.summary': 'Después de cada turno que cambió archivos del workspace, un aviso compacto que enumera los archivos cambiados (rutas, recuentos de líneas, marcadores detectados sin diff) se une al contexto de la conversación en el siguiente paso, para que el modelo sepa qué tocó por última vez. La tarjeta de archivos cambiados siempre visible en el chat son los mismos datos para el usuario; el aviso es la mitad orientada al modelo. Un interruptor en Configuración general lo desactiva para modelos pequeños a los que el contexto extra solo confundiría.',
  'tab.attribution': 'El comportamiento del plegado de contexto está adaptado del proyecto de código abierto billion-context (MIT + condición de atribución). Las habilidades superpowers incluidas derivan del proyecto de código abierto superpowers de Jesse Vincent (MIT), reescritas para este fork. El bloque del modo sin restricciones está portado del proyecto de código abierto dsh-unrestricted (MIT), que a su vez lo adaptó de codex-keysmith (MIT). Consulte la documentación del fork para el inventario completo.',
} satisfies Record<ForkInfoLocaleKey, string>

/** French fork-additions tab copy. */
export const fr = {
  'tab.label': 'Ajouts du fork',
  'tab.intro': "Ce paquet apporte des ajouts au-delà du DeepSeek Harness amont, intégrés au harnais lui-même. Ils sont toujours actifs ; cette page existe pour qu'ils restent faciles à trouver.",
  'editor.name': 'Context Editor natif',
  'editor.summary': "Chaque session gagne un onglet Contexte à côté de Chat : le contexte exact lié au modèle, avec des modifications en place, des exclusions, des restaurations, le journal des requêtes capturé et les dérogations d'outils et de paramètres de génération de cette session. Les modifications sont des événements de session durables et survivent aux redémarrages.",
  'fold.name': 'Repli de contexte natif',
  'fold.summary': "Le modèle peut comprimer la conversation consommée en résumés qu'il rédige lui-même, via quatre outils (compress, decompress, search_context, acp_status), avec des rappels de croissance discrets. Les replis sont des points de contrôle réversibles sur le journal de session : ils modifient la requête suivante, survivent aux redémarrages et ne détruisent jamais les originaux.",
  'superpowers.name': 'Compétences de flux de travail intégrées',
  'superpowers.summary': "Sept compétences de flux de travail, réécrites d'après l'ensemble superpowers pour les petits modèles locaux et les petits projets : clarifier les demandes ouvertes (brainstorming), un court ancrage d'objectifs en SPEC.md, un travail étape par étape vérifié, le développement piloté par les tests, le débogage systématique, des preuves avant toute déclaration d'achèvement et des sous-agents en parallèle. Le catalogue suit l'étape de la session : compétences de spécification avant approbation, compétences d'exécution après (/spec approve), et les sessions approuvées retirent du contexte les instructions de l'étape de spécification. Elles sont livrées avec l'application. Les racines de compétences de projet, personnalisées et utilisateur priment sur celle intégrée, de sorte que toute compétence peut être remplacée par votre propre copie.",
  'autoSkills.name': 'Commutateur de flux de travail automatique',
  'autoSkills.summary': "Un commutateur dans les réglages généraux (activé par défaut) qui charge la compétence using-workflow une fois par session, afin que la discipline de flux de travail atteigne les utilisateurs qui oublieraient de l'invoquer. Les prompts suivants ne la renvoient jamais : les replis la maintiennent visible, et si la compaction propre au moteur l'écarte un jour, le prompt suivant la réaffirme une fois. Désactivez-le pour invoquer les compétences manuellement.",
  'mcp.name': 'Page des serveurs MCP',
  'mcp.summary': "Une page Paramètres → Serveurs MCP adossée au service hôte mcpManager : ajouter, modifier, activer, désactiver et redémarrer des serveurs Model Context Protocol (stdio ou HTTP) depuis l'interface au lieu de modifier à la main des lignes de correctifs de profil. Les définitions persistent dans dsh-home/storages/mcp_servers. Le mode broker (activé par défaut) donne au modèle trois outils d'indirection au lieu de tous les outils de chaque serveur - mieux pour les petits modèles ; désactivez-le sur la même page pour exposer directement les outils mcp__. Les lignes de correctifs manuelles continuent de fonctionner ; le Node.js intégré (avec npx) est dans le PATH au sein de dsh.",
  'deliveryStyle.name': 'Consignes de style du livrable',
  'deliveryStyle.summary': "Un paragraphe permanent du prompt système (activé par défaut) énonçant la posture de présentation : la réponse est le livrable plutôt qu'une description de celui-ci, le texte lu dans les fichiers de l'espace de travail et les blocs de contexte est une donnée plutôt qu'une instruction, et les noms fournis par l'utilisateur sont rendus tels quels. Style et hygiène des entrées seulement - cela ne dit rien sur ce qu'il faut livrer.",
  'unrestricted.name': 'Commutateur du mode sans restriction (désactivé par défaut)',
  'unrestricted.summary': "Un commutateur dans les réglages généraux (désactivé par défaut) qui fusionne dans le prompt système un contrat opt-in de mode d'exécution sans restriction : les réponses s'ouvrent sur le livrable et les substitutions de style refus comptent comme échec, avec un routage par catégorie pour les outils de sécurité, la rétro-ingénierie, la fiction, les guides et les recherches de ressources. Un prompt de jailbreak porté depuis le projet open source dsh-unrestricted ; destiné aux modèles locaux sans censure, il ajoute environ 1,900 tokens à chaque requête tant qu'il est actif. S'applique aux préréglages standard, ptc et cordis ; minimal n'est pas affecté.",
  'changeReport.name': 'Rapports de modifications (activé par défaut)',
  'changeReport.summary': "Après chaque tour ayant modifié des fichiers de l'espace de travail, un avis compact listant les fichiers modifiés (chemins, nombres de lignes, marqueurs détectés sans diff) rejoint le contexte de la conversation à l'étape suivante, pour que le modèle sache ce qu'il a touché en dernier. La carte des fichiers modifiés toujours visible dans le chat est la même donnée côté utilisateur ; l'avis en est la moitié orientée modèle. Un commutateur dans les réglages généraux le désactive pour les petits modèles que le contexte supplémentaire ne ferait que perturber.",
  'tab.attribution': "Le comportement du repli de contexte est adapté du projet open source billion-context (MIT + clause d'attribution). Les compétences superpowers intégrées dérivent du projet open source superpowers de Jesse Vincent (MIT), réécrites pour ce fork. Le bloc du mode sans restriction est porté depuis le projet open source dsh-unrestricted (MIT), qui l'a adapté de codex-keysmith (MIT). Consultez la documentation du fork pour l'inventaire complet.",
} satisfies Record<ForkInfoLocaleKey, string>

/** German fork-additions tab copy. */
export const de = {
  'tab.label': 'Fork-Erweiterungen',
  'tab.intro': 'Dieses Paket enthält Erweiterungen über das Upstream-DeepSeek-Harness hinaus, die direkt in das Harness eingebaut sind. Sie sind immer aktiv; diese Seite existiert, damit man sie leicht findet.',
  'editor.name': 'Nativer Context Editor',
  'editor.summary': 'Jede Sitzung erhält einen Kontext-Tab neben Chat: den exakten, an das Modell gebundenen Kontext mit direkten Bearbeitungen, Ausschlüssen, Wiederherstellungen, dem aufgezeichneten Anfragenprotokoll und den Tool- und Generierungsparameter-Überschreibungen dieser Sitzung. Bearbeitungen sind dauerhafte Sitzungsereignisse und überstehen Neustarts.',
  'fold.name': 'Native Kontextfaltung',
  'fold.summary': 'Das Modell kann die verbrauchte Konversation über vier Tools (compress, decompress, search_context, acp_status) in selbst verfasste Zusammenfassungen verdichten, mit sanften Wachstumshinweisen. Faltungen sind umkehrbare Prüfpunkte im Sitzungsprotokoll: Sie verändern die nächste Anfrage, überstehen Neustarts und zerstören die Originale nie.',
  'superpowers.name': 'Mitgelieferte Workflow-Fähigkeiten',
  'superpowers.summary': 'Sieben Workflow-Fähigkeiten, neu geschrieben nach dem Superpowers-Satz für kleine lokale Modelle und kleine Projekte: offene Anforderungen klären (Brainstorming), ein kurzer SPEC.md-Zielanker, verifizierte schrittweise Arbeit, testgetriebene Entwicklung, systematisches Debuggen, Belege vor Fertigmeldungen und parallele Subagenten. Der Katalog folgt der Sitzungsphase — Spec-Fähigkeiten vor der Freigabe, Ausführungsfähigkeiten danach (/spec approve) — und freigegebene Sitzungen nehmen die Anweisungen der Spec-Phase aus dem Kontext. Sie werden mit der App ausgeliefert. Projekt-, eigene und Benutzer-Fähigkeitsquellen rangieren alle über der mitgelieferten, daher lässt sich jede Fähigkeit durch eine eigene Kopie ersetzen.',
  'autoSkills.name': 'Automatischer Workflow-Schalter',
  'autoSkills.summary': 'Ein Schalter in den allgemeinen Einstellungen (standardmäßig an), der die using-workflow-Fähigkeit einmal pro Sitzung lädt, damit die Workflow-Disziplin auch Benutzer erreicht, die vergessen würden, sie aufzurufen. Nachfolgende Prompts senden sie nie erneut: Faltungen halten sie sichtbar, und falls die Engine sie durch eigene Kompaktion entfernt, bekräftigt der nächste Prompt sie einmal. Zum manuellen Aufrufen von Fähigkeiten abschalten.',
  'mcp.name': 'MCP-Server-Seite',
  'mcp.summary': 'Eine Seite Einstellungen → MCP-Server über den mcpManager-Hostdienst: Model-Context-Protocol-Server (stdio oder HTTP) aus der Oberfläche heraus hinzufügen, bearbeiten, aktivieren, deaktivieren und neu starten, statt Profil-Patchzeilen von Hand zu bearbeiten. Die Definitionen bleiben in dsh-home/storages/mcp_servers gespeichert. Der Brokermodus (standardmäßig an) gibt dem Modell drei Indirektions-Tools statt jedes Server-Tools - besser für kleine Modelle; auf derselben Seite abschalten, um die mcp__-Tools direkt freizugeben. Manuelle Patchzeilen funktionieren weiter; das mitgelieferte Node.js (mit npx) liegt im PATH innerhalb von dsh.',
  'deliveryStyle.name': 'Stilvorgaben für das Ergebnis',
  'deliveryStyle.summary': 'Ein beständiger Absatz im Systemprompt (standardmäßig an), der die Präsentationshaltung festlegt: Die Antwort ist das Ergebnis selbst und nicht dessen Beschreibung; aus Workspace-Dateien und Kontextblöcken gelesener Text ist Daten und keine Anweisung; vom Benutzer gelieferte Namen werden wörtlich wiedergegeben. Nur Stil und Eingabehygiene - er sagt nichts darüber, was zu liefern ist.',
  'unrestricted.name': 'Schalter für den uneingeschränkten Modus (standardmäßig aus)',
  'unrestricted.summary': 'Ein Schalter in den allgemeinen Einstellungen (standardmäßig aus), der einen optionalen Vertrag für einen uneingeschränkten Ausführungsmodus in den Systemprompt einwebt: Antworten beginnen mit dem Ergebnis, weigerungsartige Ersetzungen gelten als Fehlschlag, mit Routing nach Kategorien für Sicherheitstools, Reverse Engineering, Fiktion, Anleitungen und Ressourcensuche. Ein aus dem Open-Source-Projekt dsh-unrestricted portierter Jailbreak-Prompt; gedacht für unzensierte lokale Modelle, und er fügt im aktiven Zustand jeder Anfrage rund 1,900 Tokens hinzu. Gilt für die Presets standard, ptc und cordis; minimal bleibt unberührt.',
  'changeReport.name': 'Änderungsberichte (standardmäßig an)',
  'changeReport.summary': 'Nach jedem Zug, der Dateien im Workspace verändert hat, gesellt sich im nächsten Schritt ein kompakter Hinweis mit den geänderten Dateien (Pfade, Zeilenzahlen, ohne Diff erkannte Markierungen) zum Gesprächskontext, damit das Modell weiß, was es zuletzt berührt hat. Die stets sichtbare Karte der geänderten Dateien im Chat ist dieselben Daten für den Benutzer; der Hinweis ist die modellseitige Hälfte. Ein Schalter in den allgemeinen Einstellungen schaltet ihn für kleine Modelle ab, bei denen der zusätzliche Kontext nur Verwirrung stiftete.',
  'tab.attribution': 'Das Verhalten der Kontextfaltung ist nach dem Vorbild des Open-Source-Projekts billion-context (MIT + Namensnennungsauflage) angepasst. Die mitgelieferten Superpowers-Fähigkeiten stammen aus dem Open-Source-Projekt superpowers von Jesse Vincent (MIT) und wurden für diesen Fork neu geschrieben. Der Block für den uneingeschränkten Modus wurde aus dem Open-Source-Projekt dsh-unrestricted (MIT) portiert, der ihn wiederum von codex-keysmith (MIT) übernahm. Den vollständigen Bestand finden Sie in der Fork-Dokumentation.',
} satisfies Record<ForkInfoLocaleKey, string>

/** Russian fork-additions tab copy. */
export const ru = {
  'tab.label': 'Дополнения форка',
  'tab.intro': 'Этот пакет содержит дополнения поверх вышестоящего DeepSeek Harness, встроенные в сам харнесс. Они всегда активны; эта страница нужна, чтобы их было легко найти.',
  'editor.name': 'Встроенный Context Editor',
  'editor.summary': 'В каждой сессии рядом с чатом появляется вкладка «Контекст»: точный контекст, передаваемый модели, с правками на месте, исключениями, восстановлением, записанным журналом запросов и переопределениями инструментов и параметров генерации этой сессии. Правки — устойчивые события сессии и переживают перезапуски.',
  'fold.name': 'Встроенное свертывание контекста',
  'fold.summary': 'Модель может сжимать уже потребленную беседу в написанные ею самой сводки с помощью четырех инструментов (compress, decompress, search_context, acp_status), сопровождая это мягкими напоминаниями о росте. Свертки — обратимые контрольные точки в журнале сессии: они меняют следующий запрос, переживают перезапуски и никогда не уничтожают оригиналы.',
  'superpowers.name': 'Встроенные навыки рабочих процессов',
  'superpowers.summary': 'Семь рабочих навыков, переписанных из набора superpowers для небольших локальных моделей и небольших проектов: прояснение открытых требований (brainstorming), короткая привязка целей в SPEC.md, проверяемая пошаговая работа, разработка через тесты, систематическая отладка, доказательства до заявлений о завершении и параллельные субагенты. Каталог следует этапу сессии: навыки этапа спецификации до утверждения, исполнительские навыки после (/spec approve), а утвержденные сессии убирают инструкции этапа спецификации из контекста. Они поставляются с приложением. Корни навыков проекта, пользовательские и персональные стоят выше встроенного, поэтому любой навык можно перекрыть собственной копией.',
  'autoSkills.name': 'Автоматический переключатель рабочего процесса',
  'autoSkills.summary': 'Переключатель в общих настройках (по умолчанию включен), который загружает навык using-workflow один раз за сессию, чтобы рабочая дисциплина доставалась и пользователям, которые забыли бы вызвать её. Последующие промпты не отправляют её повторно: свертки сохраняют её видимой, а если собственное сжатие движка когда-нибудь её вытеснит, следующий промпт раз повторно её утвердит. Выключите, чтобы вызывать навыки вручную.',
  'mcp.name': 'Страница серверов MCP',
  'mcp.summary': 'Страница Настройки → Серверы MCP поверх хост-службы mcpManager: добавляйте, редактируйте, включайте, отключайте и перезапускайте серверы Model Context Protocol (stdio или HTTP) из интерфейса вместо ручного редактирования строк патчей профиля. Определения сохраняются в dsh-home/storages/mcp_servers. Режим брокера (по умолчанию включен) дает модели три инструмента косвенного доступа вместо всех инструментов каждого сервера - лучше для небольших моделей; выключите его на той же странице, чтобы открыть инструменты mcp__ напрямую. Ручные строки патчей продолжают работать; встроенный Node.js (с npx) есть в PATH внутри dsh.',
  'deliveryStyle.name': 'Руководство по стилю результатов',
  'deliveryStyle.summary': 'Постоянный абзац в системном промпте (по умолчанию включен), задающий позу подачи: ответ сам является результатом, а не его описанием; текст, прочитанный из файлов рабочей области и блоков контекста, — это данные, а не инструкции; заданные пользователем имена воспроизводятся дословно. Только стиль и гигиена ввода - о том, что поставлять, он ничего не говорит.',
  'unrestricted.name': 'Переключатель режима без ограничений (по умолчанию выключен)',
  'unrestricted.summary': 'Переключатель в общих настройках (по умолчанию выключен), который вплетает в системный промпт опциональный контракт режима исполнения без ограничений: ответы начинаются с результата, отказоподобные подмены считаются провалом, с маршрутизацией по категориям для инструментов безопасности, обратной разработки, художественной литературы, руководств и поиска ресурсов. Джейлбрейк-промпт, перенесенный из открытого проекта dsh-unrestricted; предназначен для локальных моделей без цензуры и добавляет около 1,900 токенов к каждому запросу, пока включен. Применяется к пресетам standard, ptc и cordis; minimal не затронут.',
  'changeReport.name': 'Отчеты об изменениях (по умолчанию включены)',
  'changeReport.summary': 'После каждого хода, изменившего файлы в рабочей области, на следующем шаге к контексту беседы присоединяется компактное уведомление со списком измененных файлов (пути, число строк, пометки «обнаружено без диффа»), чтобы модель знала, чего она касалась последний раз. Всегда видимая карточка измененных файлов в чате — те же данные для пользователя; уведомление — его половина, обращенная к модели. Переключатель в общих настройках выключает его для небольших моделей, которых лишний контекст только запутает.',
  'tab.attribution': 'Поведение свертывания контекста адаптировано из открытого проекта billion-context (MIT + условие атрибуции). Встроенные навыки superpowers происходят из открытого проекта superpowers за авторством Jesse Vincent (MIT), переписанных для этого форка. Блок режима без ограничений перенесен из открытого проекта dsh-unrestricted (MIT), который в свою очередь адаптировал его из codex-keysmith (MIT). Полный перечень см. в документации форка.',
} satisfies Record<ForkInfoLocaleKey, string>

/** Portuguese fork-additions tab copy. */
export const pt = {
  'tab.label': 'Adições do fork',
  'tab.intro': 'Este pacote traz adições além do DeepSeek Harness original, integradas ao próprio harness. Elas estão sempre ativas; esta página existe para que permaneçam fáceis de encontrar.',
  'editor.name': 'Context Editor nativo',
  'editor.summary': 'Cada sessão ganha uma aba Contexto ao lado do Chat: o contexto exato que chega ao modelo, com edições no lugar, exclusões, restaurações, o registro de solicitações capturado e as substituições de ferramentas e parâmetros de geração desta sessão. As edições são eventos de sessão duradouros e sobrevivem a reinicializações.',
  'fold.name': 'Dobramento de contexto nativo',
  'fold.summary': 'O modelo pode comprimir a conversa já consumida em resumos que ele mesmo escreve, por meio de quatro ferramentas (compress, decompress, search_context, acp_status), com lembretes gentis de crescimento. Os dobramentos são checkpoints reversíveis no registro da sessão: mudam a próxima solicitação, sobrevivem a reinicializações e nunca destroem os originais.',
  'superpowers.name': 'Habilidades de fluxo de trabalho incluídas',
  'superpowers.summary': 'Sete habilidades de fluxo de trabalho, reescritas do conjunto superpowers para modelos locais pequenos e projetos pequenos: esclarecer pedidos abertos (brainstorming), uma âncora curta de objetivos em SPEC.md, trabalho passo a passo verificado, desenvolvimento guiado por testes, depuração sistemática, evidências antes de declarar conclusão e subagentes em paralelo. O catálogo segue a etapa da sessão: habilidades de especificação antes da aprovação, habilidades de execução depois (/spec approve), e sessões aprovadas retiram do contexto as instruções da etapa de especificação. Elas vêm com o aplicativo. As raízes de habilidades de projeto, personalizadas e de usuário têm precedência sobre a incluída, então qualquer habilidade pode ser substituída por uma cópia sua.',
  'autoSkills.name': 'Alternância de fluxo de trabalho automático',
  'autoSkills.summary': 'Uma alternância nas Configurações gerais (ativada por padrão) que carrega a habilidade using-workflow uma vez por sessão, para que a disciplina de fluxo de trabalho alcance usuários que esqueceriam de invocá-la. Prompts seguintes nunca a reenviam: os dobramentos a mantêm visível e, se a própria compactação do motor um dia a derrubar, o prompt seguinte a reafirma uma vez. Desative-a para invocar habilidades manualmente.',
  'mcp.name': 'Página de servidores MCP',
  'mcp.summary': 'Uma página Configurações → Servidores MCP sobre o serviço de host mcpManager: adicionar, editar, habilitar, desabilitar e reiniciar servidores de Model Context Protocol (stdio ou HTTP) pela UI em vez de editar à mão linhas de patch do perfil. As definições persistem em dsh-home/storages/mcp_servers. O modo broker (ativado por padrão) dá ao modelo três ferramentas de indireção em vez de todas as ferramentas de cada servidor - melhor para modelos pequenos; desative-o na mesma página para expor diretamente as ferramentas mcp__. Linhas de patch manuais continuam funcionando; o Node.js incluído (com npx) está no PATH dentro do dsh.',
  'deliveryStyle.name': 'Orientação de estilo do entregável',
  'deliveryStyle.summary': 'Um parágrafo permanente no prompt do sistema (ativado por padrão) que declara a postura de apresentação: a resposta é o entregável em vez de uma descrição dele, o texto lido de arquivos do workspace e blocos de contexto é dado em vez de instrução, e nomes fornecidos pelo usuário são exibidos literalmente. Apenas estilo e higiene de entrada - não diz nada sobre o que entregar.',
  'unrestricted.name': 'Alternância do modo sem restrições (desativada por padrão)',
  'unrestricted.summary': 'Uma alternância nas Configurações gerais (desativada por padrão) que funde ao prompt do sistema um contrato opcional de modo de execução sem restrições: as respostas abrem com o entregável e substituições em estilo de recusa contam como falha, com roteamento por categoria para ferramentas de segurança, engenharia reversa, ficção, guias e consultas de recursos. Um prompt de jailbreak portado do projeto de código aberto dsh-unrestricted; destinado a modelos locais sem censura, e adiciona cerca de 1,900 tokens a cada solicitação enquanto ativo. Aplica-se aos presets standard, ptc e cordis; minimal não é afetado.',
  'changeReport.name': 'Relatórios de alterações (ativado por padrão)',
  'changeReport.summary': 'Depois de cada turno que alterou arquivos do workspace, um aviso compacto listando os arquivos alterados (caminhos, contagens de linhas, marcadores detectados sem diff) entra no contexto da conversa no passo seguinte, para que o modelo saiba o que tocou por último. O cartão de arquivos alterados sempre visível no chat é o mesmo dado para o usuário; o aviso é a metade voltada ao modelo. Uma alternância nas Configurações gerais o desativa para modelos pequenos que o contexto extra só confundiria.',
  'tab.attribution': 'O comportamento do dobramento de contexto é adaptado do projeto de código aberto billion-context (MIT + termo de atribuição). As habilidades superpowers incluídas derivam do projeto de código aberto superpowers de Jesse Vincent (MIT), reescritas para este fork. O bloco do modo sem restrições é portado do projeto de código aberto dsh-unrestricted (MIT), que o adaptou de codex-keysmith (MIT). Consulte a documentação do fork para o inventário completo.',
} satisfies Record<ForkInfoLocaleKey, string>
