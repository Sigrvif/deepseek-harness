# @deepseek-ai/dsh-client-ui-context-editor

fork(context-editor): the browser half — the Context tab next to Chat
(effective context with search/edit/exclude/restore/batch, the captured
request log, and the session tools & params forms), self-mounting the
`contextEditor` remote.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- The tab projects the host's durable surface; rows the engine's own compaction replaced appear as their checkpoints, not their originals.
- Long request-log histories page; the raw JSON view truncates very large payloads.
