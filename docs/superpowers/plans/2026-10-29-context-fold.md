# Context Fold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt billion-context's model-driven, reversible context compression natively in dsh as the `context-fold` package: the model folds consumed conversation ranges into summaries it writes itself, via four first-class tools (`compress`, `decompress`, `search_context`, `acp_status`), with growth nudges — no proxy, no parallel state store.

**Architecture:** A fold is a **model-driven compaction checkpoint** over dsh's own compaction event protocol (`compaction/start` → `compaction/summary` → checkpoint `user/message` with `surfaceOp: replace` → `compaction/end`, marked `origin: 'model-fold'`). The existing surface derivation projects folds onto provider requests; the append-only session log IS the fold state (event-sourced — restart- and fork-durable for free); decompress returns shadowed originals in the tool result instead of mutating history mid-conversation. `@deepseek-ai/dsh-compaction-basic` stays enabled as the hard window backstop. **We deliberately do NOT vendor acp-kernel's state machine** — dsh's session surface already owns the view; we adopt billion-context's behavior (tool shapes, prompt corpus, nudge cadence, gates) with attribution. This refines the original "wrap acp-kernel" idea toward more nativeness after inspecting the fork's seams.

**Tech Stack:** TypeScript ESM in the pnpm workspace; cordis plugin (`apply(ctx, config)`, schemastery config); `ctx.tools` ToolDefinition contract; `agent/pre-step` waterfall for nudges; `ctx.tokenMeter` for usage; vitest + `@deepseek-ai/dsh-tool-testkit`. No new npm dependencies.

**Spec:** The approved evaluation in this conversation (billion-context 0.1.209 at `/workspaces/devpod/DSH/billion-context-0.1.209`; kernel prompts at `kernel/src/compression-rules.ts`, tool schemas at `kernel/src/compress-tools.ts`, nudge cadence in `kernel/src/compress.ts` `decideNudge`). Behavior contract = the README's four-tool capability list, made native.

## Global Constraints

- Package `@deepseek-ai/dsh-context-fold` at `packages/context/context-fold/`, version `0.2.2-alpha.2`, `"type": "module"`, license MIT, peerDependencies mirroring `packages/context/context-editor/package.json` (workspace refs), no new external deps.
- Attribution (billion-context MIT + Additional Term): every file containing adapted billion-context text carries a header comment crediting `billion-context` / `acp-kernel` (https://github.com/ranxianglei/billion-context); `FORK.md` and the fork README name it wherever the feature is described.
- Upstream-edit marking: any edit outside the new package and its mount rows carries a `fork(context-fold):` comment; `FORK.md` inventory gets a row per touched upstream file.
- Tool names are the canonical four (`compress`, `decompress`, `search_context`, `acp_status`) for model familiarity.
- Commits: `git -c user.name=fork -c user.email=fork@local`, messages prefixed `feat(context-fold):` / `test(context-fold):` / `docs(context-fold):`. Commit before builds that stamp versions (no `-dirty` stamps).
- Lint gates run on staged files (lefthook): keep lines ≤ 120 chars, no stale oxlint-disables, no unused params (underscore-prefix).
- Tests: vitest, run per package from the fork root (`pnpm vitest run packages/context/context-fold`). Every task ends green in its own suite; Tasks 8–9 additionally run the context-editor + agent-loop + session suites (regression neighbors) and `pnpm typecheck`.

## Review Focus

1. **A fold range that splits a tool_use/tool_result pair orphans half a pair on the wire → upstream 400.** `planFold` must extend `endSeq` past any tool result whose call stays inside the range, and never fold a tool_use whose result is pending. Tests in Task 1.
2. **Folding the current turn's in-flight tool_use (the compress call itself) folds an unpaired call.** The pending assistant tool-call message is always the last visible message; `keepLast >= 1` plus the pair rule guards it. Test in Task 1 (mid-turn fold with pending call).
3. **Folding the first user message breaks strict providers that require a user-first payload.** `planFold` pins the first visible user message outside the fold. Test in Task 1.
4. **Decompressing a huge fold returns the whole original range and blows the window.** `decompress` caps rendered content (`decompressCapChars`, default 24000) with an explicit truncation notice pointing at `search_context`. Tests in Task 3.
5. **A degenerate summary (empty / one word) silently destroys the folded range.** `compress` rejects summaries below a minimum length before appending anything (all-or-nothing), with model-friendly guidance. Test in Task 2.

---

### Task 1: Package scaffold + fold domain (`planFold` / `appendFold`)

**Files:**
- Create: `packages/context/context-fold/package.json`, `tsconfig.json`, `src/fold.ts`, `src/index.ts` (temporary re-exports), `tests/fold.spec.ts`
- Modify: root `pnpm-workspace.yaml` only if it enumerates packages (verify; the glob usually covers it), root lockfile via `pnpm install`

**Interfaces:**
- Produces (used by Tasks 2–5, 7):
  - `interface FoldPlan { foldId: string; startSeq: number; endSeq: number; shadowedSeqs: number[]; foldedTokens: number; skipped: string[] }` — `foldId` is a fresh UUID assigned at plan time.
  - `planFold(events: readonly SessionEvent[], options: { keepLast: number; minFoldChars: number }): FoldPlan` — pure; throws `FoldError` (see below) with `code` + `detail` on hard refusals, records soft skips in `skipped`.
  - `class FoldError extends Error { readonly code: 'fold/nothing-foldable' | 'fold/too-small' | 'fold/busy-turn'; readonly detail?: Record<string, unknown> }`.
  - `appendFold(session: Session, plan: FoldPlan, summaryBlocks: readonly ContentBlock[], meta: { summaryTokens: number }): { startEventSeq: number; checkpointSeq: number }` — appends the four-event protocol via `session.append` directly (mid-turn legal; mirrors `compaction/compaction-basic/src/region.ts:210-508`), checkpoint `user/message` built with `createUserMessage({ content: frameFold(summaryBlocks), source: compactCheckpointSource(CompactionId(plan.foldId)) })`, `surfaceOp: { op: 'replace', startSeq, endSeq }`, `sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...shadowedSeqs]`; the `compaction/summary` data carries `origin: 'model-fold'` plus `shadowedSeqs`, `shadowedTokenCount`, `foldedTokens`, `summaryTokens`.
  - `deriveFoldRecords(events: readonly SessionEvent[]): FoldRecord[]` where `interface FoldRecord { foldId: string; checkpointSeq: number; shadowedSeqs: number[]; summaryText: string; foldedTokens: number; summaryTokens: number }` — pure derivation from `compaction/summary` events with `origin: 'model-fold'` (the single source of truth; no stored state).

**Rules `planFold` implements (the spec for its tests):**
- Works over visible surface nodes from `foldSurface(events)` (from `@deepseek-ai/dsh-session`, the helper `restore.ts:15` uses), addressed by event seq.
- Range = visible messages `[0 .. N - keepLast - 1]` (prefix fold), `N` = visible message count; `keepLast` clamped to ≥ 1.
- Pin: if visible message 0 is a user message, it stays outside the fold (fold starts at visible message 1).
- Pair safety: while the last message in the range is an assistant message carrying tool-call blocks whose tool-result events fall outside the range, extend `endSeq` to include them; if a message inside the range references a pending (result-less) call, shrink `endSeq` before it — in practice the pending call is always the final visible message, covered by `keepLast ≥ 1`; assert both invariants.
- Soft skips: non-message events, already-shadowed nodes (inside another replacement's range) are excluded from `shadowedSeqs` and noted in `skipped`.
- Gates (throw): no foldable messages after skips → `fold/nothing-foldable`; total original text < `minFoldChars` → `fold/too-small` with `{ chars }`.
- `foldedTokens` from `estimateMessage` (from `@deepseek-ai/dsh-token-meter/estimate`) over the shadowed messages.

- [ ] **Step 1: Write the failing tests** in `tests/fold.spec.ts` covering: plain prefix fold plan; first-user pin; pair-boundary extension (tool_use in range, result just past cut); pending-call never folded (mid-turn session fixture: `turn/start` … assistant with tool-call … no result yet); already-shadowed skip; `fold/too-small`; `fold/nothing-foldable`; `appendFold` writes the four events with correct `surfaceOp`/`sourceEventSeqs`/`origin: 'model-fold'` (assert via `session.snapshotEvents()` and a `foldSurface` projection showing originals gone, checkpoint present); `deriveFoldRecords` round-trips plan+append output. Build fixtures with `Session.create(id)` + appends, mirroring `packages/context/context-editor/tests/edits.spec.ts` patterns.
- [ ] **Step 2: Run** `pnpm vitest run packages/context/context-fold` — expect import failures.
- [ ] **Step 3: Scaffold the package** (package.json peer/dev deps mirroring context-editor minus what this task doesn't need yet — `dsh-compaction`, `dsh-session`, `dsh-llm`, `dsh-token-meter`, `cordis`, `zod`; `tsconfig.json` copying context-editor's), run `pnpm install`, then implement `src/fold.ts`. `src/index.ts` re-exports the four symbols.
- [ ] **Step 4: Run the suite — all green.**
- [ ] **Step 5: Commit** `feat(context-fold): package scaffold, fold planning, and checkpoint-protocol appends`

### Task 2: The `compress` tool

**Files:**
- Create: `src/tools.ts`, `src/prompts.ts` (minimal: descriptions only; corpus lands in Task 6), `tests/compress.spec.ts`
- Modify: `src/index.ts` (export the registration helper)

**Interfaces:**
- Consumes: Task 1's `planFold`, `appendFold`, `FoldError`.
- Produces (Task 8 mounts; Tasks 3–5 share the file's helpers):
  - `function registerFoldTools(ctx: Context, config: ResolvedFoldConfig): () => void` — registers the four tools (this task: only `compress`) via the `ctx.tools` registration API (`packages/core/tools/src/index.ts`), returns disposer.
  - `interface ResolvedFoldConfig { keepLast: number; minFoldChars: number; minSummaryChars: number; decompressCapChars: number; searchLimit: number; nudgeGrowthTokens: number; pressureNudgeRatio: number; enabled: boolean }` (defaults resolved in Task 8's schema; Tasks 2–5 accept it as a plain object).
  - `compress` ToolDefinition: parameters `{ keepLast?: number, summary: string }`; `execute` validates the summary (`minSummaryChars`, default 200, all-or-nothing before any append), plans over `exec.agent.session.snapshotEvents()`, appends via `appendFold`, returns canonical value `{ folded: messageCount, savedTokens, checkpointSeq, foldId: short }`; `output.render` frames a markdown confirmation with the new usage hint (from Task 5's usage helper once it exists; until then a static line — Task 5 replaces it).
  - Gate errors surface as the tool-result text with the exact retry guidance (`FoldError.code` → message map), never as thrown harness errors.

- [ ] **Step 1: Failing tests** in `tests/compress.spec.ts` using `@deepseek-ai/dsh-tool-testkit` to execute the tool against a real session (mirror the honest-tools seam pattern in `context-editor/tests/service.spec.ts`): happy path folds and the session log carries the checkpoint; summary-too-short rejection leaves the log untouched; `fold/too-small` returns guidance text; missing `exec.agent` throws the tool's declared harness error; output `render` produces markdown containing the saved-token count. Tool description byte-stability assertion (pin the exact string; it is a cache anchor).
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `src/tools.ts` (compress only) + `src/prompts.ts` (description constants with the billion-context attribution header).
- [ ] **Step 4: Green.**
- [ ] **Step 5: Commit** `feat(context-fold): compress tool with all-or-nothing gates`

### Task 3: The `decompress` tool

**Files:**
- Modify: `src/tools.ts`, `tests/decompress.spec.ts` (new)

**Interfaces:**
- Consumes: `deriveFoldRecords`.
- Produces: `decompress` ToolDefinition, parameters `{ foldId?: string }` — no `foldId` resolves the newest `FoldRecord`; a short id (≥ 8 chars prefix) may match. Returns `{ foldId, messageCount, content }` where `content` renders the shadowed originals as markdown (`role: text` per message, tool results verbatim), truncated at `decompressCapChars` with a trailing notice naming the fold and suggesting `search_context` for targeted retrieval. Unknown/ambiguous id → guidance text listing available short ids (this doubles as the tool's discovery path).

- [ ] **Step 1: Failing tests**: round-trip after a Task-2 compress (fold → decompress returns the original texts, surface unchanged — assert `foldSurface` still hides the originals); default-newest; short-id match; unknown id lists candidates; truncation at a low `decompressCapChars` fixture cap with the notice.
- [ ] **Step 2: Run — fails. Step 3: Implement. Step 4: Green.**
- [ ] **Step 5: Commit** `feat(context-fold): decompress tool returns capped originals`

### Task 4: Fold-record search + the `search_context` tool

**Files:**
- Create: `src/search.ts`, `tests/search.spec.ts`
- Modify: `src/tools.ts`

**Interfaces:**
- Produces:
  - `interface SearchHit { kind: 'fold' | 'message'; foldId?: string; seq?: number; snippet: string; score: number }`
  - `searchContext(query: string, records: readonly FoldRecord[], events: readonly SessionEvent[], limit: number): SearchHit[]` — pure. Corpus = fold `summaryText` entries + visible surface messages (via `foldSurface`; skip the checkpoint's own framing tags). Scoring: case-insensitive term matching with simple TF weighting (term frequency × inverse corpus frequency), plus a substring bonus for long terms; ties → older-first. This is a compact native scorer informed by acp-kernel's hybrid approach (`kernel/src/search/SEARCH.md`), not a vendoring.
  - `search_context` ToolDefinition `{ query: string, limit?: number }` → markdown list of hits (`[fold abc12345]` / `[message seq 42]` + snippet), newest-first within score ties for messages.
- Consumes: `deriveFoldRecords`, `foldSurface`.

- [ ] **Step 1: Failing tests**: ranking fixture (three folds + four visible messages; query hitting one fold's summary ranks it first with its snippet); limit; no-hit → friendly "nothing matched" text; query matching a folded ORIGINAL surfaces the fold (fold summaries are the addressable surface — assert the hit names the fold, not the shadowed seq).
- [ ] **Step 2–4: Red → implement → green.**
- [ ] **Step 5: Commit** `feat(context-fold): keyword search over fold summaries and visible messages`

### Task 5: Usage report + the `acp_status` tool

**Files:**
- Create: `src/status.ts`, `tests/status.spec.ts`
- Modify: `src/tools.ts`

**Interfaces:**
- Produces:
  - `interface FoldUsage { pressureTokens: number; contextWindow: number | undefined; visibleTokens: number; foldCount: number; foldedTokens: number; records: FoldRecord[] }`
  - `foldUsage(ctx: Context, session: Session): Promise<FoldUsage>` — pressure from `ctx.tokenMeter.contextPressure(session)` (`packages/llm/token-meter/src/index.ts:122`); `contextWindow` from `ctx.llm.resolveModelInfo(provider, model)` when the session's `requestHeader()?.config` carries a route (undefined-safe); records from `deriveFoldRecords`.
  - `renderStatus(usage: FoldUsage): string` — markdown: usage line (visible tokens, window or "unknown", ratio), fold ledger (`short foldId · folded tokens · summary tokens · checkpoint seq`), and guidance (compress hint when ratio ≥ `pressureNudgeRatio` or `foldedTokens` share is low; "healthy" line otherwise).
  - `acp_status` ToolDefinition (no parameters) → `renderStatus(foldUsage(...))`; replaces Task 2's static confirmation line in `compress`'s render with a one-line usage suffix.
- Consumes: `deriveFoldRecords`, `ResolvedFoldConfig.pressureNudgeRatio`.

- [ ] **Step 1: Failing tests**: with folds (fake tokenMeter via the same service-faking pattern `compaction-basic` tests use — if the suite boots a real meter, feed a real session and assert structure instead of exact numbers); without folds → idle report; unknown window path; guidance flips at the ratio threshold; ledger lists folds oldest-first with short ids.
- [ ] **Step 2–4: Red → implement → green.**
- [ ] **Step 5: Commit** `feat(context-fold): acp_status usage report with fold ledger`

### Task 6: Prompt corpus + system section

**Files:**
- Create: `src/prompts.ts` (extend: corpus constants), `tests/prompts.spec.ts`
- Modify: none outside the package

**Interfaces:**
- Produces:
  - `COMPRESS_PHILOSOPHY` (adapted from billion-context's `COMPRESS_PHILOSOPHY` + `HOW_TO_COMPRESS_RULES`, `kernel/src/compression-rules.ts`, trimmed to v1 prefix-fold semantics): compress by need not percentage; KEEP-VERBATIM list (full file paths with line numbers, error messages, commands, ids); user quotes labeled with position ("the user said earlier…"); mandatory `Open objectives:` carry-forward line; DROP list (dead-end exploration kept as one-line lessons); summary written in the conversation's primary language.
  - `FOLD_SECTION` — the static system-prompt section text (byte-stable: philosophy + one-line tool intro; no dynamic values).
  - `registerFoldSection(ctx: Context): () => void` via `ctx.systemPrompt.section({ name: 'context-fold', ... })` (`packages/core/system-prompt/src/index.ts` PromptSection registry).
- The four tool descriptions (Task 2 pinned compress's; this task finalizes the other three, each embedding its usage contract).

- [ ] **Step 1: Failing tests**: corpus constants non-empty and contain the carry-forward + keep-verbatim clauses (content assertions, not byte pins, except the section + descriptions which ARE byte-pinned — cache anchors); `registerFoldSection` registers and disposes against a real system-prompt service (mirror its own tests' harness).
- [ ] **Step 2–4: Red → implement (with the attribution header) → green.**
- [ ] **Step 5: Commit** `feat(context-fold): adapted billion-context prompt corpus and system section`

### Task 7: Growth nudges on `agent/pre-step`

**Files:**
- Create: `src/nudge.ts`, `tests/nudge.spec.ts`
- Modify: `src/status.ts` (reuse `foldUsage`)

**Interfaces:**
- Produces: `installNudge(ctx: Context, config: ResolvedFoldConfig): () => void` — `ctx.on('agent/pre-step', listener)` following `installModelSelection` (`packages/core/agent/src/model-selection.ts:153`, the canonical prepend-listener pattern). Listener: after `next()`, compute growth = `pressureTokens − tokensAtLastFold` (baseline = newest `FoldRecord`'s `foldedTokens`-anchored pressure, recomputed from events; in-memory per-session map for cadence, cold-start recomputes). Fire a transient `UserMessage` via `createUserMessage` with `source: { kind: 'context-fold', form: 'notice', summary: … }` (same typed-source shape `model-selection` uses) when growth ≥ `nudgeGrowthTokens` OR pressure ratio ≥ `pressureNudgeRatio`, escalating wording at ≥ 0.9, at most once per crossing (re-arm after a fold lands or the threshold moves by another step). Nudge text includes the usage line and the one-call hint (adapted from acp-kernel's `ONE_CALL_HINT`: one compress call per batch).
- Consumes: `deriveFoldRecords`, `ctx.tokenMeter.contextPressure`.

- [ ] **Step 1: Failing tests**: growth crossing emits exactly one nudge per step and re-arms only after the next threshold/fold; below threshold → decision untouched; pressure path fires at ratio; escalation text differs at 0.9; no repeat nudge on the very next step without new growth; fold landing resets the baseline. Use a fake `{ agent, session }` payload with a stubbed tokenMeter service (mirror `agent-loop` pre-step listener tests; `packages/core/agent/tests` has the harness).
- [ ] **Step 2–4: Red → implement → green.**
- [ ] **Step 5: Commit** `feat(context-fold): growth and pressure nudges on agent/pre-step`

### Task 8: Plugin assembly, config schema, bundle mount

**Files:**
- Modify: `src/index.ts` (final `apply`), create `src/config.ts`, `tests/plugin.spec.ts`
- Modify (upstream, marked): `packages/bundle/web-app/cordis.patch.yml` (insert `- id: context-fold, name: '@deepseek-ai/dsh-context-fold'` beside the context-editor row at line ~148), `packages/bundle/web-app/package.json` (dependency), `FORK.md` (inventory rows)

**Interfaces:**
- Produces: the plugin entry — `export const name = 'context-fold'`, `export const inject = ['tools', 'systemPrompt', 'tokenMeter', 'llm']` (verify against the actual service names when implementing; all four are used), `export function apply(ctx: Context, config: Config): void` where `Config` is a schemastery `z.object({ enabled: z.boolean().default(true), keepLast: z.number().step(1).min(1).default(8), minFoldChars: z.number().step(1).default(2000), minSummaryChars: z.number().step(1).default(200), decompressCapChars: z.number().step(1).default(24000), searchLimit: z.number().step(1).default(8), nudgeGrowthTokens: z.number().step(1).default(50000), pressureNudgeRatio: z.number().default(0.75) })`; `apply` resolves `ResolvedFoldConfig` and, when enabled, calls `registerFoldSection`, `registerFoldTools`, `installNudge`, disposing all on scope teardown.
- [ ] **Step 1: Failing tests** (`tests/plugin.spec.ts`): boots the plugin in a real cordis context (browser-open.spec-style loader tree or direct `ctx.plugin`); asserts the four tools appear in `ctx.tools` resolution, the section assembles into the system prompt, and `dispose()` removes both. Config defaults test.
- [ ] **Step 2–4: Red → implement → green.**
- [ ] **Step 5: Neighbor regression + typecheck**: `pnpm vitest run packages/context/context-fold packages/context/context-editor packages/core/agent-loop packages/core/session` and `pnpm typecheck` — all green.
- [ ] **Step 6: Mount + build**: add the patch row + dependency, `pnpm install`, full `pnpm build` green; `FORK.md` rows added.
- [ ] **Step 7: Commit** `feat(context-fold): plugin assembly, config, and web-bundle mount`

### Task 9: Wire-level E2E proof

**Files:**
- Create: `/tmp/fold-e2e/` rig (driver + capture proxy adapted from `/tmp/slr-e2e/`, which still exists — copy, don't mutate), no committed artifacts (matches the context-editor E2E convention; record findings in the SDD ledger)

**Interfaces:**
- Consumes: the assembled Linux bundle from Task 8's build via the `bundle-tools/` hoisted flow (deploy → parity), or — if bundle assembly is deferred to Task 10 — a `dsh --profile web` boot from the fork checkout with the patch overlay. Prefer the fork-checkout boot for the logic proof; the bundle boot belongs to Task 10.
- Produces: captured wire evidence.

- [ ] **Step 1: Script a fake provider** (capture proxy records every request): turn 1 seeds a distinctive codeword conversation past `minFoldChars`; the scripted model then emits a `compress` tool call with a summary containing a marker string; assert the NEXT request payload contains the framed checkpoint + marker and NOT the folded original text (mirror wire-003..007 methodology); the tool result for compress carried the confirmation.
- [ ] **Step 2: Decompress round-trip**: scripted `decompress` call → its tool result contains the original codeword text; the following request still shows the folded view (surface unchanged by decompress).
- [ ] **Step 3: Restart durability**: stop the server, reload the session cold → `contextEditor/preview` (or a fresh `acp_status` call) still shows the checkpoint; originals still retrievable via `decompress`.
- [ ] **Step 4: Nudge presence**: a long synthetic history crossing `nudgeGrowthTokens` (config-mounted low, e.g. 2000, via the patch row) → the next request payload carries the nudge notice message exactly once; the session log gains no nudge events (transience proof).
- [ ] **Step 5: Ledger** the evidence in `.superpowers/sdd/` (new dated dir `2026-10-29-context-fold/progress.md`).
- [ ] **Step 6: Commit** any fix that falls out, else `docs(context-fold): wire E2E evidence ledgered`.

### Task 10: Docs, attribution, bundles, v2.1.0 archives

**Files:**
- Modify: fork `README.md` / `FORK.md` (feature + attribution), `/workspaces/devpod/DSH/README.md` (user-facing), `bundle-tools/README.md` if the flow changed (it should not), both bundle `README.md`s
- Produces: `dsh-linux-x64-v2.1.0.7z` + `dsh-windows-x64-v2.1.0.7z`

- [ ] **Step 1: Attribution + docs**: README section (what folds are, the four tools, config knobs, interaction with basic compaction as backstop), FORK.md inventory, billion-context credit with link (MIT + Additional Term compliance).
- [ ] **Step 2: Rebuild both bundles** through the unified hoisted flow at a clean committed HEAD (`bundle-tools/` per its README: deploy → parity → per-platform natives → pack); Linux extraction-boot verified (session create + a fold round-trip via the driver); Windows structural checks (as established in the v2.0.0 flow).
- [ ] **Step 3: Repack archives LAST, `7za t` clean; commit docs; stamp check (no `-dirty`).**
- [ ] **Step 4: Final report to the user with the Windows re-test pointer.**

---

## Deferred (ledgered, not built)

- Middle-range model folds (seq/index addressing via `acp_status` echo) — v1 is prefix folds; the GUI already offers arbitrary-range user folds via Condense.
- Tier-2 distillation (folds of folds) — v1 folds target visible ranges only; `deriveFoldRecords` already makes nested records addressable if wanted later.
- BM25/fuzzy hybrid scorer upgrade, CJK bigram tokenizer (v1 term scorer handles ASCII terms + substring).
- Fold badges/expanded fold views in the Context tab (checkpoints already render; `expandCheckpoint` already unfolds).
- Optional side-model auto-fold backstop (billion-context's external summary chain) — basic compaction already backstops the window.
