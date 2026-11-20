---
description: "The browser sidebar brand: the DSLRH mark and a name plate with the fork version, claimed over the upstream local-build fallbacks."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-fork-brand

## Summary

Puts the fork's identity in the browser sidebar: the DSLRH mark replaces the upstream fish logo, and the name plate shows the fork title over its version, click to copy. Two slot occupants claim `sidebar.brand.mark` and `sidebar.brand.name`, so a deployment renders the fork brand without forking the sidebar itself. Static by design: no remotes, no host half, and the version text rides the build-time `DSH_CLIENT_FORK_VERSION` value.

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

Add its row to the web-app bundle's browser roster and the sidebar's logo row renders the fork brand — nothing else to wire, and no configuration to set.

### When to choose it

Choose it for any web deployment of the fork that should not look like upstream: it claims both brand seats over the sidebar's local-build fallbacks (the fish logo and the base-version plate). Skip it when another package already owns those seats — upstream official builds use `ui-brand-official`, and a deployment with its own identity should occupy them itself instead of fighting this one.

### Minimal configuration

The package has no configuration; the roster row is the whole mount. The plate's version text comes from the build-time `DSH_CLIENT_FORK_VERSION` value, not from any config field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers the `forkBrand` locale namespace (en and zh both render the language-independent `DSLRH` title) and injects two occupants. `ForkBrandMark` renders the bundled PNG at the geometry the sidebar requests — intrinsic aspect, rounded corners, 24 px on the collapsed rail and 60 px in the expanded row. `ForkBrandName` stacks the locale title over the fork version, keeping the upstream fallbacks' click-to-copy behavior; the version is read from the build-time `DSH_CLIENT_FORK_VERSION`, and when a build does not define it only the title renders. Both seats are `single` slots declared by `ui-sidebar`, which renders its fish logo and local-build plate only as fallbacks when no occupant claims them.

| Source | Owns |
|---|---|
| `src/client/index.ts` | Plugin body: locale registration, both brand-slot injections. |
| `src/client/ForkBrand.tsx` | The mark image and the version plate. |
| `src/client/ForkBrand.module.css` | Mark geometry and plate stacking on the expanded row. |
| `src/client/locales.ts` | The `forkBrand` namespace (`title`, en + zh). |
| `tests/apply.client.spec.tsx` | Slot-claiming and copy-to-clipboard pins. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-brand-official](../ui-brand-official/README.md) — the official-build brand package that occupies the same seats for DeepSeek-branded deployments.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

### Sidebar brand plate

#### What the model sees

Nothing: the mark and plate are browser DOM in the sidebar's logo row. The package's only registrations are the `sidebar.brand.mark` and `sidebar.brand.name` slot occupants and the `forkBrand` locale namespace — no tool, no prompt section, no session event — and requests are assembled host-side without reading any of it.

#### Token effect

None: the package produces no request content of any kind; copying the version writes to the browser clipboard, not to a model.

#### KV Cache effect

None: there is no request to change — brand rendering never touches assembled context, tool lists, or messages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The version string is baked per bundle** — `DSH_CLIENT_FORK_VERSION` is a build-time value; a build without it renders the title alone, and the plate's click copies the empty string.
- **Both seats are single-occupancy** — the occupants win over the sidebar's fallbacks, but a second package claiming `sidebar.brand.mark` or `sidebar.brand.name` shadows the fork brand rather than sitting beside it.
- **The mark is one fixed artwork** — the PNG (the fixed 123×123 render from 2.4.31) scales to the requested edge with rounded corners; there is no dark/light variant, only the plate text rides theme alias variables.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.24; the mark artwork was re-rendered at a fixed 123×123 in 2.4.31). The bundle's roster row briefly went missing in the 2.4.24 packaging, which left the sidebar on the upstream fallbacks — FORK.md §2 keeps the incident noted. The companion product-title change (`brand.localBuild` → DSLRH) lives in `packages/client/locale`, not here. Package version 0.2.2-alpha.2.

</details>
