# Context Editor — native feature for the dsh fork

Date: 2026-10-28
Status: approved design, pending implementation plan
Base: upstream deepseek-harness v0.2.2-alpha.2 (pristine baseline commit in this repo)

## 1. Summary

A native **Context Editor** for the Web UI that makes the exact model-bound
context of a session fully visible and editable: every message the model can
see (system prompt head, developer, user, assistant including reasoning
blocks, tool results), the tool schemas, and the request parameters — plus a
durable log of every outbound request actually sent, for every purpose.

This replaces the third-party "Agent Context Editor" plugin, which is not
shipped further. Every limitation of that plugin stemmed from one constraint:
it may not modify the host, so it intercepted requests via a fake provider and
stored edits as sidecar "request profiles". As a first-party fork we edit the
session through the host's own durable mechanisms instead, and the remaining
limitations (no reasoning/tool/system editing, no batch replace, hide that
does not affect model input) are removed by design.

Approved decisions (user, 2026-10-28):

- Base: upstream **0.2.2-alpha.2**; future upstream updates must stay easy to
  integrate, but **features and quality outrank upgradability** — upstream
  files may be edited where the UX demands it, kept as a small marked patch set.
- The external plugin is **fully replaced** (not shipped, not maintained).
- Edit scope: **everything, including tool schemas and request params**.

## 2. Goals

1. **See everything**: the effective next request (message list in
   model-visible order, tools, params) and every past outbound request
   (agent turns, in-process subagents, compaction summaries, session titles)
   with full JSON payloads.
2. **Edit everything**: text edits on any message class (user, assistant
   answers, reasoning blocks, tool results, developer/system), exclusion of
   any message from model input, batch multi-message replace, restore/undo;
   per-session tool removal and schema/description edits; per-session
   parameter overrides.
3. **Every prompt, no exceptions**: capture at the single choke point every
   in-process request passes (`llm/stream` waterfall in `LlmRuntime`).
4. **Durability**: edits survive restarts, resume, and forks; originals are
   never destroyed (append-only log), so restore/undo is exact.
5. **Feature parity with the replaced plugin**: selective condensation
   (summarize a chosen message range), checkpoint expansion (restore
   originals in place), recovery branches (native fork).
6. **Upgradability**: the fork = upstream + new self-contained packages +
   additive bundle-patch rows + ≤3 small marked upstream edits, all recorded
   in `FORK.md` at the repo root.

## 3. Non-goals

- Out-of-process subagent backends (external CLIs such as claude-code/codex)
  are out of capture scope by construction; they are not present in the
  offline bundles. Documented, not fixed.
- Multi-user/remote-access threat models: the editor is a local testing tool;
  it inherits the host's existing loopback/trust model without adding authz.
- Editing historical *assistant stream internals* beyond the effective text:
  edits replace the effective message (new `stream` array), they do not
  retcon raw provider responses recorded in `assistant/attempt` events.

## 4. Architecture

```
packages/context/context-editor/     NEW host package (service + remote + capture + edits)
packages/client/ui-context-editor/   NEW client package (Context tab)
packages/dsh-web-app/cordis.patch.yml  + additive rows (bundle roster)
packages/core/session/src/index.ts   marked edit ~3 lines (empty-message derivation rule)
packages/core/agent-loop/src/agent.ts marked edit, small (session override application)
packages/client/ui-chat/…            marked edit, small (timeline shows effective content)
FORK.md                              NEW (patch inventory + upstream-update runbook)
```

Everything else is additive. Registration uses the existing mechanisms: host
and client entries join the web bundle roster via patch rows (same shape as
the existing `insert:` entries); the client panel docks via the
`conversation.view` slot; the remote mounts via the standard Typert remote
system.

### 4.1 Host package: `packages/context/context-editor`

Injects `['sessions', 'sessionPersistence', 'llm', 'storageDomain', 'compaction']`.
Exports `apply(ctx)` registering:

**a) Request capture** — `ctx.on('llm/stream', (options, next) => …)`.
Read-only (loop-built requests are deep-frozen and must never be rewritten —
harness reconstructability principle, `llm/src/index.ts:62-77`). For every
request with a `sessionId`, the listener serializes and appends to the
per-session request log *before* calling `next()`:

```
CapturedRequest = {
  seq, time, purpose,          // 'agent' | 'compaction' | 'session-title' | … (from options.purpose)
  provider, model,             // resolved route
  config,                      // LlmCallConfig snapshot (params after overrides)
  tools,                       // tool schemas as sent
  messages,                    // final message list as dispatched
  status                       // 'dispatched' (stream start; outcome tracked via wrapped stream)
}
```

Storage: storage domain `context_editor` (`defineDomain`), table `requests`
keyed by session, FIFO-bounded (default: keep last 30, config-sizable). The
listener wraps the returned stream to record status (error/abort) without
altering it. Requests without a `sessionId` are not captured (nothing to
attach them to); this is logged once at startup in debug mode.

**b) Edit operations** (remote-called, all validated):

- `editMessage(sessionId, targetSeq, newMessage)` — appends a replacement
  surface event: same surface event type as the target, `surfaceOp:
  {op:'replace', startSeq: targetSeq, endSeq: targetSeq}`,
  `sourceEventSeqs: [targetSeq]`, message content = user-supplied.
  Assistant edits embed a minimal single-assistant-step `stream` array.
  Tool-result edits change content only (`assertToolResultRewrite` enforces
  this upstream). All upstream surface validation applies unchanged.
- `excludeRange(sessionId, startSeq, endSeq)` — appends ONE replacement event
  spanning the range whose message content is EMPTY and whose source carries
  the `context-edit` discriminator (`source: { kind: 'context-edit', mode:
  'excluded' }`, declared via the merge-extensible `MessageSourceMap` — no
  upstream type edit). Single-message exclusion is `excludeRange(s, s)`.
- `restoreRange(sessionId, startSeq, endSeq)` — undo for edits and
  exclusions. One-original ranges (single edits) always restore in place:
  a replacement event re-materializes the shadowed original. Multi-original
  ranges (range exclusions, compaction checkpoints) restore in place only
  when the replacement node is the surface tail (re-materialize original 1
  in place, append originals 2..N); otherwise in-place reinsertion is
  impossible in the surface fold, and the operation requires a recovery
  branch — `createRecoveryBranch` at the pre-edit boundary, mirroring
  upstream's own semantics for covered checkpoints. The UI states which
  path applies before confirming. Fresh message ids; originals cited via
  `sourceEventSeqs`.
- `editTools(sessionId, changes)` / `setParams(sessionId, overrides)` —
  writes the session's override record (sidecar `overrides` table): removed
  tool names, edited tool schemas (by name; **rename refused** with an
  explicit error), and a whitelisted param subset (temperature, topP,
  maxTokens, presencePenalty, frequencyPenalty; unknown fields rejected).
  Overrides apply to every subsequent request of that session (see 4.3).
- `previewContext(sessionId)` — derives the effective next-request view from
  the live session: surface-folded message list with per-node provenance
  (original seq, edited-from seqs, excluded flag, source), header config and
  tools (after overrides), plus per-node and total token estimates
  (token-meter heuristics).
- `listRequests(sessionId, before?)` / `getRequest(sessionId, seq)` — request
  log paging.
- `condenseRange(sessionId, range, instruction?)` — selective condensation
  using the official compaction event protocol (`compaction/start` →
  `compaction/summary` → checkpoint `user/message` with `surfaceOp: replace`
  over the range and `sourceEventSeqs` per the compaction contract →
  `compaction/end`), summarization request built as a genuine request prefix
  (KV-cache friendly) exactly like `compaction-basic`. Implemented in this
  package against the documented protocol; if validation blockers emerge
  during implementation, the fallback is one additive marked method on
  `CompactionEngine` (decided at plan/implementation time, recorded in
  FORK.md).
- `expandCheckpoint(sessionId, checkpointSeq)` — plugin-parity "restore this
  summary": expands a compaction checkpoint in place to its shadowed
  originals via the same mechanics as `restoreRange` (replace the checkpoint
  node with the first original, re-append the rest). Reuses upstream
  relationship validation.
- `createRecoveryBranch(sessionId, boundarySeq)` — thin wrapper over the
  upstream `SessionStore.fork` remote semantics for the UI.

Cold-session edits (session not live): the message-feedback cold-write
pattern — open `'write'` persistence handle, read, append, `flush`, notify.
Live-session edits go through `ctx.sessions.get(id)` and bump
`contentGeneration` automatically, invalidating the derived history used by
the very next request.

**c) Live/consistency rules.** Edits are refused while the target range is
inside the currently streaming turn (agent status check; explicit error).
Concurrent-edit conflicts use the same revision fencing the host remotes use.

### 4.2 Client package: `packages/client/ui-context-editor`

A `conversation.view` tab ("Context"), session-scoped. Panes:

1. **Context** (default): the `previewContext` projection as rows —
   role/icon, effective text (reasoning blocks shown collapsible), badges
   (`edited`, `excluded`, `original available`), token estimate per row and
   total, full-text search, click-to-edit inline (textarea; batch mode:
   multi-select → replace all, the plugin's missing batch feature),
   exclude/restore buttons per row and for selections. A "next request JSON"
   expander shows the exact payload that would be dispatched.
2. **Requests**: captured request log (purpose-tagged), one entry per
   outbound request, full pretty JSON viewer + copy. Compaction and title
   requests appear here — full visibility of auxiliary prompts.
3. **Tools & params**: tool schema list (view; remove; edit
   description/parameters with rename refused), params override form
   (whitelisted fields), each with the active/inactive state and reset.

Destructive actions get confirm dialogs showing what the model will see
afterwards. All copy via the locale system (en + zh like upstream; other
locales fall back).

### 4.3 Integration seams (the complete upstream-diff inventory)

1. **`packages/core/session/src/index.ts` — derivation rule (~3 lines,
   marked `fork: context-editor`)**: in `deriveMessages`, a message derived
   from a surface node is skipped when its content is empty AND its source
   discriminates `context-edit/excluded`. Rationale: an excluded message
  carries nothing, so it derives to nothing — the same rule empty
  assistant steps already follow. "Empty" is defined precisely: no content
  blocks, or every block an empty text block. This makes exclusion durable,
   fork-inherited, and effective for ALL consumers (loop requests, titles,
   compaction prefixes, token meter).
2. **`packages/core/agent-loop/src/agent.ts` — override application
   (small, marked)**: where the step's call config and tool set are
   finalized (before `request/header` is written and the request frozen),
   apply the session's Context Editor overrides: filter/edit tool schemas,
   merge whitelisted param fields. Ordering guarantees the logged
   `request/header`, the frozen request, the token meter, and the captured
   request log all show the SAME effective values. If the exact finalize
   point proves to split config/tools, the fallback is two marked
   application points in the same file. Scope: overrides apply to
   agent-loop requests (the session's main model traffic). Auxiliary
   hand-built requests (session titles, compaction summaries) keep their
   own inherited configuration and are captured but not overridden; this
   boundary is stated in the UI.
3. **`packages/client/ui-chat` timeline (small, marked)**: conversation
   nodes render the *effective* surface content — edited nodes show current
   text with an `edited` badge and a "view original" popover; excluded
   nodes render as collapsed "hidden from model" stubs (visible, obviously
   non-content) so the timeline never lies about what the model sees.

Bundle wiring: additive rows in `packages/dsh-web-app/cordis.patch.yml`
(host entry `context-editor`, client entry `ui-context-editor`), following
the existing insert-row style, in a clearly commented fork section.

`FORK.md` documents this inventory, the patch-application order, and the
upstream-update runbook (extract new upstream → rebase our three marked
edits → keep new packages → re-run fork test suite → rebuild bundles).

### 4.4 Signed reasoning

DeepSeek Messages-API reasoning blocks may carry signatures. Editing such a
block strips the signature (the edited text can no longer match it) and the
UI warns. If the API rejects unsigned reasoning on replay (verified during
implementation against SLR Runtime / real provider behavior), the editor
auto-excludes edited reasoning blocks from the outbound request instead and
says so in the UI. Unedited signed reasoning is passed through untouched —
strictly better than the plugin, which refused selection entirely.

## 5. Data flows

- **View**: client tab → `previewContext` → surface fold + header + tools +
  overrides → rows. Cheap enough for interactive use (fold is cached per
  `contentGeneration`).
- **Edit**: client → `editMessage` → validation (upstream surface rules) →
  append + flush → `contentGeneration` bump → next loop request derives
  edited content; capture listener records it; timeline re-renders.
- **Capture**: every `llm/stream` entry → request log append → `next()`.
  No session-scoped request can bypass capture (single dispatch funnel);
  requests without a `sessionId` are not captured (nothing to attach them
  to).
- **Condense**: select rows → `condenseRange` → summary request (itself
  captured, purpose `compaction`) → checkpoint replaces range → visible in
  timeline as compaction node; `expandCheckpoint` reverses in place;
  `createRecoveryBranch` forks from a pre-condensation boundary.

## 6. Failure handling

- All host-side writes fail explicit (no silent partial state): upstream
  validation errors surface verbatim with the offending seq.
- Request-log write failures never break the request path: capture is
  try/catch-wrapped; a failing log degrades to a UI notice, the model
  request proceeds.
- Missing/corrupt sidecar records fail explicit; overrides fall back to
  "no overrides" with a visible warning rather than blocking sessions.
- The plugin must not be reinstalled alongside: its provider/selection
  machinery is incompatible with native edits by design; FORK.md and the
  README state this.

## 7. Testing strategy

1. **Unit (vitest, in-repo)**: derivation rule (empty/excluded skip);
   override application (tools filter, param merge, rename refusal);
   capture serialization + bounding + status; edit/exclude/restore folding;
   checkpoint expansion; condensation protocol adherence; cold-write path;
   revision fencing.
2. **Host integration (vitest, fixed local provider)**: real session flows —
   edit a user message → next request contains it; exclusion removes it;
   restore returns originals; restart between steps (durability); fork
   inherits edits; compaction over edited context; condensation +
   expansion; capture log completeness across agent + title + compaction
   requests.
3. **End-to-end (offline bundles)**: boot fork web profile against SLR
   Runtime, drive the real UI (LibreWolf under Xvfb + screenshots):
   edit a message, exclude an assistant turn, verify at the HTTP level that
   SLR Runtime received exactly the edited payload (request capture in the
   SLR runtime logs / local capture proxy), timeline badges render, request
   log shows the auxiliary title request. Both platforms.
4. **Regression**: existing fork defaults (dark start, no onboarding popups,
   SLR provider example) still hold after the rebase onto 0.2.2-alpha.2.

## 8. Delivery

- Build the fork from source into the established offline bundle shape
  (Node runtime + built packages + per-platform natives + LibreWolf GUI
  launcher), replacing the npm-0.2.1-rc.2 base.
- New package version **2.0.0**: `dsh-linux-x64-v2.0.0.7z`,
  `dsh-windows-x64-v2.0.0.7z`; VERSION.txt updated (base now
  `0.2.2-alpha.2+context-editor`); README gains a Context Editor section.
- The existing fork defaults (dark mode, suppressed first-run dialogs, SLR
  Runtime provider example) carry over as additive patch rows — re-verified,
  not assumed.

## 9. Resolved decisions

| Question | Decision | Rationale |
|---|---|---|
| Edit persistence | Surface-replace events in the session log | Official, validated, durable, fork-inherited; originals preserved → exact undo |
| Exclusion | Replacement with empty content + `context-edit/excluded` source + 3-line derivation rule | True exclusion for all consumers; no fake-provider transform; one principled upstream edit |
| Tools/params overrides | Session-scoped sidecar record applied at request finalization (marked seam) | Header/request/capture all agree; survives restart via sidecar; fork does not inherit (documented) |
| Request capture | Read-only `llm/stream` listener, sidecar FIFO log | Respects the freeze contract; single funnel covers every in-process request |
| Selective condensation | Official compaction event protocol from our package; upstream-engine method as fallback | Parity without new core concepts |
| Checkpoint restore | In-place expansion via replace + re-append | Exact originals, positionally correct in the surface fold |
| Signed reasoning | Strip signature on edit + warn; auto-exclude if API rejects | Better than plugin's blanket refusal; verified in E2E |
| Timeline truthfulness | Marked ui-chat patch: effective content + badges + hidden stubs | Features-first per user decision |
| Upstream diff budget | 3 marked edits + additive packages/patch rows | Upgradability where free, quality where it counts |
