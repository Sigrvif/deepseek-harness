---
description: "The \"Fork additions\" tab in the Plugins settings page: a static, locale-aware (en/zh) inventory of what this fork carries beyond upstream, with the billion-context and superpowers attributions (fork)."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-fork-info

## Summary

The **Fork additions** tab in Settings → Plugins is the findable inventory of what this fork carries beyond upstream: the native Context Editor and Context Fold, the bundled superpowers skills and their Auto Superpowers toggle, the MCP Servers page, deliverable-style guidance, and the Unrestricted mode and Change reports switches — each with a one-paragraph summary, closed by the billion-context, superpowers, and dsh-unrestricted/codex-keysmith attributions. The additions are always active; the tab exists so users can discover them. Content is static and locale-aware (en/zh), maintained beside the code.

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

The Web bundle's browser roster mounts the tab into the Plugins settings page, so the shipped app needs no composition work. The tab is named "Fork additions" and sits among the Plugins page's tabs.

### When to choose it

Choose it for any fork composition: the shipped additions are always mounted, and the tab is how users learn they exist. Skip it in a pure-upstream composition — the inventory would describe packages that are not mounted.

### Minimal configuration

The package declares no configuration: the tab is static content with no remote and no host services beyond the slot registry and the locale runtime.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser half registers a localized `settings.plugins.tab` (id `fork-additions`, order 5) and renders one static component: eight titled entries — Context Editor, Context Fold, Bundled Superpowers Skills, Auto Superpowers Toggle, MCP Servers Page, Deliverable Style Guidance, Unrestricted Mode Toggle, Change Reports — plus the closing attribution paragraph, all read from the `forkInfo` locale namespace. There is no state, no store, and no data fetching; the copy is maintained by hand in `locales.ts` (en + zh), so a fork change that alters an addition's behavior updates its summary in the same commit.

| Source | Owns |
|---|---|
| `src/client/index.ts` | Tab registration (id `fork-additions`, order 5) and locale wiring. |
| `src/client/ForkInfoTab.tsx` | The static entries and the attribution layout. |
| `src/client/locales.ts` | The en + zh `forkInfo` copy — the inventory itself. |
| `tests/fork-info.client.spec.tsx` | Registration, label, and entry-copy pins. |

-----

<a id="further-exploration"></a>
## Further Exploration

- [Auto Superpowers switch](../ui-fork-auto-skills/README.md) — the General row the tab's fourth entry describes.
- [Unrestricted mode switch](../ui-fork-unrestricted/README.md) — the General row behind the tab's seventh entry.
- [Change reports switch](../ui-fork-change-report/README.md) — the General row behind the tab's eighth entry.
- [DSLRH documentation](../../../docs/dslrh/README.md) — the systematic fork record the tab summarizes.

-----

<a id="model-experience"></a>
## Model Experience

### Plugins settings tab

#### What the model sees

Nothing: the tab (slot id `fork-additions`) is a static browser-side inventory that registers no tool, prompt section, or message, and nothing a user reads there reaches a request.

#### Token effect

None: the tab contributes nothing to any request in any state.

#### KV Cache effect

None: the tab registers nothing model-facing and never touches session context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The inventory is maintained by hand; a new fork addition must update `locales.ts` (both languages) in the same change.
- Entries are plain copy: the tab carries no links into package READMEs, settings deep-links, or the docs, so discovery stops at the summary text.
- Copy ships as en + zh only; other locales fall back to English through the locale chain.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1). The attribution paragraph carries the fork's upstream debts: Context Fold's behavior is adapted from the open-source billion-context project (MIT + attribution term), the bundled superpowers skills are derived from the open-source superpowers project by Jesse Vincent (MIT), and the unrestricted-mode block is ported from the open-source dsh-unrestricted project (MIT), which adapted it from codex-keysmith (MIT). Fork user documentation lives in `docs/dslrh/` and must keep agreeing with the tab's summaries.

</details>
