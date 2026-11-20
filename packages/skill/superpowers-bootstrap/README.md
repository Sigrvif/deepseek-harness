---
description: "Automatic superpowers bootstrap: once per session, injects the bundled using-superpowers skill as a native skill-invocation message on the first prompt with no visible invocation; the volatile autoUsingSuperpowers toggle (default on) lives on the General settings page."
kind: "package-reference"
---

# @deepseek-ai/dsh-superpowers-bootstrap

## Summary

Every session starts with the `using-superpowers` discipline already loaded. On the first fresh prompt that shows no skill invocation, the plugin appends the bundled skill as a native `skill-invocation` user message — exactly what typing `/using-superpowers` would produce — and follow-up prompts never re-send it. If the engine's own compaction later drops the invocation out of the visible surface, the next prompt re-asserts it once; a Context Editor exclusion counts as deliberate and is never overridden. The volatile `autoUsingSuperpowers` toggle (default on) on the General settings page turns the behavior off for users who invoke skills manually.

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

The Web bundle's `cordis.patch.yml` mounts it as a host row beside the bundled skills, so the shipped app needs no composition work; any other composition adds one `cordis.yml` row.

### When to choose it

Choose it wherever the superpowers skills are mounted and sessions should get the discipline without users remembering `/using-superpowers`. Without it, the skills reach a session only when the user invokes them or the model acts on the catalog unprompted. Skip it — or flip `autoUsingSuperpowers` to `false` — when sessions should stay bare unless invoked; with the skill absent from the registry the bootstrap stays silent by design.

### Minimal configuration

One host row is the whole mount; the plugin carries a single volatile field:

| Field | Default | Meaning |
|---|---|---|
| `autoUsingSuperpowers` | `true` | Volatile; inject `using-superpowers` on the first fresh prompt of every session. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-superpowers-bootstrap) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

A single `agent/pre-step` listener makes the whole decision per fire. It passes only when a fresh user prompt begins the step, the prompt carries no explicit `/using-superpowers` gesture, the volatile toggle is on, and the session log shows no `using-superpowers` invocation still visible — an invocation that compaction summarized away re-asserts, while a Context Editor shadow counts as deliberate. The resolved skill is rendered through the shared `<skill_content>` envelope and appended as a user message; a missing, unreadable, or non-user-invocable skill stays silent so the bootstrap never fails a turn that would have worked without it. Because the gate is a volatile reference read per fire, a flip takes effect on the next prompt without remounting.

| Source | Owns |
|---|---|
| `src/index.ts` | Plugin face, config schema, the gesture scan, the visible-surface check, and the pre-step listener. |
| `tests/bootstrap.spec.ts` | Fire/suppress/re-assert cadence, gesture edge cases, and silence pins. |

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundled superpowers skills](../superpowers-skills/README.md) — the skill bodies this bootstrap injects.
- [Auto Superpowers switch](../../client/ui-fork-auto-skills/README.md) — the General settings row over `autoUsingSuperpowers`.
- [Skill discovery and precedence](../skill-filesystem/README.md) — which copy of `using-superpowers` the injection resolves.

-----

<a id="model-experience"></a>
## Model Experience

### Bootstrap invocation

#### What the model sees

A single user message whose text is the full `using-superpowers` skill body wrapped in a `<skill_content name="using-superpowers">` envelope and sourced as a native `skill-invocation`, appended to the first fresh prompt that shows no visible invocation — the same shape a `skill` read produces, so the model cannot tell it from a user-typed `/using-superpowers`.

#### Token effect

The injected message is the skill body plus a small envelope — a few hundred tokens, once per session. Follow-up prompts add nothing, and the only possible repeat is the single re-assertion after compaction drops the invocation from the visible surface.

#### KV Cache effect

The message appends once and then sits in the prefix every later request reuses; the re-assertion is another append, and the plugin never rewrites or reorders existing context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The plugin only decides whether the bootstrap fires: without a mounted skill root that serves `using-superpowers`, every turn stays silent instead of failing.
- It fires on fresh user prompts only; continuation steps that claim just tool results never trigger a bootstrap.
- Re-assertion covers compaction alone — a Context Editor exclusion or replacement of the invocation wins permanently and is never re-asserted.
- Injection resolves the name `using-superpowers` through normal precedence, so a user copy at a higher-ranked root replaces the bundled text wholesale.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1). The skill bodies live in `@deepseek-ai/dsh-superpowers-skills` (derived from superpowers 7.0.1 by Jesse Vincent, MIT — attribution in that package's README and `LICENSE`); this plugin only decides whether the bootstrap fires. The General-page switch is `@deepseek-ai/dsh-client-ui-fork-auto-skills`; the plugin suppresses its auto-generated settings page (`settings.configure({ auto: false })`, the ui-settings developer-tools pattern) so that row is the preference's only surface.

</details>
