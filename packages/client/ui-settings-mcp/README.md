---
description: "The browser Settings → MCP Servers page: server cards and a per-transport add/edit form over the `mcpManager` remote, plus the Broker mode switch."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-mcp

## Summary

Gives the browser a Settings → MCP Servers page: server cards with live status, an add/edit form with per-transport fields, and enable, restart, and delete actions, all driven over the self-mounted `mcpManager` Host remote. Validation mirrors the host schema for immediate feedback, and stable `mcpManager/*` failure codes map to localized copy. The page also hosts the Broker mode switch, which saves the volatile flag through the shared settings forms. It is presentation only: persistence, fiber mounting, and every model-facing effect belong to the host package.

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

Mount it beside the host manager in a web deployment — the web-app bundle's browser roster carries both rows — and servers are managed from Settings instead of hand-edited profile rows.

### When to choose it

Choose it wherever `@deepseek-ai/dsh-mcp-manager` is mounted and servers should be edited from the browser; without it the `mcpManager` remote has no surface, and servers fall back to manual `dsh-mcp-client` profile rows. Skip it in headless or non-web compositions, where no settings page exists to dock.

### Minimal configuration

The package has no configuration fields: the roster row is the whole mount, and the Broker mode switch it renders saves into the host package's `mcp-manager` settings namespace, not a config of its own.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin self-mounts the generated `mcpManager` remote from the host package's typert projection (keeping `packages/api/remotes` untouched), registers the `mcpSettings` locale dictionaries, and docks a `settings.section` with id `mcp` at order 20. The section body resolves `remote.mcpManager` through a child scope that injects the namespace — it only exists after the mount settles, so declaring it on the plugin's own inject list would deadlock activation. `McpSection` renders the broker row, the server cards (status dot, transport summary, enable switch, edit/restart/delete with an inline delete confirmation), and an add/edit form whose fields follow the chosen transport; its client-side validation mirrors the host's, and `mcpManager/*` failure codes such as `mcpManager/duplicate-name` map to localized copy. The broker flag's reads ride the shared settings mirror and its writes go through the revision-fenced mutate, so the switch reflects the persisted value rather than a local hope.

| Source | Owns |
|---|---|
| `src/client/index.ts` | Plugin body: remote mount, locale registration, settings-section docking. |
| `src/client/McpSection.tsx` | The page: broker row, server cards, per-transport add/edit form. |
| `src/client/api.ts` | Promise-style adapter over the mounted namespace; attaches stable error codes. |
| `src/client/remote.ts` | Self-mount of the generated `mcpManager` remote. |
| `src/client/locales.ts` | en/zh copy for the `mcpSettings` namespace. |
| `tests/` | Plugin-application and section-behavior pins. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [@deepseek-ai/dsh-mcp-manager](../../mcp/mcp-manager/README.md) — the host half: storage domain, per-server fibers, broker mode.
- [Model surface — MCP servers](../../../docs/dslrh/02-model-surface.md#mcp-servers) — what configured servers do to assembled requests.

-----

<a id="model-experience"></a>
## Model Experience

### Server management surface

#### What the model sees

Nothing from this package: it registers no tool, no prompt section, and no session event. Its `settings.section` dock and its `mcpManager` remote calls are a client-side control channel, and which settings page is open never reaches a request. The model-visible consequences of editing servers — tool lists, broker masks, instruction text — belong entirely to the host manager and its mcp-client fibers.

#### Token effect

None of its own: the page submits no model input and contributes no request content. The one model-visible value it can move is the Broker mode switch, which writes the host's volatile `broker` flag; that effect is the host package's and is documented there.

#### KV Cache effect

None: browsing, editing, or saving server definitions changes no request; the host reconciles fibers outside any request, and any later tool-list change is priced by the host package.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Validation is mirrored, not authoritative** — the form's client-side checks give immediate feedback, but the host's `validate` owns acceptance; a definition that passes the browser can still be rejected at save with a code like `mcpManager/duplicate-name`.
- **Host presence is required** — the section only drives the `mcpManager` remote; without the host package the initial list fails and the page shows its load-failure alert, with no local fallback.
- **The form exposes exactly the stored definition** — env and headers are KEY=VALUE / KEY: VALUE line pairs, and there is no auth surface beyond streamable-http's static headers.
- **The broker switch is a preference write, not a command** — it saves the volatile flag through the shared settings forms; a failed save surfaces an error and the displayed value stays where the mirror left it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.14). The web-app bundle's roster row mounts it; the `mcp` section id is pinned by `ui-settings-general`'s PRODUCT_SECTIONS spec (drift fixed 2.4.22). The self-mounted remote keeps `packages/api/remotes` untouched — fork discipline. Package version 0.2.2-alpha.2.

</details>
