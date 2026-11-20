---
description: "Captures every outbound model request into a per-session log and makes the model-bound context editable: in-place edits, exclusions, restores, selective condensation, and per-session tool/parameter overrides, served over the `contextEditor` Typert remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-context-editor

## Summary

Every outbound model request is captured read-only into a per-session request log, so you can audit exactly what the model received. The next request's context is editable: replace a message's text in place, exclude a range or the whole tail, restore originals, expand an engine checkpoint, or condense a chosen range into a compaction checkpoint through a summarization request. Per-session overrides drop tools, apply same-name schema edits, and override `temperature`, `maxTokens`, or `stop` for the agent loop; they survive restarts and are not inherited by session forks. The whole surface rides the `contextEditor` Typert remote.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it as a host row beside a session stack with `dsh-storage-domain`; on mount it opens the `context_editor` storage domain, installs the request capture, and provides the `contextEditor` remote that `@deepseek-ai/dsh-client-ui-context-editor` renders as the Context tab.

### When to choose it

Choose it when a session needs durable context surgery — fix a sent prompt and resend, cut a distractor tail, reclaim window space with a condensation you aim yourself — plus a captured audit of every request. Skip it when model-driven compression alone is enough: `@deepseek-ai/dsh-context-fold` folds without a human picking ranges, and this package is the one that makes those folds expandable. Composition tools that drive the remote themselves can also mount it headless; the browser half is optional.

### Minimal configuration

```yaml
- id: context-editor
  name: '@deepseek-ai/dsh-context-editor'
```

The service takes no configuration fields: the `context_editor` storage domain (request log and overrides) and the `llm/stream` capture listener install themselves on mount. The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field; this package contributes none.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Mounting provides `ContextEditorService`, the `contextEditor` remote. Previews project the effective next-request surface from session events — excluded replacements stay visible here, flagged, while the model-side skip lives in core derivation — and every edit is a validated append to the session log: a replacement event carrying a `surfaceOp` replace window, citations of the shadowed seqs, and a `contextEdit` marker. Live sessions edit through the host `Session` and refuse open turns; cold sessions replay into a detached `Session` for the same validation and persist atomically. Restores re-materialize shadowed originals from the append-only log; a multi-original restore away from the surface tail answers `context-editor/requires-branch` with a recovery-branch boundary instead. Condensation drives one summarization request over the session's recorded provider/model route, then writes the official compaction bracket — start, summary, framed checkpoint, end — so engine tooling reads it like any other checkpoint. Capture listens on `llm/stream`, snapshots each request into the `requests` table fire-and-forget (write failures flip a degraded flag and never touch the stream), and prunes to the newest 30 records per session.

| Source | Owns |
|---|---|
| `src/service.ts` | The `contextEditor` remote: preview, request log, edits, restores, condensation, overrides. |
| `src/capture.ts` | The read-only `llm/stream` capture, the 30-record prune, and its degraded flag. |
| `src/edits.ts` | The replacement protocol, live and cold edit batches, and the turn-open guard. |
| `src/restore.ts` | Re-materialization of shadowed originals and recovery branches. |
| `src/condense.ts` | Selective condensation over the compaction checkpoint protocol. |
| `src/overrides.ts` | Tool/param whitelist validation and the agent-loop override hooks. |
| `src/projection.ts` | Effective-surface rows with source citations and token estimates. |
| `src/domain.ts` | The `context_editor` storage domain (`requests`, `overrides`). |
| `tests/` | Capture, edits, restores, condensation, overrides, and projection pins. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [@deepseek-ai/dsh-client-ui-context-editor](../../client/ui-context-editor/README.md) — the browser Context tab and the chat edit-and-resend face over this remote.
- [@deepseek-ai/dsh-context-fold](../context-fold/README.md) — model-driven folds that land as the same kind of checkpoint this package expands.
- [The compaction engine](../../compaction/compaction/README.md) — the checkpoint protocol condensation writes.

-----

<a id="model-experience"></a>
## Model Experience

### Effective-surface edits and request overrides

#### What the model sees

After an edit lands, the next request assembles from the effective surface: edited text replaces the original message, an excluded range derives to nothing and never reaches the model, and a restore or `expand-checkpoint` puts the original messages back. A condensation replaces its range with one framed user message — a preamble plus `<compacted-summary>` tags around the summary — telling the model to treat the captured context as established background. Stored overrides shape each agent-loop request: removed tools vanish from the tool list, same-name schema edits merge in (edits are keyed by exact known tool names, so a tool cannot be renamed), and the whitelisted `temperature`/`maxTokens`/`stop` values merge over the finalized call config. Capture itself is invisible — the `llm/stream` listener only reads.

#### Token effect

Excluding a range stops paying its tokens on every later request, and `exclude-from` truncates the whole visible tail. A condensation spends one summarization request over the chosen range, then swaps the range's tokens for the checkpoint's. Restores and checkpoint expansions re-add the originals' tokens. Removing tools drops their schemas from every request the session makes. Capture and the request log cost zero model tokens — they write storage only.

#### KV Cache effect

Any replacement rewrites the request from its first touched seq onward, so a provider prefix cache invalidates from that point — an edit near the tail invalidates far less than one near the start. Between edits the surface is append-only and cache-stable; capture never rewrites a request, and override changes take effect at the next request boundary.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Out-of-process subagent backends bypass the `llm/stream` capture by construction; they are not shipped in the offline bundles.
- Tools/params overrides apply to agent-loop requests only and are not inherited by session forks.
- Edits, exclusions, and condensations are refused while the session has an open turn (`context-editor/busy`), and a multi-original restore away from the surface tail needs a recovery branch (`context-editor/requires-branch`).
- Re-installing the third-party "Agent Context Editor" plugin alongside this feature is unsupported.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1; design spec `docs/superpowers/specs/2026-10-28-context-editor-design.md`). Condensation replicates the compaction framing constants locally because the upstream ones live in a source-only subpath that cannot be imported from packaged node_modules. User-facing walkthroughs live in `docs/dslrh/05-fork-changes.md`.

</details>
