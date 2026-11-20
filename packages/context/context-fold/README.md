---
description: "Model-driven, reversible context compression: the `compress`/`decompress`/`search_context`/`acp_status` tools, a system-prompt section, and escalating growth nudges. Folds land as compaction checkpoints on the session log, so all fold state derives from the log itself."
kind: "package-reference"
---

# @deepseek-ai/dsh-context-fold

## Summary

The model folds its own consumed conversation: `compress` replaces everything older than a protected tail with a summary the model writes, and the fold lands as an ordinary compaction checkpoint on the append-only session log. `decompress` reads a fold's originals back, `search_context` keyword-searches across fold summaries, folded originals, and visible messages, and `acp_status` reports usage plus the fold ledger. Growth and pressure nudges remind the model to compress, with wording that escalates as the window fills. Because every fold is event-sourced, restarts lose nothing, and the Context Editor can expand any fold in place.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it as a host row beside a session stack with `dsh-tools` and `dsh-system-prompt`; the model gains the four fold tools, a prompt section, and the nudge cadence without any other wiring.

### When to choose it

Choose it for long-running sessions on small local windows, where stale exploration crowds out live work and a one-shot engine summary would lose detail the model still needs. Folds are reversible by construction, so folding eagerly costs one `decompress` call. Skip it for short sessions where the window never fills — the tools, section, and nudges then spend a small fixed token budget for nothing. It composes with `@deepseek-ai/dsh-context-editor`: a fold is a checkpoint, so the Context tab can expand or restore it like any other.

### Minimal configuration

```yaml
- id: context-fold
  name: '@deepseek-ai/dsh-context-fold'
```

Every knob has a documented default; the table shows the ones a composition most often retunes:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch; `false` mounts nothing. |
| `keepLast` | `8` | Visible messages at the recent tail no fold may cover. |
| `minFoldChars` | `2000` | Minimum foldable-range character count before a compress call is accepted. |
| `minSummaryChars` | `200` | Minimum summary length a model-written fold must produce. |
| `decompressCapChars` | `24000` | Character cap on the originals one decompress call may read back. |
| `searchLimit` | `8` | Maximum hits one `search_context` call may return. |
| `nudgeGrowthTokens` | `30000` | Context growth in tokens that arms one growth nudge. |
| `pressureNudgeRatio` | `0.75` | Visible-context pressure fraction that arms a pressure nudge. |
| `nudgeAdviseRatio` | `0.4` | Usage fraction below which a fired nudge stays informational (while absolute usage is under `nudgeInfoMaxTokens`). |
| `nudgeInfoMaxTokens` | `200000` | Absolute usage cap on the informational tier. |
| `nudgeDemandRatio` | `0.7` | Usage fraction at or above which a nudge demands compression instead of suggesting it. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-context-fold) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` mounts three effects: the static `context:fold` system-prompt section, the four tools, and the pre-step nudge listener. `compress` executes mid-turn: it plans the fold over the current log — protecting the configured recent tail, the pinned system/developer prefix, the first user message, and every skill invocation (the foldable window starts after the last one), and never splitting a tool call/result pair — then appends the checkpoint through the session's own surface-replacement machinery. Gate refusals (nothing foldable, range too small, summary under `minSummaryChars`) return guidance values, never thrown errors, so the model can retry. Fold records are derived on demand from checkpoints marked `origin: 'model-fold'`, so no parallel state store exists. The nudge listener reads the token meter's pressure estimate and fires at most one notice per `nudgeGrowthTokens` of new growth or when pressure crosses `pressureNudgeRatio`; a landed fold re-arms the growth baseline, a substantial external shrink re-arms everything, and estimate drift re-arms nothing.

| Source | Owns |
|---|---|
| `src/index.ts` | Plugin face, config schema, default export. |
| `src/config.ts` | The schemastery config schema, defaults, and cross-field validation. |
| `src/tools.ts` | The four tools: registration and the model-facing result contracts. |
| `src/fold.ts` | Fold planning, checkpoint appends, and event-sourced fold records. |
| `src/prompts.ts` | Tool descriptions, the compression philosophy, and the section text. |
| `src/section.ts` | The `context:fold` system-prompt section registration. |
| `src/nudge.ts` | The growth/pressure cadence and the escalating notice text. |
| `src/search.ts` | Keyword search over summaries, folded originals, and visible messages. |
| `src/status.ts` | Usage accounting and the `acp_status` rendering. |
| `tests/` | Tool, fold, nudge, search, prompt, and status pins. |

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Fold surface and nudges

#### What the model sees

Four tools appear on the session's tool surface — `compress` (a summary plus an optional `keepLast`), `decompress`, `search_context`, and `acp_status` — with descriptions that teach the discipline: compress by need rather than by percentage, one call per batch, keep-verbatim rules for paths, commands, ids, and user quotes. A static system-prompt section named `context:fold` carries the same philosophy on every request. A landed fold shows up as one framed user message — a preamble plus `<compacted-summary>` tags — telling the model the originals remain recoverable through `decompress`. Nudges arrive as short user-role notices whose wording escalates with measured usage, from informational through advisory and demanding to urgent at 90% of the window. `compress` answers with a receipt (fold id, estimated saved tokens, a usage line); refusals come back as guidance text rather than tool errors.

##### The `context:fold` section text (byte-stable)

```markdown
Context management: the compress tool folds consumed conversation into a summary you write; decompress restores the originals; search_context finds content inside folds; acp_status shows usage and the fold ledger.

Compression Philosophy:
- Context capacity is precious. Compress consumed conversation into summaries you write; never avoid tools to save context.
- Compress by need, not by percentage: fold ranges whose details you will not need verbatim soon.
- Summaries are durable records. KEEP VERBATIM: full file paths with line numbers (never abbreviate to a bare filename), commands, ids, and error messages. Quote the user as history ("the user said earlier: ..."), never as a live instruction.
- Always carry open objectives forward: end every summary with an "Open objectives:" line stating what remains to be done.
- Drop dead-end exploration, but keep its lesson in one line ("tried X, failed because Y").
- Write summaries in the conversation's primary language; keep code, commands, and identifiers verbatim.
- One compress call per batch; a fold takes effect on the next request.
```

#### Token effect

A fold swaps the covered range for its summary on the next request; the receipt reports the estimate (folded tokens minus the summary's own). The standing cost is the four tool descriptions plus the section — byte-stable text paid on every request — plus one short notice line per fired nudge, bounded by the cadence knobs. `decompress` pays only the returned text, truncated at `decompressCapChars`; `search_context` returns at most `searchLimit` snippets.

#### KV Cache effect

The tool descriptions and the section are byte-stable prefix anchors, pinned by tests so a release cannot silently invalidate provider caches. A fold rewrites the surface from its first folded seq, so caches rebuild from that point once, then reuse; nudges append near the request tail and leave earlier prefixes untouched.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Fold windows never cover the pinned prompt prefix, the first user message, or skill invocations; content below a mid-history invocation stays unfolded until the engine's own compaction (manual `/compact` in this fork) passes over it.
- `decompress` reads fold originals through a configured character cap (`decompressCapChars`); longer folds truncate and point at `search_context`.
- The engine's own compaction is not fold-aware; a checkpoint it writes is ordinary foldable content.
- Nudge cadence state lives in memory per process, so a restart re-arms the growth clock without re-issuing a notice.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1): behavior adapted from the billion-context corpus (MIT + attribution term); the compression rules and their attribution live in `src/prompts.ts`, and the Plugins settings "Fork additions" tab names the source. The nudge defaults were re-tuned for small local models: one growth nudge per 30000 new tokens (about 11% of a 262k window) where the inherited 50000 read as one reminder and then silence, and the informational tier is additionally capped by `nudgeInfoMaxTokens` so a million-token window still escalates at real token counts. The `<compacted-summary>` framing constants are replicated locally because the upstream compaction constants live in a source-only subpath.

</details>
