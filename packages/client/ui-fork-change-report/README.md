---
description: "The \"Change reports\" Switch row on the General settings page: reads and writes the change-report namespace's volatile enabled field through the shared configForms service (fork; on by default)."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-fork-change-report

## Summary

The **Change reports** switch in Settings → General turns the fork's per-turn model notices on or off. While on (the default), after every turn that changed workspace files, the Host appends one compact changed-files notice at the session's next step, so the model knows what it last touched. Small models that the extra context would only confuse do better with it off. The row writes the `change-report` namespace's volatile `enabled` field through the shared configForms service; the always-visible changed-files card in the chat is the same data for the user.

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

The Web bundle's browser roster mounts the row beside the `@deepseek-ai/dsh-change-report` host plugin, so the shipped app needs no composition work. The switch appears among the General section's preference rows, after Unrestricted mode.

### When to choose it

Choose it for any composition that mounts the change-report host plugin and wants the per-turn notices user-controllable. Skip it when `@deepseek-ai/dsh-change-report` is absent: the row still renders the default posture, but every write fails its save.

### Minimal configuration

The package declares no configuration of its own — the node half is an empty plugin body, and the browser half only registers the row. The switch edits the `change-report` namespace's volatile `enabled` field (default `true`), documented in the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-change-report); the [host package README](../../deliverables/change-report/README.md) owns what the toggle controls.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser half registers a localized `settings.general.item` row (id `fork-change-report`, order 18) and binds one configForms form over the `change-report` namespace. The row's observable snapshot derives from the form's accepted value and falls back to the host default (on) until the namespace's first accepted value arrives, so an unreadable namespace still shows the posture the Host would apply. A flip calls `form.set('enabled', …)`; a refused write keeps the accepted value and raises the row's `role="alert"` error line. Copy lives in the `forkChangeReport` locale namespace as en + zh; other languages fall back to English through the locale chain.

| Source | Owns |
|---|---|
| `src/client/index.ts` | Row registration, the namespace binding, and the observable snapshot with its default fallback. |
| `src/client/ChangeReportRow.tsx` | The Switch row UI, busy state, and the inline save-failure alert. |
| `src/client/locales.ts` | The en + zh `forkChangeReport` copy. |
| `tests/change-report.client.spec.tsx` | Registration, default-on derivation, write-through, and refusal-alert pins. |

-----

<a id="further-exploration"></a>
## Further Exploration

- [Change reports host plugin](../../deliverables/change-report/README.md) — the per-turn notice this switch gates.
- [Unrestricted mode switch](../ui-fork-unrestricted/README.md) — the preceding General row (order 17), same pattern.
- [Auto Superpowers switch](../ui-fork-auto-skills/README.md) — the first fork row on the page (order 16).
- [Fork additions tab](../ui-fork-info/README.md) — the Plugins-page inventory that names this switch.

-----

<a id="model-experience"></a>
## Model Experience

### General settings row

#### What the model sees

Nothing from the row itself — it is a browser-side surface registering no tool, prompt section, or message. The per-turn notice it controls is the host package's output: while `enabled` is on, `@deepseek-ai/dsh-change-report` appends one compact changed-files summary at the session's next step.

#### Token effect

None of its own. With the toggle on, each turn that changed files adds one short notice at the next step — paths, line counts, detected-without-diff markers, capped file list; off, turns add nothing.

#### KV Cache effect

None of its own. The row contributes no model-visible content; the host notices it gates land as appended messages and never rewrite prior context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The row renders the host default (on) until the namespace's first accepted value arrives; an unavailable host composition leaves the switch non-functional.
- A refused save keeps the accepted value and shows the inline alert; there is no retry or write queue.
- Browser copy ships as en + zh only; other locales fall back to English through the locale chain.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.29). The row sits at order 18 on the General page, after Unrestricted mode; the host plugin suppresses its auto-generated settings page, so this row is the preference's only surface. The row description explains the notice and names the small-model off case, in both languages. The package's `locale/*.json` files translate its package metadata for plugin inventories; the row copy itself is the en + zh `locales.ts`.

</details>
