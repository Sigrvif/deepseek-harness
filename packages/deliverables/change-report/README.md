# @deepseek-ai/dsh-change-report

**On by default, toggleable on the General settings page.** Each turn's
files-changed summary — recorded by `@deepseek-ai/dsh-workspace-changes` and
shown in the Web UI as the ChangedFiles card — is also reported to the model
itself: when the session is about to step anyway, one compact notice joins the
step's messages.

## What the model sees

```
Change report for turn 4 of this session's workspace:
- src/index.ts (+12/-3)
- notes/local.env (detected)
Total: 2 files changed, +12/-3 net.
```

`detected` marks a path the turn's watcher saw written where no earlier copy
exists to compare (an ignored path, or a working directory outside any
repository). Files fold into one remainder line past 20.

## Mechanics

- The plugin holds the latest `workspace/changes` announcement per session as
  pending, and injects the report on `agent/pre-step` — the job-sentinel seam:
  it never wakes an idle session, and each announcement is reported exactly
  once, at the session's next step.
- The volatile `enabled` toggle (default on) is read per fire: flipping it on
  the General settings page takes effect on the next step without remounting.
  Turn it off for small models that the extra context would only confuse.
- English by design — the notice is model-facing context, not user-facing copy.

Surfaced by `@deepseek-ai/dsh-client-ui-fork-change-report` (Settings →
General → Change reports).
