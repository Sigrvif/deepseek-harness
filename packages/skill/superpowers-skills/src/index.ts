/**
 * @deepseek-ai/dsh-superpowers-skills — bundled superpowers skills root.
 *
 * fork(superpowers): the actual payload is the `skills/` directory next to
 * this file — a skill root of superpowers 7.0.1 workflow skills vendored
 * verbatim (Jesse Vincent, MIT; see the package README and LICENSE). The
 * shipped launchers export `DSH_BUNDLED_SKILL_DIR` pointing at it, so the
 * preset-mounted skill-filesystem provider discovers it as the
 * lowest-precedence `bundled` source. This module exists so the package
 * conforms to the host build graph; it carries only provenance constants.
 *
 * @module @deepseek-ai/dsh-superpowers-skills
 */

/** Upstream release the skills were vendored from. */
export const UPSTREAM_VERSION = '7.0.1'

/** Upstream project the skills were vendored from. */
export const UPSTREAM_PROJECT = 'https://github.com/obra/superpowers'

/** Directory (relative to this package root) holding the skill entries. */
export const SKILLS_SUBDIR = 'skills'
