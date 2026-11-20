---
description: "User-managed MCP servers: storage-backed definitions mount as per-server client fibers, and broker mode collapses every server's tools into a search/describe/execute trio."
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-manager

## Summary

Lets a running harness gain and lose external MCP servers without restarts or profile edits: definitions persist in the `mcp_servers` storage domain, and each enabled one mounts as its own `dsh-mcp-client` fiber that edits reconcile individually. Broker mode swaps every server's raw `mcp__*` tools for the three indirection tools (search, describe, execute), so a few servers cannot flood each request with dozens of tool definitions. The `mcpManager` remote drives the browser's Settings → MCP Servers page. Manual profile rows keep working beside page-managed servers, with `serverName` uniqueness enforced in the scope both mount into.

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

Mount it in the web profile — the bundle patch row in `packages/bundle/web-app/cordis.patch.yml` does it — and manage servers from the Settings page instead of hand-edited profile rows.

### When to choose it

Choose it when servers should be added, edited, or retired live from the browser, or when the servers' combined tool catalogs are big enough to drown each request, which broker mode exists for. Skip it when a fixed, hand-maintained server set is acceptable: a plain `dsh-mcp-client` profile row per server (the upstream path, see [the model surface's MCP section](../../../docs/dslrh/02-model-surface.md#mcp-servers)) needs no manager, and the two configuration paths can be mixed.

### Minimal configuration

The bundle patch row is the whole mount; the config carries one volatile field:

| Field | Default | Meaning |
|---|---|---|
| `broker` | `true` | Volatile: the model sees the broker trio instead of every server's `mcp__*` tools. Read per assembled request, so the Settings page's toggle flips it live without remounting; the settings service persists the flip into this row's config like any volatile field. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-mcp-manager) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The service opens the `mcp_servers` domain (one `servers` table, JSON under `$DSH_HOME/storages/`) and hands the desired set to a serialized mount supervisor. The supervisor diffs against per-server mount fingerprints: new and changed definitions mount as their own `dsh-mcp-client` fibers, disabled and removed ones are disposed, and a failed mount is recorded as that server's `failed` state with its error — `failOnStartupError` is set on every mount, so cordis rolls the failed fiber back and no other server is blocked. Sync passes are queued, so two rapid edits can never race one disposal against another mount; restart forces a remount by invalidating one fingerprint. Broker mode registers the three indirection tools into the root tool registry and, on every `agent/pre-step`, re-shapes each session's request tool list through the context-edit override registry: broker on hides the servers' `mcp__*` tools, off hides the trio, and the hidden side stays fully executable because `mcp_execute_tool` resolves definitions in the untouched root view. The plugin also suppresses the auto-generated duplicate settings page for its `broker` field, the way `superpowers-bootstrap` does for its toggle; the MCP Servers page owns that preference's UI.

| Source | Owns |
|---|---|
| `src/index.ts` | Plugin face, broker wiring behind the volatile flag, default export. |
| `src/service.ts` | The `mcpManager` remote: list/upsert/remove/restart, validation, storage. |
| `src/supervisor.ts` | Serialized diffing mount supervisor, per-server failure containment. |
| `src/broker.ts` | The trio, lexical ranking, per-session deny masks. |
| `src/types.ts` | Definition schema, server-name pattern, mount fingerprint, mcp-client config translation. |
| `src/domain.ts` | The versioned `mcp_servers` storage domain. |
| `tests/` | Broker, supervisor, and service pins. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Model surface — MCP servers](../../../docs/dslrh/02-model-surface.md#mcp-servers) — both configuration paths and the broker flow as a request sees them.
- [@deepseek-ai/dsh-mcp-client](../mcp-client/README.md) — the transport, reconnect, and tool-bridging contract every mounted fiber carries.
- [@deepseek-ai/dsh-client-ui-settings-mcp](../../client/ui-settings-mcp/README.md) — the browser page that drives this remote.

-----

<a id="model-experience"></a>
## Model Experience

### Broker mode's three-tool view

#### What the model sees

Broker on: the request's tool list carries exactly `mcp_search_tools`, `mcp_describe_tool`, and `mcp_execute_tool`, and the servers' `mcp__<serverName>__<tool>` tools are hidden but stay executable through the trio. Broker off (or no server tools connected): the raw `mcp__*` tools appear directly and the trio is hidden instead.

#### Token effect

A genuine token lever: instead of one tool definition per server capability — the broker's own header cites 30+ entries for 2–3 servers — every request carries the trio's three fixed definitions, and a full argument schema is disclosed only when the model calls `mcp_describe_tool`; `mcp_search_tools` returns at most 8 ranked hits as plain text.

#### KV Cache effect

The per-session override re-registers only when the deny list actually differs, so the request's tool section stays byte-stable between flips and connect/disconnect events; each flip reshapes the tool section once, re-pricing the affected session's cached prefix from that step.

### Managed server fibers

#### What the model sees

Nothing about storage or fibers: enabled, connected servers contribute their tools under stable names, and a server that fails, restarts, or is disabled stops contributing while the others keep working. Each mounted fiber is a plain `dsh-mcp-client`, so server instructions and result rendering follow that package's contract, not this one's.

#### Token effect

Only what live servers contribute: tool definitions while visible, the client's literal instruction text, and ordinary tool results. The manager itself adds no notices, prompts, or status text to any request.

#### KV Cache effect

A mount, edit, restart, disable, or failure changes which tools the next assembled request carries from that point; untouched servers keep their contributions stable, and the fingerprint diff means a no-op edit remounts nothing and moves no request content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Broker hiding is all-or-nothing across servers** — the deny list is computed from the `mcp__` prefix alone, so broker mode covers every connected server at once with no per-server opt-out; with broker on but no server tools connected, the trio is hidden too, leaving no MCP tools visible.
- **Name uniqueness is enforced in two places at two times** — the manager rejects a duplicate `serverName` among managed definitions at save (`mcpManager/duplicate-name`), but a collision with a manual `dsh-mcp-client` profile row only surfaces at mount, where mcp-client fails the later server in the shared root scope.
- **Broker shaping fails open** — the per-session masks install on `agent/pre-step`; if shaping throws, the request proceeds with the unmasked direct tool list and the error is logged, never stalling the turn.
- **Search is deliberately lexical** — ranking matches query tokens against tool names (weight 3) and descriptions (weight 1) and returns the top 8; no semantic or embedding retrieval is implemented.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.14; broker mode 2.4.15). The bundle patch mounts the host row beside `superpowers-bootstrap` and the browser roster row `ui-settings-mcp`; the settings page package owns the broker toggle's UI. The default export must stay the plugin object — the loader unwraps `exports.default ?? exports`, and a bare service-class export would mount without `apply`, silently skipping the broker wiring (the 2.4.15 E2E caught exactly that). Package version 0.2.2-alpha.2.

</details>
