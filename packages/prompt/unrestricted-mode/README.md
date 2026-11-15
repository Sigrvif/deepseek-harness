# @deepseek-ai/dsh-unrestricted-mode

**Off by default.** A General-settings toggle that fuses the unrestricted
execution-mode contract — the full jailbreak block from
yexi-by/dsh-unrestricted v0.2.10 (ported verbatim; MIT — see
`THIRD_PARTY_NOTICES.md`), itself adapted from codex-keysmith's
`gpt-unrestricted.md` — into every assembled system prompt.

## What it does when enabled

- Extends `deployment:persona-prefix` in place with a pointer, and inserts the
  `unrestricted:execution-mode` section right behind the persona.
- Appends a delivery-not-content note to `plan:policy` while plan mode is
  active, a transport-not-content note to `tools:ptc-only` (inert in DSLRH —
  the PTC executor is disabled), and a shape-not-content note to
  `tool:structured_output` on structured subagents.
- Applies to the `standard`/`ptc`/`cordis` presets and their subagents. The
  `minimal` preset is immune by construction (its `complete: true` persona is
  restored after the waterfall).
- The volatile `enabled` toggle is read per assembly: flipping takes effect on
  the next request; with the toggle off the prompt is byte-identical to stock.

## What it costs

Roughly 1,900 additional tokens on every request while enabled. It is a
jailbreak prompt: its delivery clauses override refusal behavior, and its task
routing (keygens, reverse shells, detection bypass, weapons guides, piracy
lookups, NSFW age-defaulting) is the payload — not an accidental side effect.
Intended for uncensored local models whose operators have already made that
choice; everyone else should leave it off. The always-on style subset ships
separately as `@deepseek-ai/dsh-delivery-style`.
