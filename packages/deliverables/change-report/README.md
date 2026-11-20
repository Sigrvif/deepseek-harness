---
description: "Per-turn files-changed notices for the model: one compact report of what the last turn changed, appended at the session's next step without ever waking an idle session."
kind: "package-reference"
---

# @deepseek-ai/dsh-change-report

## Summary

Tells the model what its previous turn changed in the workspace. Each turn's files-changed summary — recorded by `@deepseek-ai/dsh-workspace-changes` and shown in the Web UI as the ChangedFiles card — is also appended for the model: one compact notice (files with line counts, detected/binary/oversized markers, net totals) joins the messages of the session's next step, and an idle session is never woken. On by default; a General-settings switch turns it off for small models that the extra context would only confuse.

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

Mount it beside `@deepseek-ai/dsh-workspace-changes` (the shipped web-app bundle does) so the model, not just the Web UI, learns what each turn touched.

### When to choose it

Choose it whenever the model should know what it just wrote: without it, only the Web UI reads the recorder's announcement, so an agent that edits files across turns never hears about its own changes. Skip it for sessions on small models that the extra context would only confuse; the volatile toggle makes that a settings-page flip, effective on the next step. It complements `@deepseek-ai/dsh-job-sentinel`, which reports on the same seam about background jobs rather than file changes.

### Minimal configuration

The smallest mount is one plugin row; the toggle lives on the General settings page, not in config:

```yaml
- name: '@deepseek-ai/dsh-change-report'
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Volatile master switch, read per fire; surfaced as the Change reports row on the General settings page. Flipping takes effect on the next step without remounting. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-change-report) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin subscribes to `workspace/changes` session events and holds the latest unreported announcement per session as pending — the summary itself is fetched lazily at step time, because the recorder stores it only after the event listeners run. On `agent/pre-step` — the job-sentinel seam — it appends one notice as a user-role message with source kind `change-report`, then clears the pending entry, so each announcement reports exactly once and only the latest announcement survives a multi-turn gap. `session/disposed` drops pending state, and a summary the recorder no longer serves (or one with zero files) reports nothing. The notice text is English by design — model-facing context, not user-facing copy.

| Source | Owns |
|---|---|
| `src/index.ts` | Plugin face, the volatile `enabled` schema, pending tracking, and the pre-step listener. |
| `src/report.ts` | The notice text, the 20-file fold, and the notice message. |
| `tests/report.spec.ts` | Notice shape, once-only reporting, latest-wins, and toggle behavior. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@deepseek-ai/dsh-workspace-changes`](../workspace-changes/README.md) — the recorder whose per-turn summaries this package reports.
- [`@deepseek-ai/dsh-job-sentinel`](../../jobs/job-sentinel/README.md) — the other `agent/pre-step` seam consumer.
- [`@deepseek-ai/dsh-client-ui-fork-change-report`](../../client/ui-fork-change-report/README.md) — the General-settings switch row.

-----

<a id="model-experience"></a>
## Model Experience

### Per-turn change reports

#### What the model sees

One compact notice on the session's next step after a turn changed files: a header naming the turn (`Change report for turn 4 of this session's workspace:`), one line per file (`- src/index.ts (+12/-3)`; a path with no earlier copy to compare — an ignored path, or a working directory outside any repository — carries a `detected` marker instead of counts, as do `binary` and `oversized` files), a `… and N more.` remainder past 20 files, and a net total line (`Total: 2 files changed, +12/-3 net.`).

#### Token effect

One short block per reported turn — the header, at most 20 file lines, an optional remainder line, and the total; turns with no changed files contribute nothing.

#### KV Cache effect

The notice is appended as a new message, so existing request prefixes stay stable; it never rewrites or reorders prior context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

Current constraints of the reporter as shipped:

- Reports ride steps the agent already takes: a session that never prompts again is never told about its changed files, by design.
- Only the latest announcement per session is pending: if several turns pass without a step, the intermediate turns' summaries are dropped and only the most recent is reported.
- Line counts come from the recorder's summary: `detected`, `binary`, and `oversized` paths carry no counts, and lists past 20 files fold into one remainder line.
- Pending state is in memory: a host restart loses an announcement that has not yet been reported.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.29; base deepseek-harness v0.2.2-alpha.2, package v0.2.2-alpha.2). The `agent/pre-step` seam is shared with `packages/jobs/job-sentinel`; both listeners stay independent and neither wakes an idle session. The `Config` schema on the default export is load-bearing: without it the loader mounts schema-less, the volatile toggle never binds, and the raw undefined config crashes the first pre-step after an announcement (found in the 2.4.29 browser pass). The General-settings row is `packages/client/ui-fork-change-report`.

</details>
