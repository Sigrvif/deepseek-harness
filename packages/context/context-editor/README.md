# @deepseek-ai/dsh-context-editor

fork(context-editor): the native Context Editor host plugin — request
capture (`llm/stream`), context projection, surface edits/exclusions/
restores, selective condensation over the compaction protocol, session
tools & generation-parameter overrides, the `contextEditor` Typert remote,
and the `context_editor` storage domain. See FORK.md and the docs/
superpowers spec for the design.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- Out-of-process subagent backends bypass the `llm/stream` capture by construction; they are not shipped in the offline bundles.
- Tools/params overrides apply to agent-loop requests only and are not inherited by session forks.
- Re-installing the third-party "Agent Context Editor" plugin alongside this feature is unsupported.
