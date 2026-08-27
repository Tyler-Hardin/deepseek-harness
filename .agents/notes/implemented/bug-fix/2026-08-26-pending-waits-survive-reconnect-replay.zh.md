# Agent Note: 待处理等待在重连重放后仍存活

Status: implemented

[English](2026-08-26-pending-waits-survive-reconnect-replay.md) | 中文

## Problem

Web 客户端的 `Session` 将待处理交互等待（提问与审批）保存在 `pending` 映射中，而该映射唯一被清空的位置是 `resync()`。连接代际变更时，mux-open 重放会在 `onConnected` 触发*之前*重新发送仍待处理的 `question/requested` 与 `approval/requested` 帧——流打开先于就绪握手——而 `onConnected` 正是触发 `resync()` 的一方。于是 `resync()` 在重放已经重新铸造了全新等待*之后*才清空映射，此后也再没有任何东西重新发送该帧。

可见结果是：只要在智能体被提问（或审批）阻塞期间发生一次重连，编辑器接管界面就会消失，尽管宿主仍在等待回答。侧边栏与记录里显示为「等待中」，轮次仍在运行，却已没有任何可作答的表面——用户无法在一个早已消失的对话框里输入回答。

## Decision

在代际消亡时（而非在 resync 时）清扫待处理等待。新增的 `Session.handleDisconnected()` 清空 `pending` 映射并递增 pending 修订号，`SessionManager.handleDisconnected()` 会在任何下一代帧到达之前对每个已实例化的会话调用它。`resync()` 不再触碰 `pending`；它只重建窗口并重新执行 open。

随后 mux-open 重放会以仍存活的 rpcId 重新铸造仍待处理的 requested 帧，等待因此能安然通过 `handleConnected()`/`resync()`。断线期间被解决的等待不会发送任何帧，因此在重放之前清空恰好能丢弃它——新的重放只会重新添加仍待处理的那部分。

这与管理器对自身 `pendingInteractions` 状态映射的既有处理（在 `handleDisconnected` 清空、由重放重新添加）以及丢弃已消亡代际 `requested` 帧的 `pendingBuffers` 过滤器保持一致。

## Alternatives considered

**保留在 resync 时清空，并把重放调整到它之后。** 否决：重放由宿主在流打开时驱动，按设计先于 `onConnected`，且客户端没有任何可持久化的来源重新拉取它。

**在 resync 之后从其它来源重新推导待处理等待。** 否决：可作答请求从不进入历史记录，因此没有可持久化的来源重建 `pending` 映射。

**从不清空 pending 映射。** 否决：客户端断线期间被解决的等待不会发送任何帧，陈旧条目将永远残留——这正是清扫存在的理由。

## Consequences

提问与审批编辑器在重连后仍存活并可作答。重连期间接管界面会短暂消失（代际消亡清扫），并在重放重新铸造时返回——这与审批在列表状态层面早已存在的闪烁一致。由于 `resync()` 不再清空 pending，地址变更触发的 resync（`configureSubagent`，没有 mux-open 重放）也不再丢弃一个它永远无法重新添加的待处理等待。

## Verification

`session.client.spec.ts` 的 resync 测试现在断言 pending 在 resync 后仍存活，并新增了「代际消亡清扫 → 重放 → resync」用例；完整的 `packages/client/runtime` 测试套件（350 个测试）以及提问/审批 UI 测试套件均通过。
