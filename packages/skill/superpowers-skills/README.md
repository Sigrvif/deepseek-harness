# @deepseek-ai/dsh-superpowers-skills

Bundled **superpowers** workflow skills for dsh's skill catalog.

This package ships no code: its `skills/` directory is a skill root. The
launchers export `DSH_BUNDLED_SKILL_DIR` pointing at it, and the preset-mounted
`skill-filesystem` provider discovers it as the `bundled` source (rank 600 —
project `.dsh/skills`, custom roots, and user skill homes all outrank it, so a
user can shadow any bundled skill with their own copy of the same name).

## The set

fork(superpowers): six workflow skills tailored to DSLRH's audience — small
local models doing small projects, often without a repository, delivering
files directly:

| Skill | Role |
|---|---|
| `using-superpowers` | When to load skills (and when not to); dsh tool names |
| `brainstorming` | Clarify an open-ended request; settle the approach; write the short `SPEC.md` |
| `working-in-steps` | Spec → todo list → one verified step at a time; direct updates edit existing files |
| `systematic-debugging` | Read the error, reproduce, one change at a time, three strikes → rethink |
| `verification-before-completion` | Evidence before any "done/fixed/works" claim |
| `dispatching-parallel-agents` | Independent tasks → one focused `subagent` each |

The spec loop is deliberate: `SPEC.md` in the working folder is a short,
plain-language anchor (goal, approach, requirements, non-goals) that the
user can point at when the model drifts, that `working-in-steps` re-reads
before claiming done, and that survives across sessions for later updates.

## Provenance

Derived from [superpowers 7.0.1](https://github.com/obra/superpowers) —
skills and runtime bootstrap for coding agents by Jesse Vincent — MIT
license (see `LICENSE`, preserved verbatim beside the skills it covers).
Upstream's fifteen skills were rewritten for this audience rather than
vendored: bodies shortened to imperative rules a small model can hold,
cross-platform harness references replaced by dsh's own tools, and the
repo-centric workflows (git worktrees, branch/PR lifecycle, subagent
implementer/reviewer pipelines, skill-authoring meta-process) removed.
`using-superpowers`, `brainstorming`, `systematic-debugging`,
`verification-before-completion`, and `dispatching-parallel-agents` keep
their upstream names and intent; `working-in-steps` absorbs the kernels of
upstream's writing-plans/executing-plans/test-driven-development/
requesting-code-review. Users who want the full upstream set can drop it
into `$DSH_HOME/skills` or `~/.agents/skills`, which outrank this root.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The skills are a fork-local rewrite, not a verbatim vendor; `UPSTREAM_VERSION` in `src/index.ts` records the release they derive from. Pulling a newer upstream means re-evaluating the deltas, not overwriting.
- Skill frontmatter must keep the dsh parser's contract (`name` kebab-case + non-empty `description`); drift lands as skipped skills, logged by `skill-filesystem`. `tests/skills.spec.ts` enforces the contract over this directory.
