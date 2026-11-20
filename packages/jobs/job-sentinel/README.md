---
description: "Background-job survivor notices: which started commands still run, reported on steps the agent takes anyway — never waking an idle session."
kind: "package-reference"
---

# @deepseek-ai/dsh-job-sentinel

## Summary

Tells the model which of its background jobs are still running. When the agent takes its next step and one of the session's jobs has been alive past `minAgeMs`, the plugin appends one compact report — producer kind, command, pid, runtime, job id — so a launcher that moved on without waiting hears about the survivor instead of assuming everything closed. Reports ride steps the agent takes anyway; an idle session stays idle, and `job_kill` remains the stop verb.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it beside `dsh-tool-jobs` so long-lived commands surface on their owner's next step instead of disappearing when the tool result returns.

### When to choose it

Choose it for any composition where the model starts servers, watchers, or long builds through `job_start` and may forget them. Without it, settlement notices are the only signal, and a model that never polls `job_list` never learns the job outlived its turn. Skip it only when every background command is short-lived or always awaited.

### Minimal configuration

The plugin mounts beside the job registry; no `cordis.yml` row is needed beyond the mount itself:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch; `false` mounts nothing. |
| `minAgeMs` | `600000` | A job younger than ten minutes never triggers a report. |
| `minIntervalMs` | `1200000` | Minimum distance between two reports for one session. |

The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The service subscribes to the job registry's event stream with `owners: 'all'` and tracks live jobs per owning session. On `agent/pre-step` — the seam where host-injected notices ride the step the agent is about to take anyway — it reports when at least one of the session's jobs has been running longer than `minAgeMs`, then re-reports at most every `minIntervalMs` per session. Each row carries the producer kind, the truncated command label, the OS pid when the producer published one, the humanized runtime, and the job id.

| Source | Owns |
|---|---|
| `src/index.ts` | Plugin face, config schema, default export. |
| `src/sentinel.ts` | Live-job tracking, the pre-step listener, and the report text. |
| `tests/sentinel.spec.ts` | Cadence, survivor selection, and notice-shape pins. |

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Survivor reports

#### What the model sees

One compact notice line per still-running job on a step the agent takes anyway: kind, command, pid, runtime, job id. The report is appended as a system message; nothing else in the request changes.

#### Token effect

One short line per survivor per report, re-issued at most every `minIntervalMs`; a session with no long jobs contributes nothing.

#### KV Cache effect

Notices land as new appended messages, so existing request prefixes stay stable; the report never rewrites or reorders prior context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Reports only ride steps the agent already takes: a session that never prompts again is never told about its survivors, by design.
- The pid appears only when the producer published one; executor backends that cannot observe it render the row without it.
- Cadence state is per session and in memory: restarting the harness resets the re-report clock without re-issuing an immediate notice.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork addition (FORK.md §1, 2.4.27). The `agent/pre-step` seam is shared with `packages/deliverables/change-report`; both listeners stay independent and neither wakes an idle session.

</details>
