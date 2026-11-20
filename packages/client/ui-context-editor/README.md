---
description: "The browser half of the Context Editor: a per-session Context tab over the exact model-bound context with search, edit, exclude, restore, and batch actions, the captured request log, tools/params override forms, and the chat edit-and-resend face."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-context-editor

## Summary

Each session's conversation view gains a Context tab showing the effective next-request context row by row — role, text, token estimate, badges, and exclusion stubs that name their coverage. From there you can search, edit any message in place, exclude rows or the tail after one, batch-edit or batch-exclude a selection, restore originals, expand checkpoints, and fire a condensation; a Requests pane pages the captured log, and Tools/params forms store per-session overrides. The chat side gains edit-and-resend: a pencil turns a sent user bubble into an inline editor, and resending excludes the replaced tail. Everything rides the self-mounted `contextEditor` remote.

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

Mount it as a browser roster row in a Web composition that also mounts the host `@deepseek-ai/dsh-context-editor` package; the tab reads that package's `contextEditor` remote and has nothing to show without it.

### When to choose it

Choose it whenever the host Context Editor is mounted and a human should reach the surface: the shipped fork bundle wires both rows already, so end users only open the tab. Skip it for headless or non-web compositions, where the host package alone serves every remote caller.

### Minimal configuration

```yaml
- id: ui-context-editor
  name: '@deepseek-ai/dsh-client-ui-context-editor'
```

The package exposes no configuration fields; the browser half ships through the `./client` export discovered by the manifest's `dsh.client` declaration. The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field; this package contributes none.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The node half is an empty `apply` that exists so the roster row appears in the host Loader; the browser half ships via the `./client` export. On mount it installs the generated `contextEditor` remote client, registers its `zh`/`en` dictionaries, and docks the Context tab into every session's `conversation.view` list. A child-scope inject reads the mounted `remote.contextEditor` namespace — the namespace only exists after the mount settles, so declaring it on the plugin's own inject list would deadlock activation — and adapts the kebab-case wire methods to the view's promise API. The same pass replaces the chat's `user` and `steering` renderer entries (same keys, priority −10) with the edit-and-resend node view.

| Source | Owns |
|---|---|
| `src/index.ts` | Host-side roster plugin (empty `apply`). |
| `src/client/index.ts` | Browser plugin body: remote mount, locale, tab docking, chat renderer replacement. |
| `src/client/ContextView.tsx` | The Context pane (rows, search, batch bar, exclusion stubs), the Requests pane, and the Tools/params forms. |
| `src/client/chat-edit.tsx` | The edit-and-resend node view and its face. |
| `src/client/api.ts` | The promise-style API over the wire namespace. |
| `tests/` | Context-view and chat-edit browser pins. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [@deepseek-ai/dsh-context-editor](../../context/context-editor/README.md) — the host remote whose session-log edits own every model-visible effect this tab triggers.
- [Fork changes](../../../docs/dslrh/05-fork-changes.md) — the user-facing walkthrough of the Context tab and edit-and-resend.

-----

<a id="model-experience"></a>
## Model Experience

### Browser-side editing surface

#### What the model sees

Nothing arrives from this package itself: it registers no tool, no prompt section, and no request listener, and the browser never talks to a provider. Its buttons issue `contextEditor` remote calls; the host package appends the resulting session-log events, and those events own everything model-visible — an exclusion performed here removes those rows from the next request exactly as the host package documents. The chat-side renderer replacement changes what already-sent user bubbles look like in the browser, not what any model receives.

#### Token effect

Zero on its own — rendering, search, and the request log are browser-local. The edits it triggers change later requests only through the host: excluding a range stops paying its tokens, a condensation spends one summarization request, and a stored override reshapes the session's agent-loop requests until the record is changed.

#### KV Cache effect

None; this package neither assembles nor sends a provider request. Any prefix-cache consequence belongs to the host edit it triggered.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The tab projects the host's durable surface; rows the engine's own compaction replaced appear as their checkpoints, not their originals.
- Context rows clip long text at 400 characters in the pane; the full text is one edit away but never rendered inline.
- The Requests pane pages 30 entries at a time, and a failed load flips it to the degraded notice until the next successful fetch.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, the web client face). The replacement user/steering renderer entries required a marked upstream edit: ui-chat's own `user` registration drops its `user.before` seat declaration, because child declarations are globally unique per slot and the replacement entry now owns it. User-facing walkthroughs live in `docs/dslrh/05-fork-changes.md`.

</details>
