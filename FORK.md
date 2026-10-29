# FORK.md — this fork's contract with upstream

Base: **deepseek-harness v0.2.2-alpha.2** (commit `e9b21682`, pristine upstream).
Branch `context-editor` adds the native **Context Editor** feature
(`docs/superpowers/specs/2026-10-28-context-editor-design.md`).

Everything the fork adds beyond upstream falls into exactly four buckets.
After rebasing onto a newer upstream, re-verify this inventory with:

```sh
git diff --stat <upstream-baseline>..HEAD -- packages/core packages/client packages/bundle tsconfig.host.json tsconfig.client.json
```

Every diff hunk in upstream files carries a `fork(context-editor):` marker.

## 1. New packages (upstream never touched)

| Package | Face | Purpose |
|---|---|---|
| `packages/context/context-editor` | host | Request capture (`llm/stream` listener), context projection, surface edits/exclusions/restores, selective condensation, tools/params overrides, the `contextEditor` Typert remote, and the `context_editor` storage domain (request log + overrides) |
| `packages/client/ui-context-editor` | web client | The Context tab: effective context (search/edit/exclude/restore/batch), captured request log, tools & params forms; self-mounts the remote |

## 2. Marked upstream edits (small, each hunk commented `fork(context-editor):`)

| File | Change | Why |
|---|---|---|
| `packages/core/session/src/surface.ts` | (a) `deriveEventMessage`: an empty replacement marked `contextEdit.mode='excluded'` derives to `null`. (b) `assertSourceEventReferences`: assistant replacements may cite `sourceEventSeqs` (coverage still enforced). | (a) makes exclusion durable/fork-inherited for EVERY consumer of derivation; (b) upstream's ban made assistant answers unrepresentable as 1:1 replacements |
| `packages/core/agent-loop/src/context-edit-registry.ts` | NEW additive file | The session-scoped override lookup consumed at the request-finalization seam; keeps agent-loop from importing the Context Editor package |
| `packages/core/agent-loop/src/index.ts` | export the registry (additive lines) | Import path for the Context Editor package |
| `packages/core/agent-loop/src/agent.ts` | 2 marked seams: params merge into the PROPOSED config before `prepareCall` (the loop rejects post-prepare config drift); tools shaped before `canonicalHeader`, so header/request/meter/capture agree | Override application point |
| `packages/client/ui-conversation/src/client/conversation/context-edit.ts` | NEW additive file | Shadow-set + marker helpers |
| `packages/client/ui-conversation/src/client/conversation/assembler.ts` | intake skips appends shadowed by a context-edit replacement | The timeline folds effective content |
| `packages/client/ui-conversation/src/client/index.ts` | re-export the helpers (additive lines) | Import path for ui-chat |
| `packages/client/ui-chat/src/client/conversation-nodes/message.ts` | user replacements with the marker render their effective content; excluded ones fold away | Timeline truthfulness |
| `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts` | same for assistant replacements (fold into their step) | Timeline truthfulness |
| `packages/bundle/web-app/cordis.patch.yml` | host row `context-editor`, browser roster row `ui-context-editor`, and the `fork(local-test)` config blocks (dark theme default; preview notice pre-acknowledged; first-run credential onboarding off) | Bundle wiring + carried-over local-test defaults (formerly applied post-build in the shipped bundles) |
| `tsconfig.host.json` / `tsconfig.client.json` | one reference line each (new packages in the build graphs) | Build enumeration |

Upstream TEST files updated to the new contracts (marked in-file):
`packages/core/session/tests/canonical-envelopes.spec.ts` (assistant citations
validate like every other type), `packages/core/session/tests/surface.spec.ts`
(same + a new fork-contract test). New fork tests:
`packages/core/session/tests/context-edit-derivation.spec.ts`,
`packages/core/agent-loop/tests/context-edit-registry.spec.ts`,
`packages/client/ui-chat/tests/context-edit-timeline.client.spec.tsx`.

## 3. Upstream-update runbook

1. Extract the new upstream release into a fresh worktree; commit it as
   `upstream: <version> (pristine baseline)` on a branch off the OLD baseline
   (keeps a two-parent merge possible).
2. Merge/rebase: resolve conflicts only in the files listed in §2 — the new
   packages (§1) never conflict.
3. Re-apply the two `cordis.patch.yml` roster rows if the patch file moved.
4. `pnpm install && pnpm run build:native-system && pnpm vitest run` — the
   fork's own suites must pass; upstream suites must show no NEW failures
   (note: mixed-package vitest invocations have ~14 pre-existing cross-file
   isolation failures at the 0.2.2-alpha.2 baseline; run suites per package).
5. `pnpm exec tsx scripts/generate-typert.ts`, then `pnpm run build`
   (`build:lib:host` clobbers vendor runtime libs — prefer
   `tsx scripts/compile-referenced-projects.ts host-libraries` for runtime libs
   and `pnpm exec tsc -b packages/client/ui-context-editor` for the client graph).
6. Boot-check: dark start, no first-run dialogs, Context tab present (Task 15
   checklist in the plan), then rebuild the offline bundles.

## 4. Known boundaries

- Out-of-process subagent backends (external CLIs) bypass the `llm/stream`
  capture by construction; they are not shipped in the offline bundles.
- Tools/params overrides apply to agent-loop requests only (titles/compaction
  keep their inherited route) and are NOT inherited by session forks.
- Re-installing the old third-party "Agent Context Editor" plugin alongside
  this feature is unsupported (two editors would fight over the same sessions).
