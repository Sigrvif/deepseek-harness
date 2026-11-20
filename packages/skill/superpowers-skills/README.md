---
description: "Six superpowers workflow skills — using-superpowers, brainstorming, working-in-steps, systematic-debugging, verification-before-completion, dispatching-parallel-agents — shipped as the bundled skill root through DSH_BUNDLED_SKILL_DIR (derived from superpowers 7.0.1, MIT)."
kind: "package-reference"
---

# @deepseek-ai/dsh-superpowers-skills

## Summary

Every session's skill catalog ships with six workflow skills built for small projects: check the catalog before acting (`using-superpowers`), clarify an open-ended request into a short `SPEC.md` (`brainstorming`), work one verified step at a time (`working-in-steps`), debug by reproducing before fixing (`systematic-debugging`), demand evidence before any done claim (`verification-before-completion`), and parallelize independent tasks through subagents (`dispatching-parallel-agents`). The package is data: its `skills/` directory is a skill root the shipped launchers expose through `DSH_BUNDLED_SKILL_DIR`, discovered as the lowest-precedence `bundled` source. The set derives from Jesse Vincent's superpowers 7.0.1 (MIT), rewritten for local models doing small projects, often without a repository.

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

The shipped launchers export `DSH_BUNDLED_SKILL_DIR` pointing at this package's `skills/` directory, and the preset-mounted `skill-filesystem` provider discovers it as the `bundled` source — nothing to mount and nothing to configure. The set:

| Skill | Role |
|---|---|
| `using-superpowers` | When to load skills (and when not to); dsh tool names. |
| `brainstorming` | Clarify an open-ended request, settle the approach, write the short `SPEC.md`. |
| `working-in-steps` | Spec → todo list → one verified step at a time; updates edit existing files. |
| `systematic-debugging` | Read the error, reproduce, one change at a time, three strikes → rethink. |
| `verification-before-completion` | Evidence before any "done/fixed/works" claim. |
| `dispatching-parallel-agents` | Independent tasks → one focused `subagent` each. |

The spec loop is deliberate: `SPEC.md` in the working folder is a short, plain-language anchor (goal, approach, requirements, non-goals) that the user can point at when the model drifts, that `working-in-steps` re-reads before claiming done, and that survives across sessions for later updates.

### When to choose it

Choose it for any composition that wants the superpowers discipline available out of the box — the Web bundle ships the skills this way. Skip it by not exporting `DSH_BUNDLED_SKILL_DIR`: the catalog then holds only project, custom-root, and user skills. Users who prefer upstream's full fifteen-skill set drop it into `$DSH_HOME/skills` or `~/.agents/skills`, which outrank this root and shadow every bundled copy by name.

### Minimal configuration

The package has no configuration: it ships data only, and `src/index.ts` carries just the attribution constants. Discovery rides the environment — `DSH_BUNDLED_SKILL_DIR` names the root, and the `bundled` source sits at rank 600, below every project, custom-root, and user skill home.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Each skill is one `SKILL.md` with dsh-contract frontmatter (kebab-case `name`, non-empty `description`), and the directory holds exactly six skills with no sidecar files (~280 lines total). The `skill-filesystem` provider parses the frontmatter with the dsh parser, publishes the set in the session catalog with descriptions truncated at 500 characters, and re-reads changed files so body edits land without a restart. `tests/skills.spec.ts` enforces the whole contract over this directory: the exact set, the parser and catalog limits, no references to dropped upstream skills, and the bootstrap-name pin shared with `superpowers-bootstrap`.

| Source | Owns |
|---|---|
| `skills/<name>/SKILL.md` | The six rewritten skill bodies and their frontmatter. |
| `src/index.ts` | Attribution constants only: upstream version, upstream project, and the `skills/` subdir name. |
| `tests/skills.spec.ts` | The directory set, parser/catalog contract, and cross-package name pins. |
| `LICENSE` | Upstream MIT license text, preserved verbatim beside the skills it covers. |

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill discovery and precedence](../skill-filesystem/README.md) — how `bundled` ranks against project and user roots.
- [Automatic bootstrap](../superpowers-bootstrap/README.md) — the plugin that injects `using-superpowers` once per session.
- [DSLRH documentation](../../../docs/dslrh/README.md) — the fork's user-facing record of the bundled set.

-----

<a id="model-experience"></a>
## Model Experience

### Bundled skill content

#### What the model sees

One catalog line per skill — its `name` plus the frontmatter `description` — in the session's `skill-catalog` message, and a full body whenever the model reads that skill through the `skill` tool; the automatic bootstrap additionally injects the `using-superpowers` body verbatim once per session.

#### Token effect

The catalog adds six short lines per session, and each `skill` read costs that skill's body alone — roughly 260–460 words; nothing else in this package reaches a request.

#### KV Cache effect

The catalog message publishes once and stays in the reused prefix, skill bodies ride appended tool results, and a shadowing copy changes only what a later read returns — never earlier context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The set is a fork-local rewrite, not a verbatim vendor: `UPSTREAM_VERSION` in `src/index.ts` records the release it derives from, and pulling a newer upstream means re-evaluating the deltas, not overwriting.
- Frontmatter must keep the dsh parser's contract (`name` kebab-case, non-empty `description` kept under the catalog's 500-character truncation); drift lands as a skipped skill logged by `skill-filesystem`, and `tests/skills.spec.ts` pins the exact directory set.
- The `bundled` rank is the lowest precedence, so a project or user copy shadows a bundled skill wholesale — by name, with no partial override.
- Skill bodies are English-only; the fork's localized surfaces stop at the UI.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.13 — before that, the fifteen upstream skills were vendored verbatim). Derived from superpowers 7.0.1 — skills and runtime bootstrap for coding agents by Jesse Vincent — MIT license; `LICENSE` is preserved verbatim beside the skills it covers. `using-superpowers`, `brainstorming`, `systematic-debugging`, `verification-before-completion`, and `dispatching-parallel-agents` keep their upstream names and intent; `working-in-steps` absorbs the kernels of upstream's writing-plans, executing-plans, test-driven-development, and requesting-code-review; the repo-centric upstream workflows (git worktrees, branch/PR lifecycle, subagent implementer/reviewer pipelines, the skill-authoring meta-process) are dropped. The `src/index.ts` docstring still calls the set "vendored verbatim"; the shipped bodies are the fork rewrite, so FORK.md §1 and this README own the description.

</details>
