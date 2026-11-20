---
description: "The \"Unrestricted mode\" Switch row on the General settings page: reads and writes the unrestricted-mode namespace's volatile enabled field through the shared configForms service (fork; off by default, effective on the next request)."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-fork-unrestricted

## Summary

The **Unrestricted mode** switch in Settings → General (default off) enables the fork's opt-in execution-mode contract: while on, the Host fuses a ported delivery-contract block into every assembled prompt, so answers open with the deliverable instead of a refusal. Flipping takes effect on the next request without restarting; off, the prompt is byte-identical to the stock harness. The block costs roughly 1,900 tokens per request while on, and the row's own description states the scope, the cost, and the intended audience. The row writes the `unrestricted-mode` namespace's volatile `enabled` field through the shared configForms service.

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

The Web bundle's browser roster mounts the row beside the `@deepseek-ai/dsh-unrestricted-mode` host plugin, so the shipped app needs no composition work. The switch appears among the General section's preference rows, after Auto Superpowers.

### When to choose it

Choose it for compositions aimed at uncensored local models, where the user should decide the answer posture from the UI. Skip it when `@deepseek-ai/dsh-unrestricted-mode` is absent — the row still renders the default (off), but every write fails its save — or when sessions must keep the stock prompt in every case, because leaving the switch off is exactly that.

### Minimal configuration

The package declares no configuration of its own — the node half is an empty plugin body, and the browser half only registers the row. The switch edits the `unrestricted-mode` namespace's volatile `enabled` field (default `false`), documented in the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-unrestricted-mode); the [host package README](../../prompt/unrestricted-mode/README.md) owns the fused block's content and scope.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser half registers a localized `settings.general.item` row (id `fork-unrestricted`, order 17) and binds one configForms form over the `unrestricted-mode` namespace. The row's observable snapshot derives from the form's accepted value and falls back to the host default (off) until the namespace's first accepted value arrives, so an unreadable namespace still shows the posture the Host would apply. A flip calls `form.set('enabled', …)`; a refused write keeps the accepted value and raises the row's `role="alert"` error line. The row description carries the mode's scope, per-request token cost, and intended audience in both languages; copy lives in the `forkUnrestricted` locale namespace as en + zh, and other languages fall back to English through the locale chain.

| Source | Owns |
|---|---|
| `src/client/index.ts` | Row registration, the namespace binding, and the observable snapshot with its default fallback. |
| `src/client/UnrestrictedRow.tsx` | The Switch row UI, busy state, and the inline save-failure alert. |
| `src/client/locales.ts` | The en + zh `forkUnrestricted` copy, including the scope/cost/audience description. |
| `tests/unrestricted.client.spec.tsx` | Registration, default-off derivation, write-through, and refusal-alert pins. |

-----

<a id="further-exploration"></a>
## Further Exploration

- [Unrestricted-mode host plugin](../../prompt/unrestricted-mode/README.md) — the fused block this switch enables.
- [Auto Superpowers switch](../ui-fork-auto-skills/README.md) — the preceding General row (order 16), same pattern.
- [Change reports switch](../ui-fork-change-report/README.md) — the following General row (order 18).
- [Fork additions tab](../ui-fork-info/README.md) — the Plugins-page inventory that names this switch.

-----

<a id="model-experience"></a>
## Model Experience

### General settings row

#### What the model sees

Nothing from the row itself — it is a browser-side surface registering no tool, prompt section, or message. While `enabled` is on, the model receives the host's fused execution-mode section and persona pointer in each assembled prompt; off, the prompt is byte-identical to the stock harness.

#### Token effect

None of its own. The fused block the toggle enables costs roughly 1,900 tokens per request while on, and nothing while off.

#### KV Cache effect

None of its own. While the mode stays on, the fused block is byte-identical in every assembly and sits in the reused prompt prefix; a flip changes the prompt, and the difference takes effect — with the prefix change — on the next request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The row renders the host default (off) until the namespace's first accepted value arrives; an unavailable host composition leaves the switch non-functional.
- A refused save keeps the accepted value and shows the inline alert; there is no retry or write queue.
- The switch is global: while on, the host fuses the block into each assembled prompt (the `minimal` preset is immune by construction), and the row offers no per-session scoping.
- Browser copy ships as en + zh only; other locales fall back to English through the locale chain.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.28). The row sits at order 17 on the General page, after Auto Superpowers; the host plugin suppresses its auto-generated settings page, so this row is the preference's only surface. The fused block is ported from the open-source dsh-unrestricted project (yexi-by/dsh-unrestricted v0.2.10, MIT), which adapted it from codex-keysmith (MIT); see the host package's `THIRD_PARTY_NOTICES.md`. The package's `locale/*.json` files translate its package metadata for plugin inventories; the row copy itself is the en + zh `locales.ts`.

</details>
