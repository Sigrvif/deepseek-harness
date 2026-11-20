---
description: "The \"Auto Superpowers\" Switch row on the General settings page: reads and writes the superpowers-bootstrap namespace's volatile autoUsingSuperpowers field through the shared configForms service (fork)."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-fork-auto-skills

## Summary

The **Auto Superpowers** switch in Settings → General controls the fork's automatic superpowers bootstrap. On (the default), every session gets the `using-superpowers` skill loaded once; off, skills load only when the user or the model invokes them. The row reads and writes the `superpowers-bootstrap` namespace through the shared configForms service and saves each flip immediately. A save that the Host refuses keeps the accepted value and shows an inline error instead.

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

The Web bundle's browser roster mounts the row beside the `superpowers-bootstrap` host plugin, so the shipped app needs no composition work. The switch appears among the General section's preference rows, below Developer tools.

### When to choose it

Choose it for any composition that mounts the automatic bootstrap and wants the preference user-visible. Skip it when `@deepseek-ai/dsh-superpowers-bootstrap` is absent: the row still renders the default posture, but every write fails its save.

### Minimal configuration

The package declares no configuration of its own — the node half is an empty plugin body, and the browser half only registers the row. The switch edits the `superpowers-bootstrap` namespace's volatile `autoUsingSuperpowers` field (default `true`), documented in the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-superpowers-bootstrap).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser half registers a localized `settings.general.item` row (id `fork-auto-skills`, order 16) and binds one configForms form over the `superpowers-bootstrap` namespace. The row's observable snapshot derives from the form's accepted value and falls back to the host default (on) until the namespace's first accepted value arrives, so an unreadable namespace still shows the posture the Host would apply. A flip calls `form.set('autoUsingSuperpowers', …)`; a refused write keeps the accepted value and raises the row's `role="alert"` error line. Copy lives in the `forkAutoSkills` locale namespace as en + zh; other languages fall back to English through the locale chain.

| Source | Owns |
|---|---|
| `src/client/index.ts` | Row registration, the namespace binding, and the observable snapshot with its default fallback. |
| `src/client/AutoSkillsRow.tsx` | The Switch row UI, busy state, and the inline save-failure alert. |
| `src/client/locales.ts` | The en + zh `forkAutoSkills` copy. |
| `tests/fork-auto-skills.client.spec.tsx` | Registration, default-on derivation, write-through, and refusal-alert pins. |

-----

<a id="further-exploration"></a>
## Further Exploration

- [Automatic bootstrap](../../skill/superpowers-bootstrap/README.md) — the host plugin this switch turns on or off.
- [Unrestricted mode switch](../ui-fork-unrestricted/README.md) — the next General row (order 17), same pattern.
- [Change reports switch](../ui-fork-change-report/README.md) — the last fork row on the page (order 18).
- [Fork additions tab](../ui-fork-info/README.md) — the Plugins-page inventory that names this switch.

-----

<a id="model-experience"></a>
## Model Experience

### General settings row

#### What the model sees

Nothing: the row is a browser-side surface that registers no tool, prompt section, or message; its writes land in Host configuration that `superpowers-bootstrap` consumes.

#### Token effect

None of its own. The switch's reach is indirect — with the bootstrap active, the Host injects the `using-superpowers` message once per session (a few hundred tokens); off, sessions carry nothing extra.

#### KV Cache effect

None of its own. The row contributes no model-visible content; the toggle decides only whether the bootstrap message joins the session prefix at all.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The row renders the host default (on) until the namespace's first accepted value arrives; an unavailable host composition leaves the switch non-functional.
- A refused save keeps the accepted value and shows the inline alert; there is no retry or write queue.
- Browser copy ships as en + zh only; other locales fall back to English through the locale chain.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1). The row sits at order 16 on the General page, below Developer tools; the host plugin suppresses its auto-generated settings page, so this row is the preference's only surface. The unrestricted row (order 17) and the change-report row (order 18) follow the same pattern. The package's `locale/*.json` files translate its package metadata (title and description) for plugin inventories; the row copy itself is the en + zh `locales.ts`.

</details>
