---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-22-workflow-stage

English | [中文](2026-11-22-workflow-stage.zh.md)

## Summary

The fork's workflow-stage plugin adds two message source kinds and one log-only event. The user/message, developer/message, agent/inbox/spliced, and session/title-llm-request source unions gain 'skill-retired' (the tombstone that replaces a retired spec-stage skill invocation) and 'workflow-stage' (the stage-transition notice); the log-only 'workflow/stage' event records the session's stage, whole-value replace, last event wins.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-22-workflow-stage
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-20-fork-message-sources"
    after: "685f6c3d914721419388134d20f31e868e1a1bf83d15d5af0b296c91586c7010"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-20-fork-message-sources"
    after: "1f9140f2bfb67951874ad1d6bbf42f64011b70e672fda5e6362c1c5d3d3aba0e"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-20-fork-message-sources"
    after: "4aac5a98ef633e30f51abc980063ebda26975c1a858959c6c86c856514e23634"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-20-fork-message-sources"
    after: "79e0b73d8384cc327359d93ae3b7bed540c51021b3abcc513e2672371803811d"
    decision: same-version
  - root: "event:workflow/stage"
    previous: null
    after: "81f76d84bbcf339259009143215b568fa32e654c421fd0e72ef4f3b763cfaade"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Every addition is an optional union variant or a new event under the same Session format version. Existing readers match message sources by their discriminant and ignore unknown kinds, so every persisted log remains readable without loss; new-required fields did not change, so older builds accept logs the fork writes. Event discriminants, required fields, and the format version are unchanged.

<a id="verification"></a>
## Verification

The regenerated persistence catalog matches current source; verify-persistence-changes passes with this record. The workflow-stage package's suite (arming, /spec gating, SPEC.md fallback, retirement surface replaces) and the tool-skill stage-narrowing suite pass, and real-session E2E on the release tree replays logs carrying the new source kinds and event.

<a id="dev-note"></a>
## Dev Note

None.
