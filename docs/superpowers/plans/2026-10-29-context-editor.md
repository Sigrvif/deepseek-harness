# Context Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Context Editor for the dsh Web UI that makes every outbound model request visible (durable capture log) and the full model-bound context editable (messages, tools, params) — replacing the third-party plugin.

**Architecture:** Two new self-contained packages (host `packages/context/context-editor`, client `packages/client/ui-context-editor`) wired by additive rows in the web bundle patch; persistent edits use the official surface-replace event mechanism; request capture is a read-only `llm/stream` listener; per-session tools/params overrides flow through a tiny registry consumed at one marked seam in the agent loop. Exactly three small marked upstream edits (session derivation rule, agent-loop override seam, chat timeline truthfulness).

**Tech Stack:** TypeScript (pure tsc host build; tsdown client bundle), cordis plugins/waterfalls, Typert remotes, storage-domain (json backend), vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-context-editor-design.md` (read it first; this plan argues from it).

## Global Constraints

- Upstream diff budget: ONLY these upstream files may be modified, each edit marked `// fork(context-editor):` — `packages/core/session/src/surface.ts`, `packages/core/agent-loop/src/agent.ts` (+ one NEW additive file `packages/core/agent-loop/src/context-edit-registry.ts`), `packages/client/ui-chat/src/client/**`, `packages/bundle/web-app/cordis.patch.yml`. Everything else: new files only. Task 14 audits this with `git diff`.
- Workspace glob is `packages/*/*` — both new packages live two levels deep.
- Host packages: pure tsc (no scripts, no tsdown); deps as peerDependencies (`workspace:*` / `workspace:~`) mirrored in devDependencies; tsconfig extends `../../../tsconfig.base.json` with `references`; tests in `tests/*.spec.ts` run by root vitest project (`packages/*/*/tests/**/*.spec.{ts,tsx}`).
- Client packages: `tsdown.config.ts` using `clientBundle` from `../tsdown.client.ts`; `dsh.client` field in package.json; browser face under `src/client/`; CSS as `*.module.css`.
- Node >= 24.9 (system 26.10 OK); pnpm exactly `11.28.5` (packageManager field).
- Request log bound: keep last **30** requests per session (spec §4.1a).
- Param whitelist exactly: `temperature, maxTokens, stop, presencePenalty, frequencyPenalty` (only fields also present on `GenerateOptions`; reject everything else, including provider/model/reasoningEffort).
- Locales: en + zh, registered via `ctx.locale.register` (follow `ui-message-feedback`).
- New plugin/event source identifiers (verbatim): service key/namespace `contextEditor`; storage domain name `context_editor` (tables `requests`, `overrides`); message source discriminator `context-edit` (fields: `kind: 'context-edit'`, `mode: 'excluded' | 'edited'`); conversation.view id `context-editor` (order 20).
- Every commit message prefixed `feat(context-editor):` / `fix(context-editor):` / `docs(context-editor):` / `test(context-editor):`.

## Review Focus

The five failure modes most likely to bite a user, each pinned by a test in the owning task:

1. **Capture must never break or slow the request path** — a storage failure mid-capture must still stream the model response. Pinned in Task 2 (erroring domain → request succeeds, UI notice flag set).
2. **Edits during an in-flight turn must be refused, not partially applied** — no replacement may interleave with an open turn. Pinned in Task 4.
3. **Durability across restart and forks** — an edit made before a restart must reach the next request after restart; a fork must inherit edits but NOT overrides (UI states this). Pinned in Tasks 4 and 8.
4. **Unsigned-replay degradation after reasoning edits** — editing a signed reasoning block must leave the message replayable (other blocks keep signatures; the API error path auto-excludes). Pinned in Task 4.
5. **Request log truthfulness** — the captured payload must equal what the adapter dispatched, including override effects. Pinned in Task 8 (header/config/capture agreement).

---

### Task 1: Host package scaffold + storage domain

**Files:**
- Create: `packages/context/context-editor/package.json`
- Create: `packages/context/context-editor/tsconfig.json`
- Create: `packages/context/context-editor/src/index.ts`
- Create: `packages/context/context-editor/src/domain.ts`
- Create: `packages/context/context-editor/src/types.ts`
- Test: `packages/context/context-editor/tests/domain.spec.ts`

**Interfaces:**
- Produces: package `@deepseek-ai/dsh-context-editor`; `export const name = 'context-editor'`; `export const inject = ['sessions', 'sessionPersistence', 'llm', 'storageDomain', 'compaction']`; `export function apply(ctx: Context): void` (registers capture + service in later tasks; noop now). `export const contextEditorDomain = defineDomain({ name: 'context_editor', version: 1, tables: { requests: domainTable<string, CapturedRequest>(capturedRequestSchema), overrides: domainTable<string, OverridesRecord>(overridesRecordSchema) } })`.
- Produces (types.ts, consumed by all later tasks): `CapturedRequest { seq: number; time: string; purpose?: 'compaction' | 'session-title'; provider: string; model: string; config: Record<string, unknown>; tools?: unknown[]; messages: unknown[]; status: 'dispatched' | 'error' | 'aborted'; error?: string }`; `OverridesRecord { removedTools: string[]; toolEdits: Record<string, unknown>; params: Record<string, number | string[]> }` (zod schemas alongside, mirroring `packages/schedule/schedule/src/storage.ts:58-61`).

- [ ] **Step 1: Write the failing test** — `tests/domain.spec.ts`: open `contextEditorDomain` against a temp-dir storage-json backend (copy the harness setup of `packages/schedule/schedule/tests/` — same `storageDomain.open` mounting); assert `domain.table('requests').put('s#000001', fixture)` then `get` returns it, and `overrides` roundtrips.
- [ ] **Step 2: Run** `pnpm vitest run packages/context/context-editor` — expect FAIL (module not found).
- [ ] **Step 3: Implement** package.json (copy shape from `packages/session/session-checkpoint-policy/package.json`: peerDeps `@deepseek-ai/cordis` `workspace:~`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-session-persistence`, `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-storage-domain`, `@deepseek-ai/dsh-compaction`, `@deepseek-ai/dsh-typert-protocol` as `workspace:*`, mirrored in devDeps; exports `.` → `lib/`), tsconfig (references to those packages), src files per Interfaces.
- [ ] **Step 4: Run** again — PASS.
- [ ] **Step 5:** `git add packages/context/context-editor && git commit -m "feat(context-editor): host package scaffold and context_editor storage domain"`

### Task 2: Request capture

**Files:**
- Create: `packages/context/context-editor/src/capture.ts`
- Modify: `packages/context/context-editor/src/index.ts` (apply registers capture)
- Test: `packages/context/context-editor/tests/capture.spec.ts`

**Interfaces:**
- Consumes: Task 1 domain/types; cordis event `llm/stream` (signature: `(options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>`, registration `ctx.on('llm/stream', ...)` as in `packages/session/session-checkpoint-policy/src/index.ts:63-67`).
- Produces: `export function installRequestCapture(ctx: Context, table: KvTable<string, CapturedRequest>): void`. Key format `${sessionId}#${String(n).padStart(6, '0')}` where n is a per-session monotonic counter recovered as `max existing + 1` at install. FIFO bound: after each put, if a session's count exceeds 30, delete oldest keys. Serialization strips `signal` and JSON-clones `messages`/`tools`/`config` (frozen inputs are read-only — clone, never mutate). Stream wrapping: `const inner = await next()` then yield-through generator that sets `status: 'error' | 'aborted'` on generator throw/return-before-finish, leaving `'dispatched'` otherwise.

- [ ] **Step 1: Write failing tests** (harness: copy the fake-adapter context mount from `packages/compaction/compaction-basic/tests/manual-compaction.spec.ts:76-115` — `TextAdapter` pattern recording `options`, plus open the Task 1 domain): (a) one `ctx.llm.stream({provider, model, messages:[...], sessionId, purpose:'session-title'})` → table has 1 record with purpose/model/messages-length, status `dispatched`; (b) 35 streams → 30 records for that session; (c) adapter that throws mid-stream → record `status: 'error'` with message, and the throw still propagates to the caller; (d) capture with a domain whose `put` rejects (pass a stub table) → `ctx.llm.stream` still resolves and yields chunks (spec Review Focus 1).
- [ ] **Step 2: Run** — expect FAIL (installRequestCapture not defined).
- [ ] **Step 3: Implement** `capture.ts` per Interfaces; wire into `apply` (open domain, install).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5:** Commit `feat(context-editor): capture every outbound llm request into context_editor domain`

### Task 3: Projection + remote service (read side)

**Files:**
- Create: `packages/context/context-editor/src/projection.ts`
- Create: `packages/context/context-editor/src/service.ts`
- Modify: `packages/context/context-editor/src/index.ts` (provide service)
- Test: `packages/context/context-editor/tests/projection.spec.ts`, `tests/service.spec.ts`

**Interfaces:**
- Consumes: `Session` (`@deepseek-ai/dsh-session`: `session.log`, `session.surface.nodes`, `session.surface.contentGeneration`, `session.deriveMessages()`); token estimates `estimateMessage(message)` from `@deepseek-ai/dsh-token-meter/estimate`.
- Produces: `interface ContextRow { seq: number; role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'; text: string; blocks: unknown[]; excluded: boolean; editedFrom?: number[]; excludes?: number[]; estimateTokens: number }`; `interface ContextPreview { sessionId: string; rows: ContextRow[]; totalTokens: number; config: Record<string, unknown>; tools?: unknown[] }`. `export function previewContext(session: Session): ContextPreview` — walk `session.surface.nodes`, derive each event via `session.deriveEventMessage(event)`; provenance: replacement events (those with `surfaceOp.op === 'replace'`) carry `editedFrom`/`excludes` = their `sourceEventSeqs`; a row is `excluded` when its message source `kind === 'context-edit'` with `mode: 'excluded'`. Role from event type.
- Produces: `export class ContextEditorService extends TypertRemoteService` (pattern: `packages/feedback/message-feedback/src/index.ts:118-135`), `static inject = ['sessions', 'sessionPersistence', 'llm', 'storageDomain', 'compaction']`, `super(ctx, 'contextEditor')`; methods `@Remote('preview') async preview(sessionId): Promise<ContextPreview>` (live session via `ctx.sessions.get`, else cold read via `ctx.sessionPersistence.open(id, 'read')` + `Session.fromRestore` — mirror the cold pattern in `packages/feedback/message-feedback/src/index.ts:221-284`); `@Remote('list-requests') async listRequests(sessionId, before?): Promise<{ entries: CapturedRequest[]; hasMore: boolean; captureDegraded: boolean }>` (capture records a module-level degraded flag when a log write fails — consumed by the Task 12 notice); `@Remote('get-request') async getRequest(sessionId, seq): Promise<CapturedRequest>`.
- Generate typert descriptors: `pnpm exec tsx scripts/generate-typert.ts` (runs inside `pnpm run typecheck`).

- [ ] **Step 1: Failing tests** — projection: build a `Session.create(...)` synthetic log (user, assistant with reasoning+text blocks, tool pair), assert rows count/roles/text/estimates > 0; append a replacement event by hand (`session.append('user/message', msg, { surfaceOp: {op:'replace', startSeq: s, endSeq: s}, sourceEventSeqs: [s] })`) → preview shows the NEW text with `editedFrom: [s]`. Service: `listRequests` pages the Task 2 table (seed 35 → first page 30, `hasMore`, `before` fetches older); `preview` on a stored (non-live) session id returns rows via cold read.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both files; add `@Remote` decorators exactly as Interfaces; run `pnpm exec tsx scripts/generate-typert.ts`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5:** Commit `feat(context-editor): context projection and contextEditor remote (read side)`

### Task 4: Edit operations (edit / exclude)

**Files:**
- Create: `packages/context/context-editor/src/edits.ts`
- Modify: `packages/context/context-editor/src/service.ts` (add write remotes)
- Test: `packages/context/context-editor/tests/edits.spec.ts`

**Interfaces:**
- Consumes: `session.append(type, data, { surfaceOp, sourceEventSeqs })` (upstream validation runs inside — do not bypass); message constructors from `@deepseek-ai/dsh-llm` (`createUserMessage`, `createAssistantMessage`, … — same imports compaction uses in `region.ts:410-413`).
- Produces: `export async function editMessage(ctx: Context, sessionId: string, targetSeq: number, next: { role: 'user' | 'assistant' | 'developer' | 'system'; text: string } | { role: 'tool'; content: string }): Promise<void>` — replacement event of the SAME type as the target, `surfaceOp {op:'replace', startSeq: targetSeq, endSeq: targetSeq}`, `sourceEventSeqs: [targetSeq]`, message source `{ kind: 'context-edit', mode: 'edited' }`; assistant `next` embeds a single-step stream array (copy the block→stream mapping used by upstream assistant serialization). `export async function excludeRange(ctx, sessionId, startSeq, endSeq): Promise<void>` — ONE `user/message` replacement spanning the range, message content `[]` (empty), source `{ kind: 'context-edit', mode: 'excluded' }`, `sourceEventSeqs: [startSeq..endSeq]` (every shadowed node — upstream `assertSourceEventReferences` requires full coverage). Remotes: `@Remote('edit-message')`, `@Remote('exclude-range')` wrapping these. Refusals: target range not fully surface nodes → `RemoteError('context-editor/bad-range')`; any turn open (log tail has `turn/start` without matching `turn/end`) → `RemoteError('context-editor/busy')` (spec Review Focus 2). Cold sessions: persistence `'write'` handle pattern (Task 3's cold read, upgraded per the feedback cold-write pattern). Live sessions: `ctx.sessions.get(id)` then `flush()`.

- [ ] **Step 1: Failing tests** (synthetic sessions): (a) edit a user message → `session.deriveMessages()` returns the new text at that position and preview row shows `editedFrom`; (b) exclude a 3-node range → `deriveMessages()` omits ALL three (works fully only after Task 5's rule — write the assertion now, mark it `// needs derivation rule (Task 5)` and expect this specific test to stay red until then; the other assertions must pass); (c) edit while turn open → `context-editor/busy`; (d) edit a tool result's content → allowed; changing its `callId` → upstream validation error surfaces verbatim; (e) restart durability: append via persistence handle, close, reopen store, read log — replacement present (spec Review Focus 3); (f) reasoning edit: assistant message whose replay envelope carries a reasoning signature (fabricate `replayState` envelope per `packages/llm/llm-deepseek/src/replay.ts:40-48`) — replacement keeps envelope for other blocks, omits the edited block's entry; serialized replay validates (call `validateReplay` path via `readReplay` with the same model) (spec Review Focus 4).
- [ ] **Step 2: Run** — all FAIL except the marked (b) which FAILS as expected.
- [ ] **Step 3: Implement** `edits.ts` + remotes.
- [ ] **Step 4: Run** — PASS (except (b), still red — its final green is Task 5's acceptance).
- [ ] **Step 5:** Commit `feat(context-editor): message edit and range exclusion via surface replacement`

### Task 5: Marked upstream edit 1 — derivation rule

**Files:**
- Modify: `packages/core/session/src/surface.ts` (in `deriveEventMessage`, the switch at lines ~120-152)
- Test: `packages/core/session/tests/context-edit-derivation.spec.ts` (NEW file, ours)

**Interfaces:**
- Produces: `deriveEventMessage` returns `null` for a message whose content is empty (no blocks, or every block an empty text block) AND whose source discriminates `kind: 'context-edit'`. All other behavior byte-identical.

- [ ] **Step 1: Write failing test** — red test from Task 4(b) is the integration pin; add the unit pin here: session with an excluded-range replacement → `deriveMessages()` does not contain it; a NON-empty `context-edit` message and an empty NON-context-edit user message still derive (no behavior change beyond the rule).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the guard at the top of the switch in `deriveEventMessage`, commented `// fork(context-editor): excluded replacements carry nothing and derive to nothing.` Handle both data layouts (`user/message` message at `event.data`, others at `event.data.message`).
- [ ] **Step 4: Run** `pnpm vitest run packages/core/session packages/context/context-editor` — ALL PASS including Task 4(b).
- [ ] **Step 5:** Commit `feat(context-editor): derivation rule — empty context-edit replacements derive to nothing`

### Task 6: Restore, checkpoint expansion, recovery branch

**Files:**
- Create: `packages/context/context-editor/src/restore.ts`
- Modify: `packages/context/context-editor/src/service.ts` (remotes `restore-range`, `expand-checkpoint`, `create-recovery-branch`)
- Test: `packages/context/context-editor/tests/restore.spec.ts`

**Interfaces:**
- Consumes: Task 4 append machinery; `SessionStore.fork(source, boundary?)` (`ctx.sessions.fork`, `packages/core/session/src/index.ts:1403`); checkpoint detection via message source `kind: 'compact-checkpoint'` + `compactionId` (`packages/compaction/compaction/src/checkpoint.ts`).
- Produces: `restoreRange(ctx, sessionId, startSeq, endSeq)` — locate the replacement node R shadowing the range. Single-original (R cites 1 source): always in place. Multi-original: if R is the LAST surface node → in place (re-materialize original 1 as replacement over R citing its original seq, append originals 2..N as plain events citing their originals, fresh ids); else → `RemoteError('context-editor/requires-branch')` with the pre-range boundary in the error payload. `expandCheckpoint(ctx, sessionId, checkpointSeq)` — same mechanics for a `compact-checkpoint` node (originals = its `sourceEventSeqs` minus the two protocol events); tail-only, else `requires-branch`. `createRecoveryBranch(ctx, sessionId, boundarySeq): Promise<string>` — `ctx.sessions.fork(sessionId, boundarySeq)` returning child id.

- [ ] **Step 1: Failing tests**: (a) single edit restore → `deriveMessages()` equals pre-edit texts; (b) tail range-exclusion restore → all originals back in order; (c) mid-history range-exclusion restore → `requires-branch` error carrying boundary; (d) `createRecoveryBranch` at boundary → child session log equals source prefix `0..boundary` and `header.isSeeded`; (e) fabricated compaction checkpoint (Task 7 will produce real ones — fabricate via `compactCheckpointSource`) expands in place at tail.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5:** Commit `feat(context-editor): restore, checkpoint expansion, recovery branches`

### Task 7: Selective condensation

**Files:**
- Create: `packages/context/context-editor/src/condense.ts`
- Modify: `packages/context/context-editor/src/service.ts` (remote `condense-range`)
- Test: `packages/context/context-editor/tests/condense.spec.ts`

**Interfaces:**
- Consumes: protocol event shapes verbatim from `packages/compaction/compaction/src/types.ts:24-67` + checkpoint framing `CHECKPOINT_PREAMBLE`/`SUMMARY_OPEN_TAG`/`SUMMARY_CLOSE_TAG` (`packages/compaction/compaction-basic/src/summarizer.ts:188-194` — import or replicate exactly); summary request built as a genuine prefix (system head + header tools + range messages) with `purpose: 'compaction'` (`summarizer.ts:152-162`); chunk assembly via the llm BlockAssembler if exported from `@deepseek-ai/dsh-llm`, else manual text-block assembly.
- Produces: `condenseRange(ctx, sessionId, startSeq, endSeq, instruction?): Promise<{ compactionId: string }>` — appends, without yielding between them: `compaction/start { compactionId, turn }` → summary request (`ctx.llm.stream`, target resolved `configured ?? latest ?? agentTarget` from the session's latest `request/header`) → `compaction/summary { compactionId, summary, shadowedRange: {start, end}, shadowedSeqs, shadowedTokenCount, provider, model, rawOutput, llmStreamCall: true }` → checkpoint `user/message` (`surfaceOp replace` over range, `sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...shadowedSeqs]`) → `compaction/end`. FALLBACK (decide during this task, record in FORK.md): if any upstream validator rejects the plugin-side sequence, add ONE additive marked method to `CompactionEngine` instead and route through it.

- [ ] **Step 1: Failing test** (fake LLM = `TextAdapter` pattern yielding fixed summary text): condense a 2-turn range → surface folds to ONE user checkpoint whose text carries the summary framing; preview shows single row; `deriveMessages` = prefix + checkpoint + suffix; request capture (Task 2) recorded the summary request with `purpose: 'compaction'`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5:** Commit `feat(context-editor): selective condensation via the official compaction protocol`

### Task 8: Tools/params overrides + marked upstream edit 2

**Files:**
- Create: `packages/core/agent-loop/src/context-edit-registry.ts` (NEW additive upstream file)
- Modify: `packages/core/agent-loop/src/agent.ts` (two marked call sites)
- Create: `packages/context/context-editor/src/overrides.ts`
- Modify: `packages/context/context-editor/src/service.ts` (remotes `set-tools`, `set-params`, `get-overrides`)
- Test: `packages/core/agent-loop/tests/context-edit-registry.spec.ts`, `packages/context/context-editor/tests/overrides.spec.ts`

**Interfaces:**
- Produces (registry): `export type ContextEditOverrides = { tools?: (tools: ToolSchema[]) => ToolSchema[]; params?: (config: LlmCallConfig) => LlmCallConfig }`; `registerContextEditOverrides(sessionId: string, overrides: ContextEditOverrides | undefined): void`; `lookupContextEditOverrides(sessionId: string): ContextEditOverrides | undefined` (Map-backed, identity when unregistered).
- Marked sites in `agent.ts`: (1) in `prepareRequest` after config finalization (both the `preparedCall` path ~645 and the NO_ADAPTER fallback ~649): `const ce = lookupContextEditOverrides(this.session.id); if (ce?.params) config = ce.params(config)` — BEFORE return, so the header written in `buildRequest` reflects it. (2) in `buildRequest` before `canonicalHeader` (~line 666): `const ce = lookupContextEditOverrides(this.session.id); if (ce?.tools) tools = ce.tools(tools)`.
- Produces (overrides.ts): whitelist merge `applyParams(record, config)` (only `temperature, maxTokens, stop, presencePenalty, frequencyPenalty` copied; others rejected at the remote with `context-editor/bad-param`); `applyTools(record, tools)` (drop `removedTools`, replace schemas from `toolEdits` by exact name — renames impossible by construction; remote refuses `toolEdits` keys not matching existing names with `context-editor/rename`); service methods persist the `OverridesRecord` (sidecar `overrides` table, key = sessionId) and register/clear the registry entry; `installOverrideRegistry(ctx)` called in `apply` re-registers all stored records at boot (restart durability). Fork inheritance: NOT inherited (sidecar) — the `get-overrides` response carries `inheritedByForks: false` for the UI (spec §9).

- [ ] **Step 1: Failing tests**: (a) registry unit: register → lookup returns it; unregister → identity default. (b) overrides remote: `setTools` with a renamed key → `context-editor/rename`; `setParams({ temperature: 0.2, bogus: 1 })` → `context-editor/bad-param`; valid set → `get-overrides` returns record. (c) integration (harness `mountAgentLoopTestDependencies` + `TextAdapter` recording requests): set overrides removing tool `B` and `temperature: 0.2` → run one agent step → the adapter-recorded request has NO tool `B`, `temperature 0.2`, AND the session log's `request/header` shows the same (header/request/capture agreement — spec Review Focus 5). (d) restart: re-`apply` a fresh context-editor plugin instance on a reopened profile → override still applied to next request. (e) fork: `ctx.sessions.fork` → child's overrides lookup is undefined.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (registry file first, then agent.ts marked lines, then overrides.ts + remotes). **Step 4: Run** `pnpm vitest run packages/core/agent-loop packages/context/context-editor` — PASS.
- [ ] **Step 5:** Commit `feat(context-editor): per-session tool/param overrides with agent-loop seam`

### Task 9: Bundle wiring + fork-default carry-over

**Files:**
- Modify: `packages/bundle/web-app/cordis.patch.yml` (two additive roster rows + config blocks on existing rows)
- Test: covered by Task 15 boot verification (no new unit tests)

**Interfaces:**
- Produces: host row `- id: context-editor` / `name: '@deepseek-ai/dsh-context-editor'` in the host rows area (near `settings-controller`); browser roster row `- id: ui-context-editor` / `name: '@deepseek-ai/dsh-client-ui-context-editor'` (near `ui-message-feedback`); fork-defaults block (comment `# fork(local-test): …`) setting `ui-theme.config.preference: dark`, `ui-settings-general.config.welcomeNoticeVersion: '2026-09-28.1'`, `ui-settings-models.config.credentialOnboarding: false` (values carried over verbatim from the shipped v1.0.0 bundles' `dsh-web-app/cordis.patch.yml`).

- [ ] **Step 1:** Edit the patch file; keep YAML style identical to neighboring rows.
- [ ] **Step 2:** Verify parse: `pnpm exec tsx -e "import {parse} from 'yaml'; parse(await (await import('node:fs/promises')).readFile('packages/bundle/web-app/cordis.patch.yml','utf8'))"` exits 0.
- [ ] **Step 3:** Commit `feat(context-editor): bundle roster rows and local-test fork defaults`

### Task 10: Client package scaffold + Context tab

**Files:**
- Create: `packages/client/ui-context-editor/package.json`, `tsdown.config.ts`, `src/index.ts`, `src/client/index.ts`, `src/client/ContextView.tsx`, `src/client/ContextView.module.css`, `src/client/remote.ts`, `src/css-modules.d.ts`, `locale/en.json`, `locale/zh.json`
- Test: `packages/client/ui-context-editor/tests/context-view.client.spec.tsx`

**Interfaces:**
- Consumes: `clientBundle` preset (`packages/client/tsdown.client.ts`); slot contract `conversation.view` (`ConvViewOwnerProps`, registration pattern `packages/client/ui-chat/src/client/apply.ts:234-245`); remote mounting from the client half: `await ctx.remote.$mount(contextEditorRemote)` where `contextEditorRemote` is the generated default export (pattern: the shipped plugin's client, which mounts its own remote — `/tmp/ace/package/client.js:1961-1993`; generated client factory at `lib/remote.js` after `generate-typert`).
- Produces: `export const inject = ['slots', 'locale', 'uiWorkspace']` (browser face; `apply` is async, mounts the remote first); slot registration `{ name: 'conversation.view', id: 'context-editor', order: 20, label: () => t('view.label'), inject: (sessionId) => ({ sessionId, api }) }` where `api` wraps `ctx.remote.contextEditor` calls (`preview`, `listRequests`, …) with typed errors.

- [ ] **Step 1: Failing client spec** (jsdom pragma + `RemoteMock` pattern from `packages/client/ui-message-feedback/tests/*.client.spec.tsx`): mounting the view on a session id calls `preview` once and renders the tab label; a `RemoteError` renders the error state.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** scaffold per Interfaces; ContextView renders pane tabs (Context / Requests / Tools) with placeholders. **Step 4: Run** — PASS.
- [ ] **Step 5:** Commit `feat(context-editor): client package and Context tab shell`

### Task 11: Context pane (rows, edit, exclude, batch)

**Files:**
- Modify: `packages/client/ui-context-editor/src/client/ContextView.tsx` (+ new `src/client/rows.tsx`, `src/client/editing.ts`, CSS modules)
- Test: `packages/client/ui-context-editor/tests/rows.client.spec.tsx`, `tests/editing.client.spec.tsx`

**Interfaces:**
- Consumes: `ContextPreview`/`ContextRow` (Task 3); remotes `edit-message`, `exclude-range`, `restore-range`; `estimateTokens` already inside rows (no client-side estimate import needed).
- Produces: pane 1 rendering: row list (role icon, text, badges `edited` / `excluded` / `original` with `editedFrom`/`excludes` tooltips), per-row and total token counts, search box (case-insensitive substring filter + match count), next-request JSON expander (`config` + `tools` + derived messages), row actions: Edit (inline textarea, Save → `edit-message`, Cancel), Exclude (confirm dialog naming post-conditions → `exclude-range`), Restore (visible when `editedFrom`/`excludes` present; if the remote answers `context-editor/requires-branch` the dialog offers `create-recovery-branch` and says the child session opens after), batch mode: checkbox multi-select → `exclude-range` over the contiguous selection or bulk text replace applying `edit-message` per row sequentially with a progress indicator and stop-on-first-error.

- [ ] **Step 1: Failing specs**: fixture `ContextPreview` renders rows/badges/counts; search filters; edit flow calls `edit-message` with exact args then refreshes preview; exclude flow shows confirm, calls `exclude-range`; `requires-branch` path offers branch creation; batch of 3 edits issues 3 sequential calls and reports progress.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5:** Commit `feat(context-editor): context pane with editing, exclusion, batch, restore`

### Task 12: Requests pane + Tools & params pane

**Files:**
- Modify: `packages/client/ui-context-editor/src/client/ContextView.tsx` (+ `src/client/requests.tsx`, `src/client/tools.tsx`, CSS)
- Test: `packages/client/ui-context-editor/tests/requests.client.spec.tsx`, `tests/tools.client.spec.tsx`

**Interfaces:**
- Consumes: `listRequests`/`getRequest` (Task 3), captured payloads as-is; `set-tools`/`set-params`/`get-overrides` (Task 8); `CapturedRequest.status/error`.
- Produces: pane 2: degradation notice when `captureDegraded` is set ("request log unavailable — model requests unaffected"); entry list (time, purpose chip or `agent`, provider/model, status icon, error text), click → pretty-printed JSON of the full captured request, Copy button (navigator.clipboard + fallback). Pane 3: tool list from the latest preview's `tools` (name, description snippet, param count), Remove toggle, Edit modal (description + JSON parameters editor; rename attempt blocked in UI and `context-editor/rename` surfaced), Reset-all; params form with exactly the whitelist fields (numeric inputs; `stop` as line-separated list), each showing inherited value from latest `config`, Save → `set-params`, Reset → empty record; note text: overrides apply to agent turns, not title/compaction requests, and are not inherited by forks (spec §4.3.2, §9).

- [ ] **Step 1: Failing specs**: requests list renders fixture entries incl. an error entry; JSON viewer expands and copy writes clipboard (mock); tools pane renders fixture tools, remove → `set-tools` without the tool, rename blocked; params form submits exactly whitelist keys; reset clears.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5:** Commit `feat(context-editor): request log viewer and tools/params panes`

### Task 13: Timeline truthfulness (marked upstream edit 3)

**Files:**
- Modify: `packages/client/ui-chat/src/client/conversation-nodes/message.ts` (user/developer/system nodes), `assistant.ts` (assistant nodes)
- Test: `packages/client/ui-chat/tests/context-edit-timeline.client.spec.tsx` (NEW, ours)

**Interfaces:**
- Produces: (1) replacement events with source `kind: 'context-edit'` render as their node type with an `edited` badge when `mode: 'edited'` (content = replacement content, provenance = `sourceEventSeqs` for the view-original popover); (2) `mode: 'excluded'` replacements render a collapsed stub row "hidden from model · N messages · restore" (action → same restore flow as Task 11); (3) original append nodes whose seq is cited by a visible context-edit replacement are not rendered (the chat fold must consult the same replacement map — pin the actual fold mechanism first, see Step 1).

- [ ] **Step 1: Characterization test (may PASS as-is — that is a result, not a failure):** client spec folding a timeline where a user message is later replaced: assert exactly one user row renders and it shows the EFFECTIVE text. Run it; read the fold path it exercises (`ChatView`/store → node definitions) and use that same mechanism for (3). If compaction today leaves shadowed originals rendered, fix both through the same fold point and note it in FORK.md.
- [ ] **Step 2: Failing specs** for (1) and (2): replacement-with-`context-edit` renders effective text + badge + view-original popover listing original text; excluded stub renders collapsed with count; shadowed original not rendered.
- [ ] **Step 3: Run** — FAIL (except characterization outcome). **Step 4: Implement** in `message.ts`/`assistant.ts` (definitions emit nodes for context-edit replacements; extend the fold coordination used by compaction so cited originals yield). **Step 5: Run** `pnpm vitest run packages/client/ui-chat packages/client/ui-context-editor` — PASS.
- [ ] **Step 6:** Commit `feat(context-editor): timeline shows effective content with edited/hidden states`

### Task 14: FORK.md + upstream-diff audit

**Files:**
- Create: `FORK.md`
- Test: none (audit is the check)

**Interfaces:**
- Produces: FORK.md containing: the complete upstream-diff inventory (3 marked edits with file:line + purpose; 1 new additive upstream file; 2 new packages; `packages/bundle/web-app/cordis.patch.yml` fork sections), the values carried in the fork-defaults block, and the upstream-update runbook (extract new upstream → rebase marked edits → keep our packages → re-run `pnpm vitest run` → re-verify Task 15 boot checks → rebuild bundles).

- [ ] **Step 1: Audit:** `git diff --stat e9b2168..HEAD -- packages/core packages/client/ui-chat packages/bundle` — every listed file must appear in FORK.md; if anything extra appears, either move it into our packages or add it to FORK.md and flag it to the user in the final report.
- [ ] **Step 2:** Write FORK.md. **Step 3:** Commit `docs(context-editor): fork inventory and upstream-update runbook`

### Task 15: Full build + boot verification

**Files:** none (verification task; fix-ups land where needed)

- [ ] **Step 1:** `pnpm install` (root; network needed once), then `pnpm run typecheck` (includes typert generation) — exit 0.
- [ ] **Step 2:** `pnpm run build` — exit 0.
- [ ] **Step 3:** `pnpm vitest run` — full suite green (upstream suites included: proves the three marked edits regress nothing).
- [ ] **Step 4:** Boot the built CLI: `DSH_HOME=$(mktemp -d) node apps/cli/lib/bin.js web --no-open &` → curl the printed token URL → assert the page contains `color-scheme:dark`, `preference = "dark"`, `{"credentialOnboarding":false}` (fork defaults at source level), and `/plugins` serves the `ui-context-editor` bundle (grep the boot roster HTML for `context-editor`).
- [ ] **Step 5:** Stop the server; commit any fix-ups; tag nothing yet.

### Task 16: Linux bundle v2.0.0 + SLR Runtime E2E

**Files:**
- Create: `/workspaces/devpod/DSH/dsh-linux-x64-v2/` (staging tree; final layout identical to `/workspaces/devpod/DSH/dsh-linux-x64`)
- Modify: `/workspaces/devpod/DSH` deliverables (archives)

**Interfaces:**
- Consumes: the established bundle recipe from the v1.0.0 packages: `dsh` launcher script, `node/` (Node 24.22.1 tree — reuse from `dsh-linux-x64/node`), `browser/` (LibreWolf AppImage tree + `gui-launcher.js` — reuse), `examples/`, `README.md`, `VERSION.txt`; `app/` = fresh: `package.json` + `node_modules` from the fork build (the CLI package's production closure — assemble via `pnpm --filter @deepseek-ai/dsh --prod deploy <dir>` or the npm-pack method from v1.0.0 if deploy misses bundled dist files; verify `lib/bin.js web` boots from the deployed tree before proceeding).

- [ ] **Step 1:** Assemble the staging tree (reuse node/, browser/, launchers, examples from v1.0.0; new `app/` from the fork build; VERSION.txt → `2.0.0` with base `0.2.2-alpha.2+context-editor`; README updated: Context Editor section, base version, dark/no-popup defaults now "built into the fork source").
- [ ] **Step 2:** Boot smoke: `DSH_HOME=$(mktemp -d) ./dsh web --no-open` → URL answers; kill.
- [ ] **Step 3:** SLR Runtime E2E: start SLR Runtime (`/workspaces/devpod/SLR Translator Linux/data/llama` setup from v1.0.0 testing: `laststart.json` + models present), apply `examples/slr-runtime-provider.patch.yml` env (`SLR_RUNTIME_API_KEY=slr-local`), boot `./dsh web --no-open`, then via a local capture proxy (or SLR Runtime request log) run: (a) one headless turn → model answers; (b) start a second session and perform an `edit-message` on the user turn through the service (drive via the web RPC from a small Node script using the built client factory, or `curl` the typert endpoint if the gateway exposes HTTP — use whichever the gateway supports; the assertion is on the WIRE): the next request body received by SLR Runtime contains the EDITED text and not the original; (c) exclude the assistant turn → next request omits it; (d) `listRequests` shows the title-generation request with purpose `session-title`.
- [ ] **Step 4:** GUI E2E under Xvfb: `xvfb-run ./dsh-gui` → `xwd` screenshot after settle → dark palette, no first-run dialogs, Context tab present (vision-check the PNG).
- [ ] **Step 5:** `7za a -t7z -mx=9 -mmt=on /workspaces/devpod/DSH/dsh-linux-x64-v2.0.0.7z dsh-linux-x64-v2` (use SLR's 7za binary) + `7za t` — OK. Commit nothing in the fork (deliverable lives outside); record results in the final report.

### Task 17: Windows bundle v2.0.0 + docs/archives

**Files:**
- Create: `/workspaces/devpod/DSH/dsh-windows-x64-v2/` staging tree + `/workspaces/devpod/DSH/dsh-windows-x64-v2.0.0.7z`

**Interfaces:**
- Consumes: v1.0.0 Windows recipe — `dsh.cmd`/`dsh-gui.cmd` launchers (CRLF), `node/` (Windows Node tree), `browser/` (LibreWolf portable + gui-launcher.js), win32 natives via the npm-pack + manual extraction method (os/cpu-gated packages: `@img/sharp-win32-x64`, `@koromix/koffi-win32-x64`, `sherpa-onnx-win-x64`, `node-addon-require-builtin-win32-x64-msvc`, `@vscode/ripgrep-win32-x64`) resolved against the FORK's dependency versions from its lockfile.

- [ ] **Step 1:** Assemble the Windows staging tree (fork `app/` closure + win32 natives per the v1.0.0 method; reuse node/, browser/, launchers; VERSION.txt 2.0.0; README same as Task 16 Step 1).
- [ ] **Step 2:** Structural verification (no Windows host available): `node/` carries `node.exe`; natives' package.json `os: ["win32"]` sets all present; launchers CRLF (`file` check); `app/node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml` byte-equal to the fork source file; `7za a` + `7za t` OK.
- [ ] **Step 3:** Update `/workspaces/devpod/DSH/README.md` (root copy) — Context Editor section, v2.0.0 names, upstream-update pointer to `dsh-fork/FORK.md`; sync into both staging trees BEFORE the archives (redo Step 2's archive if README changed after packing — pack last).
- [ ] **Step 4:** Remove superseded v1.0.0 archives from `/workspaces/devpod/DSH` after confirming the v2.0.0 pair passes `7za t`; final listing in the report.

## Self-Review Notes

- Spec coverage: §2 goals → Tasks 2-3 (view), 4-8 (edit/override), 7 (condensation), 6 (parity/restore/branch), 2+15 (capture), 14 (upgradability), 16-17 (delivery); §4.3 seams → Tasks 5, 8, 13, 9; §4.4 → Task 4(f); §6 failure handling → Tasks 2(d), 4(b-d); §7 testing → each task + 15-16; §8 delivery → 16-17.
- Type consistency: `CapturedRequest`/`OverridesRecord` (Task 1) used verbatim in 2, 3, 8, 12; `ContextRow`/`ContextPreview` (Task 3) in 11, 12; source discriminator fields `kind: 'context-edit'` + `mode` (Task 4) in 5, 6, 13; registry names (Task 8) used only there.
- Review Focus pins: 1→Task 2(d); 2→Task 4(c); 3→Tasks 4(e)/8(d)(e); 4→Task 4(f); 5→Task 8(c).
