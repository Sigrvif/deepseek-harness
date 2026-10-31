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
| `packages/context/context-fold` | host | Native Context Fold: model-driven, reversible compression — `compress`/`decompress`/`search_context`/`acp_status` tools, a system-prompt section, and growth nudges; folds land as `origin: 'model-fold'` compaction checkpoints and all fold state derives from the session log. Behavior adapted from billion-context (MIT + attribution; see its `src/prompts.ts`) |
| `packages/client/ui-context-editor` | web client | The Context tab: effective context (search/edit/exclude/restore/batch), captured request log, tools & params forms; self-mounts the remote |
| `packages/client/ui-fork-info` | web client | The "Fork additions" tab in the Plugins settings page: names the two additions (Context Editor, Context Fold) with summaries and the billion-context attribution |

## 2. Marked upstream edits (small, each hunk commented `fork(context-editor):`)

| File | Change | Why |
|---|---|---|
| `packages/core/session/src/surface.ts` | (a) `deriveEventMessage`: an empty replacement marked `contextEdit.mode='excluded'` derives to `null`. (b) `assertSourceEventReferences`: assistant replacements may cite `sourceEventSeqs` (coverage still enforced). | (a) makes exclusion durable/fork-inherited for EVERY consumer of derivation; (b) upstream's ban made assistant answers unrepresentable as 1:1 replacements |
| `packages/core/agent-loop/src/context-edit-registry.ts` | NEW additive file | The session-scoped override lookup consumed at the request-finalization seam; keeps agent-loop from importing the Context Editor package |
| `packages/core/agent-loop/src/index.ts` | export the registry (additive lines) | Import path for the Context Editor package |
| `packages/core/agent-loop/src/agent.ts` | 2 marked seams: params merge into the PROPOSED config before `prepareCall` (the loop rejects post-prepare config drift); tools shaped before `canonicalHeader`, so header/request/meter/capture agree | Override application point |
| `packages/core/session/src/surface.ts` (additive block at end) | `contextEditMarkerOf` / `isContextEditReplacement` / `contextEditShadowedSeqs` helper exports | Shared by the host and the browser fold; lives here because the client bundle purity gate forbids cross-plugin value imports |
| `packages/client/ui-conversation/src/client/conversation/assembler.ts` | two intake loops skip appends shadowed by a context-edit replacement (marked) | The timeline folds effective content |
| `packages/bundle/web-app/src/index.ts` | the URL line and default-browser handoff wait for a serving probe (self-fetch of the advertised root until it answers HTTP; bounded, then warns and proceeds) | the listener accepts connections before serving dependencies finish mounting, and a browser opened into that window loads an empty page (observed on Windows) |
| `packages/spill/spill-local/src/{store,cleanup,index}.ts` | private-root creation falls back to app-owned bases (`$DSH_HOME/spill`, cwd) when %TEMP% denies writes; startup discovery scans every base (marked) | Windows security software denies %TEMP% writes to unsigned processes: the spill backend failed to activate and an uncaught retry killed the server after startup |
| `packages/bundle/web-app/package.json` | adds `@deepseek-ai/dsh-context-editor` + `@deepseek-ai/dsh-client-ui-context-editor` + `@deepseek-ai/dsh-context-fold` dependencies | The loader resolves bundle rows through the declarer's package context |
| `packages/client/ui-chat/src/client/conversation-nodes/message.ts` | user replacements with the marker render their effective content; excluded ones fold away | Timeline truthfulness |
| `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts` | same for assistant replacements (fold into their step) | Timeline truthfulness |
| `packages/bundle/web-app/cordis.patch.yml` | host row `context-editor`, browser roster row `ui-context-editor`, and the `fork(local-test)` config blocks (dark theme default; preview notice pre-acknowledged; first-run credential onboarding off) | Bundle wiring + carried-over local-test defaults (formerly applied post-build in the shipped bundles) |
| `tsconfig.host.json` | one reference line each (new packages in the build graphs) | Build enumeration |
| `packages/compaction/compaction/src/types.ts` | `compaction/summary` event gains optional `origin: 'model-fold'`, `foldedTokens`, `summaryTokens` fields | Marks model-driven folds so fold records derive from the log; engine backends are unaffected |
| `packages/core/system-prompt/src/index.ts` | new `CONTEXT_FOLD: 2350` section-order slot | Centrally allocated position for the fold system section (context-tool family) |
| `packages/bundle/web-app/cordis.patch.yml` | host rows `context-fold` + `ui-fork-info` beside `context-editor`; browser roster rows | Bundle wiring |
| `packages/client/ui-settings-models/src/client/store.ts` | provider directory sorts the built-in DeepSeek routes LAST (upstream pins them first) | Offline local-test posture: user-added providers (the local runtime) lead the page |
| `packages/client/ui-settings-models/src/client/ModelsSection.tsx` | the first-run setup card is disabled (`internals.setupCardEnabled`, default off); the add card opens on the Custom model API tab (upstream: catalog); and an unkeyed built-in DeepSeek route is DORMANT — it lists in the third-party catalog and becomes an ordinary row only once it has a credential (stored key or env); the shipped slr-runtime preset's editor opens on start while its model list still equals the shipped example (`SLR_RUNTIME_EXAMPLE_MODEL_ID`) | The page leads with the local runtime, opens the one editor the user must touch, and DeepSeek behaves like any catalog option |
| `packages/client/ui-settings-models/src/client/locales.ts` | `keyFallbackMissing` reworded to neutral guidance in all 8 languages | A missing env fallback is normal here, not an alarm |
| `packages/client/ui-settings-general/src/client/CurrentVersionRow.tsx` + `locales.ts` | optional fork segment: `DSH_CLIENT_FORK_VERSION` renders "Local fork package: …" beside the dsh base version | The About row names both the base and the fork build |
| `scripts/client-build-environment.ts` | `repositoryClientBuildEnvironment` emits `DSH_CLIENT_FORK_VERSION` from the manifest's optional `dshFork.version` field | Single source for the fork version (root package.json) |

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
