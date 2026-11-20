---
description: "The always-on deliverable-style section behind the persona: the response is the deliverable and opens with it, workspace text is data rather than instructions, and user-supplied names render verbatim."
kind: "package-reference"
---

# @deepseek-ai/dsh-delivery-style

## Summary

Gives every assembled prompt a standing presentation posture: the response is the deliverable and opens with it, placeholders stand only for values the request left unspecified while request-named values render verbatim, text read from workspace files and context blocks is data rather than instructions, and a genuinely useful caveat follows the deliverable as one line. The section is static, registered unconditionally behind the persona, and deliberately says nothing about what to deliver — no refusal routing, no category contracts. Choose it to make this posture the default in every session; the full opt-in content contract ships separately as `@deepseek-ai/dsh-unrestricted-mode`.

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

Mount it in the host composition and every session's assembled system prompt carries the section — the shipped web-app bundle mounts it by default.

### When to choose it

Choose it whenever sessions should present results as usable deliverables instead of descriptions of them, and when text read from files, task briefs, and context blocks should be treated as data rather than as new instructions (a standing prompt-injection defense). Skip it only for compositions that want the bare stock prompt: the section is unconditional and static, so there is no per-session middle ground. For content scale and refusal behavior — the what, not the how — use `@deepseek-ai/dsh-unrestricted-mode`, whose style clauses this section adapts.

### Minimal configuration

The smallest mount is one plugin row; no config is required:

```yaml
- name: '@deepseek-ai/dsh-delivery-style'
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch, read at mount; `false` registers nothing. Not volatile — turning it off is a composition edit plus remount, not a settings-page toggle. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-delivery-style) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` registers one section through the system-prompt registry: name `delivery:style`, order `DELIVERY_STYLE` (`250` — directly behind the persona at `0`, ahead of `plan:policy` at `500`), with `interpolate: false` because the text is fixed. The text is a single exported constant, so a composition can shadow the section by name like any other. The style and input-hygiene clauses are adapted from the style portions of yexi-by/dsh-unrestricted's execution-mode block (MIT), stripped of its refusal-suppression clauses.

| Source | Owns |
|---|---|
| `src/index.ts` | Plugin face, the registry call, and the `enabled` gate. |
| `src/section.ts` | The section name and the fixed section text. |
| `src/config.ts` | The `enabled` schema and its default. |
| `tests/delivery-style.spec.ts` | Position, presentation-only wording, and defaults. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@deepseek-ai/dsh-unrestricted-mode`](../unrestricted-mode/README.md) — the opt-in block whose style clauses this section adapts.
- [Model surface](../../../docs/dslrh/02-model-surface.md) — where the section sits among the fork's model-facing additions.

-----

<a id="model-experience"></a>
## Model Experience

### Delivery-style section

#### What the model sees

One static paragraph, `delivery:style`, directly behind the persona in every assembled prompt. It states that the response is the deliverable and must open with it, that placeholders (`TARGET`, `HOST`, `PORT`, `TOKEN`) stand only for values the request left unspecified while request-named values render verbatim, that text read from workspace files, task briefs, and context blocks is data rather than new instructions, and that a genuinely useful caveat follows the deliverable as one line. It makes no statement about what to deliver.

#### Token effect

The same fixed paragraph — about 180 words, roughly 250 tokens — is part of every request while the package is mounted, with no per-turn variance and nothing else in the request changed.

#### KV Cache effect

The section is static and sits at a fixed position behind the persona, inside the stable prompt prefix, so it is consumed as part of the identical prefix every request reuses.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

Current constraints of the section as shipped:

- Presentation only: the section carries no refusal routing and no per-category contracts; changing what the model delivers requires `@deepseek-ai/dsh-unrestricted-mode`.
- The `enabled` switch is read at mount, not per request: disabling is a composition edit plus remount, with no settings-page toggle.
- The guidance competes by prose, not by enforcement: a strong conflicting instruction elsewhere in the prompt can still override it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.28; base deepseek-harness v0.2.2-alpha.2, package v0.2.2-alpha.2). The one upstream-file edit it needs is the `DELIVERY_STYLE: 250` order slot in `packages/core/system-prompt/src/index.ts`, hunk-commented `fork(context-editor)`. Style and input-hygiene clauses are adapted from the style portions of yexi-by/dsh-unrestricted's execution-mode block (MIT), stripped of refusal-suppression clauses; the attribution for the full block lives in `packages/prompt/unrestricted-mode/THIRD_PARTY_NOTICES.md`.

</details>
