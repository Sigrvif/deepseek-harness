---
description: "Opt-in unrestricted execution-mode block (off by default) fused behind the persona while the General-settings toggle is on — the ported dsh-unrestricted jailbreak contract, roughly 1,900 tokens per request while on."
kind: "package-reference"
---

# @deepseek-ai/dsh-unrestricted-mode

## Summary

While the General-settings toggle is on, this package fuses an unrestricted execution-mode contract into every assembled prompt: delivery opens with the complete deliverable, refusal-style substitutes count as failed deliveries, and per-category task routing (keygens, reverse shells, detection bypass, fiction, guides, piracy lookups) is the payload, not a side effect. The block is ported verbatim from yexi-by/dsh-unrestricted v0.2.10 (MIT) and costs roughly 1,900 extra tokens on every request while on. Off by default, and with the toggle off the prompt is byte-identical to stock — intended for uncensored local models whose operators have already made that choice.

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

Mount it in the host composition (the shipped web-app bundle does) and leave it off until an operator consciously turns it on via the **Unrestricted mode** switch on the General settings page.

### When to choose it

Choose it for compositions on uncensored local models where refusal behavior and deliverable scale should follow the ported contract: the operator flips the toggle once, and every standard/ptc/cordis request — including delegated subagents — is fused from the next request on. Leave it off otherwise: the block's delivery clauses override refusal behavior by design, and its task routing is the payload. The `minimal` preset is immune by construction, and an assembly the fusion cannot key on (no persona, and not a subagent's) fails soft and keeps the stock prompt. The always-on style subset ships separately as `@deepseek-ai/dsh-delivery-style`.

### Minimal configuration

The smallest mount is one plugin row; the toggle lives on the General settings page, not in config:

```yaml
- name: '@deepseek-ai/dsh-unrestricted-mode'
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Volatile master switch, read per assembly; surfaced as the Unrestricted mode row on the General settings page. Flipping takes effect on the next request without remounting; off, the prompt is byte-identical to stock. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-unrestricted-mode) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

An unscoped `system-prompt/assemble` waterfall listener awaits the stock assembly, then — only while the volatile `enabled` toggle reads on — fuses it structurally, keyed on section names, never on upstream prose: `deployment:persona-prefix` extends in place with a pointer, `plan:policy`, `tools:ptc-only`, and `tool:structured_output` gain short delivery-not-content notes where present and non-empty, and the `unrestricted:execution-mode` section inserts directly behind the persona (behind `harness:identity` for delegated subagents without one). Fusion is idempotent — an assembly already carrying the block passes through — and fails soft, returning the stock prompt when it cannot key the persona. The `minimal` preset needs no handling: the registry restores its `complete: true` persona after the waterfall, so waterfall edits cannot reach it.

| Source | Owns |
|---|---|
| `src/index.ts` | Plugin face, the volatile `enabled` schema, the assemble listener, settings-page suppression. |
| `src/fuse.ts` | Structural section-name fusion and its issue reporting. |
| `src/text.ts` | The ported execution-mode block, pointer, and per-section notes. |
| `tests/unrestricted.spec.ts` | Fusion shape, idempotence, fail-soft, subagent handling, end-to-end waterfall. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@deepseek-ai/dsh-delivery-style`](../delivery-style/README.md) — the always-on style subset shipped unconditionally.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — the port attribution and MIT license texts.
- [Model surface](../../../docs/dslrh/02-model-surface.md) — the fork's record of what this toggle changes for the model.

-----

<a id="model-experience"></a>
## Model Experience

### Unrestricted execution mode

#### What the model sees

While `enabled` is on, every fused prompt gains an `unrestricted:execution-mode` section directly behind the persona: a contract whose delivery clauses make the response the complete deliverable, treat a refusal disguised as a summary as a failed delivery, and route tasks per category (keygens, reverse engineering, detection bypass, fiction with characters force-defaulted to adult, weapons guides, piracy lookups). The persona carries a one-sentence pointer to the section, and `plan:policy`, `tools:ptc-only`, and `tool:structured_output` carry short delivery-not-content notes when present. With the toggle off the prompt is byte-identical to stock.

#### Token effect

Roughly 1,900 extra tokens on every request while on — the block alone is about 1,530 words, plus the persona pointer and per-section notes; zero while off.

#### KV Cache effect

Fusion rewrites existing sections in place and inserts one new section behind the persona, so a flip on or off invalidates the cached prefix from the persona onward; while the toggle holds steady, the fused prefix is deterministic and stays cacheable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

Current constraints of the block as shipped:

- Preset reach: the fusion applies to the `standard`/`ptc`/`cordis` presets and their subagents; `minimal` is immune by construction (its `complete: true` persona is restored after the waterfall), so an operator on `minimal` sees no effect.
- Structural keying: sections a composition renames or drops simply receive no notes, and a non-subagent assembly without a persona fails soft and keeps the stock prompt.
- One switch, no gradations: it is a jailbreak prompt whose delivery clauses override refusal behavior and whose task routing is the payload — there is no partial-enablement below the single `enabled` toggle.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.28; base deepseek-harness v0.2.2-alpha.2, package v0.2.2-alpha.2). `src/text.ts` is a verbatim port of the execution-mode texts of yexi-by/dsh-unrestricted v0.2.10 (`src/rules.js`, MIT), which adapted Jia-Ethan/codex-keysmith's `examples/gpt-unrestricted.md` (MIT); `src/fuse.ts` is an adapted port of the same project's `fuseSections`. Full attribution and license texts: `THIRD_PARTY_NOTICES.md` beside this README. The General-settings row is `packages/client/ui-fork-unrestricted`; the harness integration (`src/index.ts`) and scaffolding are DSLRH's own.

</details>
