---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-22-workflow-stage

[English](2026-11-22-workflow-stage.md) | 中文

## 概述

分支的 workflow-stage 插件新增两个消息来源种类与一个仅记录事件。user/message、developer/message、agent/inbox/spliced 与 session/title-llm-request 的消息来源联合新增 'skill-retired'（替换已退役规格阶段技能调用的墓碑）与 'workflow-stage'（阶段切换通知）变体；仅记录的 'workflow/stage' 事件记载会话阶段，整体替换、末值生效。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

全部新增均为同一 Session 格式版本下的可选联合变体或新事件。既有读取方按判别值匹配消息来源并忽略未知种类，可继续无损读取全部已持久化日志；必填字段未变，旧版本构建也能接受分支写入的日志。事件判别值、必填字段与格式版本均未改变。

<a id="verification"></a>
## 验证

重新生成的持久化目录与当前源码一致；携带本记录后 verify-persistence-changes 通过。workflow-stage 包的测试（武装、/spec 门控、SPEC.md 回退、退役表面替换）与 tool-skill 阶段收窄测试通过，且在发布包上的真实会话 E2E 可重放带新来源种类与事件的日志。

<a id="dev-note"></a>
## 开发备注

无。
