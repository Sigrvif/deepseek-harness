# @deepseek-ai/dsh-job-sentinel

**Fork addition** (not upstream). Periodic, non-waking notices telling the
model which of its background processes still run.

The job registry (`ctx.jobs`) already reports settlements into the owning
conversation (tool-jobs' completion notices), and the system prompt tells the
model to poll `job_output`/`job_list` — but a model that starts a long
command, moves on, and forgets, never hears about the survivor. This plugin
closes that loop:

- Listens to the registry's event stream (`owners: 'all'`) and tracks live
  jobs per owning session.
- On `agent/pre-step` — the seam where host-injected notices ride the step the
  agent is about to take anyway — it appends one compact report when at least
  one of the session's jobs has been running longer than `minAgeMs`. The
  report never opens a turn by itself: an idle session stays idle.
- The per-session cadence re-reports at most every `minIntervalMs`, so an
  intentionally long dev server costs one notice line per interval, not a
  per-step flood.

Each row carries the producer kind, the (truncated) command label, the OS pid
when the producer published one (bash/pwsh do since the pid-surfacing change),
the humanized runtime, and the job id — `job_kill` is the stop verb.

## Config

| key | default | meaning |
|---|---|---|
| `enabled` | `true` | master switch; `false` mounts nothing |
| `minAgeMs` | `600000` (10 min) | a job younger than this never triggers a report |
| `minIntervalMs` | `1200000` (20 min) | minimum distance between two reports per session |
