---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-20-fork-message-sources

[English](2026-11-20-fork-message-sources.md) | 中文

## 概述

DSLRH 的分支插件以三个新的消息来源种类追加模型可见消息。agent/inbox/spliced、developer/message、user/message 与 session/title-llm-request 的消息来源联合新增 'context-fold'、'job-sentinel'、'change-report' 变体；compaction/summary 新增可选的 origin、foldedTokens、summaryTokens 字段，用于标记模型驱动的折叠。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

全部新增均为同一 Session 格式版本下的可选项或新联合变体。既有读取方按判别值匹配消息来源并忽略未知种类，可继续无损读取全部已持久化日志。新读取方写入的必填字段与之前一致，旧版本构建也能接受分支写入的日志。事件判别值、必填字段与格式版本均未改变。

<a id="verification"></a>
## 验证

重新生成的持久化目录与当前源码一致；携带本记录后 verify-persistence-changes 通过。分支各包（context-fold、job-sentinel、change-report）的测试通过，且在发布包上的真实会话 E2E 可以重放并恢复带新来源种类的日志。

<a id="dev-note"></a>
## 开发备注

无。
