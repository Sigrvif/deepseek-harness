# @deepseek-ai/dsh-context-fold

fork(context-fold): native Context Fold — model-driven, reversible
compression via the `compress`/`decompress`/`search_context`/`acp_status`
tools, a system-prompt section, and growth nudges. Folds land as
`origin: 'model-fold'` compaction checkpoints; all fold state derives from
the session log. Behavior adapted from billion-context (MIT + attribution
term — see `src/prompts.ts`, FORK.md, and the Fork additions tab).

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- Fold windows never cover the pinned prompt prefix, the first user message, or skill invocations; content below a mid-history invocation stays unfolded until the engine's own compaction passes over it.
- `decompress` reads fold originals through a configured character cap.
- The engine's own compaction is not fold-aware; a compaction checkpoint it writes is ordinary foldable content.
