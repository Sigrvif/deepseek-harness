# @deepseek-ai/dsh-superpowers-skills

Bundled **superpowers** workflow skills for dsh's skill catalog.

This package ships no code: its `skills/` directory is a skill root. The
launchers export `DSH_BUNDLED_SKILL_DIR` pointing at it, and the preset-mounted
`skill-filesystem` provider discovers it as the `bundled` source (rank 600 —
project `.dsh/skills`, custom roots, and user skill homes all outrank it, so a
user can shadow any bundled skill with their own copy of the same name).

## Provenance

fork(superpowers): vendored from
[superpowers 7.0.1](https://github.com/obra/superpowers) — skills and runtime
bootstrap for coding agents by Jesse Vincent — MIT license (see `LICENSE`; the
license text is preserved verbatim beside the skills it covers).

Local adaptations, kept minimal and marked:

- `skills/using-superpowers/SKILL.md` — the Platform Adaptation list gains one
  entry (`DSH: references/dsh-tools.md`) so the bootstrap names dsh's own tools.
- `skills/using-superpowers/references/dsh-tools.md` — new file: maps the
  actions the skills request onto dsh's `skill`, `subagent`, `todo_write`, and
  plan-mode surfaces.

Everything else is verbatim upstream.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The skills are vendored verbatim from superpowers 7.0.1; a re-vendor must re-apply the two marked adaptations (Platform Adaptation line, `references/dsh-tools.md`) and bump `UPSTREAM_VERSION`.
- Skill frontmatter must keep the dsh parser's contract (`name` kebab-case + non-empty `description`); upstream format drift lands as skipped skills, logged by `skill-filesystem`.
