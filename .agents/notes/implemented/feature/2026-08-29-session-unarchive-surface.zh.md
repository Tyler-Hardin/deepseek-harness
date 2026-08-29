# Agent Note: 会话取消归档界面

状态：已实现（implemented）

[English](2026-08-29-session-unarchive-surface.md) | 中文

## 问题

[会话归档](2026-07-31-session-archive-global-set.zh.md)会把会话从所有分组视图中隐藏，但配套的反向操作从未交付：没有 `unarchiveSession` 注册表方法，没有 `workspace.unarchiveSession` RPC，也没有任何 UI 入口——ui-workspace 的 Known Limitations 写着「已归档会话没有查看或取消归档入口」。归档数据模型刻意保留了 workspace 的 `sessionIds` 席位，使位置恢复零成本，但误归档的用户没有受支持的回头路。

## 决策

端到端交付对称的恢复界面。

- **注册表**（`dsh-workspace`）：`ctx.workspaceRegistry.unarchiveSession(id)` 通过与归档相同的 `enqueueOperation` 链从持久化的 `archivedSessionIds` 集合中移除该 id。每次调用都校验存在性（`sessionKnown`，与归档相同的实时或已持久化规则），因此无论集合中是否含有该 id，拼错的 id 都会大声失败；集合中不存在的 id 直接完成而不写入。
- **协议层**（`dsh-host-apiproxy`）：`workspace.unarchiveSession({sessionId}) → {archivedSessionIds}` 镜像归档方法对，未知会话复用 `session-not-found`。既有 `host/archived-sessions-changed` 帧无需改动即可覆盖取消归档：它由每次持久化全局写入后的集合比较触发，与触发方法无关。
- **客户端运行时**（`dsh-client-runtime`）：`IWorkspaces.unarchiveSession` → manager → service 与归档一样安装返回的完整集合。不需要投影清扫的对应规则，因为取消归档从不触碰 selection（归档时「清空当前项」的规则保持单向）。
- **UI**（`ui-workspace`）：分组树派生在 Ungrouped 之后追加一个**「已归档」**分区，按最新优先列出已归档的非空白、非 subagent 行。每行菜单只提供一项操作——**恢复会话**——在归档集合回声落地时提交，该行按保留的记账席位回到所属 workspace 分组（或 Ungrouped）。已归档行对点击保持惰性：打开它会被投影规则立即清空回 New Session 视图，因此该行不承载打开操作。分区首次出现时默认展开，其展开状态像其它分组一样持久化在浏览器视图 store 中。平铺列表与内容搜索继续排除已归档会话——该分区就是查看界面。

## 备选方案

**在普通会话行菜单上提供恢复操作。** 否决：已归档行被所有分组视图隐藏，没有可挂载操作的行。

**通过内容搜索呈现已归档会话。** 否决：搜索契约明确排除已归档会话（成员永不匹配），搜索结果行中的恢复入口会与点击打开冲突。

**在平铺模式下也渲染已归档分区。** v1 否决：该分区是一个分组，而平铺列表的契约是单一无层级顺序；分组视图是规范的恢复位置，平铺用户切换视图即可。

**取消归档不做存在性校验。** 否决：归档会拒绝未知 id，对称界面若对拼错 id 静默无操作，就只有一半路径会大声失败，并留下 UI 永远无法清理的死墓碑。

## 影响

workspace 协议面新增一个 RPC，运行时与注册表各新增一个方法；ui-workspace 的 Known Limitations 移除「没有取消归档控件」条目。错误词汇保持单向——与归档共用 `session-not-found`。已归档分区只在分组视图中出现，这让平铺列表与搜索契约原封不动，代价是平铺用户需要切换视图。本笔记扩展——而非取代——[会话归档全局集合决策](2026-07-31-session-archive-global-set.zh.md)，后者拥有集合的存储、协议与投影姿态；两者均保持活跃并互相交叉引用。

## 测试

注册表测试固定：持久化移除且记账不受影响、非成员幂等跳过（无写入、无变更事件）、带 `unarchive` 动词的未知 id 拒绝、实时会话恢复、以及归档后取消归档的重启持久化。网关测试覆盖一元应答、帧发射、列表基线、幂等重复与 `session-not-found`；schema 与 fetch-carrier 测试镜像归档方法对。客户端运行时测试覆盖一元回声、帧重装与失败保留。UI 组件测试覆盖树派生（分区成员、最新优先、空白／subagent 排除、为空时缺席）、已归档行的仅恢复菜单、以及浏览器流程（归档把行移入分区、恢复把它送回、失败仅作控制台诊断）。无密钥的 `workspace-management` web e2e 在其归档往返基础上扩展恢复往返：归档 → 行移入已归档分区 → 重载 → 恢复 → 行回到 Ungrouped → 重载。
