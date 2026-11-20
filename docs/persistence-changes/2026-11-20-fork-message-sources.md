---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-20-fork-message-sources

English | [中文](2026-11-20-fork-message-sources.zh.md)

## Summary

DSLRH's fork plugins append model-visible messages with three new source kinds. The message-source unions in agent/inbox/spliced, developer/message, user/message, and session/title-llm-request gain the 'context-fold', 'job-sentinel', and 'change-report' variants, and compaction/summary gains the optional origin, foldedTokens, and summaryTokens fields that mark model-driven folds.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-20-fork-message-sources
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "2a3fcdc1d455cb0d8c372f2f063a42bea70b58ca5bb7dbbf8ca0df85db556ef6"
    decision: same-version
  - root: "event:compaction/summary"
    previous: "2026-09-16-session-format-v4"
    after: "572734cc1f01aea2ef3f9988220350aeb09b3251eebff322c79a45c686748b83"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "acc934ba67e70a2596470fd86a14effd4f03c7a2d72538e80e4a158781249a0e"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "899fd11ff3e5316d8dc637524b7f1ba3ddf30c2cdaa30526109b0fe6e97317a1"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "1f9481457b4ffa6269e418da4e7b3cbcbae70c4f518851ae69b2361b3176ed7c"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

All additions are optional or new union variants under the same Session format version. Existing readers match message sources by discriminant and ignore unknown kinds; they keep reading every persisted log unchanged. New readers write the same required fields as before, so older builds accept fork-written logs. No discriminator, required field, or format version changes.

<a id="verification"></a>
## Verification

The regenerated persistence catalog matches the current tree; verify-persistence-changes passes with this record. The fork's package suites (context-fold, job-sentinel, change-report) pass, and live-session E2E on the released bundles replays and resumes logs written with the new sources.

<a id="dev-note"></a>
## Dev Note

None.
