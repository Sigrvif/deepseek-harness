---
description: "Stage tracking for the bundled workflow skills (fork): the durable workflow/stage log event with the /spec command and the SPEC.md Status fallback as approval gates, a per-stage discipline prompt section, stage-narrowed skill catalogs, and retirement of spec-stage skill invocations from the visible surface at the flip."
kind: "package-reference"
---

# @deepseek-ai/dsh-workflow-stage

## Summary

The bundled workflow skills are a pipeline — `brainstorming` owns the spec stage, the execution skills own the build — and small models follow it best when the context carries only the current stage. This plugin records the stage as a durable log fact (`workflow/stage`, last event wins), renders a per-stage discipline section in every armed request, lets `dsh-tool-skill` narrow the catalog and the `skill` tool to the stage, and retires spec-stage invocations from the visible surface at the approval flip — a one-line `skill-retired` tombstone replaces them, and the log keeps the originals.

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

The standard, cordis, and ptc presets mount it ahead of the skill plugins, so the shipped app needs no composition work; any other composition adds one `cordis.patch.yml` row beside `dsh-skill-filesystem` and `dsh-tool-skill`.

### When to choose it

Choose it wherever the bundled workflow skills are mounted and their pipeline should be enforced in context. The workflow arms only at the first visible invocation of a stage-tagged skill, so bootstrap-only sessions keep the full catalog and no section; skip the plugin (or a composition without it) when every skill should stay visible in every session — the stage is a log fact, so `dsh-tool-skill`, which reads the log, behaves identically without it.

### Minimal configuration

One preset row is the whole mount; the plugin carries no configuration. Approval gates: the `/spec` command (`approve`, the default, or `reopen`) and the SPEC.md convention the skills write — a `Status: approved` line upgrades an armed spec stage.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

A `workflow-stage` projection unit folds the log-only `workflow/stage` events; an `agent/pre-step` listener reconciles the folded stage with the world every step: a pending `/spec` selection commits, an unarmed session arms at the first visible stage-tagged invocation, an approved SPEC.md flips spec to execute, and execute retires still-visible spec-stage invocations. A `/spec` selection during an open turn stays pending until the next accepted in-turn pre-step (the plan-mode pattern); between turns it commits immediately and injects a one-sentence notice. Every sync failure is contained — the stage stays untouched and the turn proceeds.

| Source | Owns |
|---|---|
| `src/index.ts` | Event and source declarations, the projection unit, the runtime, the pre-step sync, the `/spec` command, and the `workflow:stage` section. |
| `tests/workflow-stage.spec.ts` | Arming gates, `/spec` outcomes and queueing, the SPEC.md fallback, retirement surface effects, section gating. |

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundled workflow skills](../superpowers-skills/README.md) — the stage-tagged bodies whose pipeline this tracks.
- [Session catalog and tool contract](../../../docs/subsystems/skills.md#workflow-stages) — how the catalog and `skill` tool narrow by stage.
- [Automatic workflow bootstrap](../superpowers-bootstrap/README.md) — the router injection that precedes any staged invocation.

-----

<a id="model-experience"></a>
## Model Experience

### Workflow stage section

#### What the model sees

While the workflow is armed, one short section in every system prompt names the stage and its discipline — spec: settle choices, write `SPEC.md` with `Status: draft`, no implementation before approval (`/spec approve`); execute: work the `todo_write` list, follow `test-driven-development` for behavior changes, verify before done claims, don't restart brainstorming.

#### Token effect

A few dozen tokens per request while armed; unarmed sessions (never invoked a staged skill) add nothing. The narrowing it drives saves far more: at spec the execution skills leave the catalog, and at the flip the brainstorming body (~a few hundred tokens) leaves the visible surface entirely.

#### KV Cache effect

The section sits in the system prompt, which every request reuses as prefix; it changes text only at a stage flip. The retirement tombstone appends once as a surface replace; decompression and search still read the shadowed original from the log.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Arming lags one step behind a user `/name` gesture into a staged skill — the gesture's injection lands inside the step, and the next pre-step arms.
- The SPEC.md fallback upgrades spec to execute only, and never after a `/spec reopen` (a logged spec following an execute is sticky), so a stray write cannot flap the stage.
- Retirement is one-way: a reopened spec stage re-shows `brainstorming` in the catalog, and a fresh invocation simply re-injects the body.
- There is no client surface yet — the stage is a session-log fact; a composer chip would read the projection unit's wire view.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.36). The stage tags ride skill frontmatter `metadata: { stage: … }` (the existing `metadata` passthrough in `dsh-skill-filesystem`; `dsh-skill`'s `SkillSummary` now carries it). `dsh-tool-skill` reads the stage from the session log, so custom compositions without this plugin are unaffected. The plugin publishes no service: preset scopes must not leak root-realm services, and the log is the coupling-free channel. The presets mount it ahead of the skill plugins so a flip narrows the same step's catalog. The system-prompt slot is the centrally allocated `WORKFLOW_STAGE` (2340) in `dsh-system-prompt`.

</details>
