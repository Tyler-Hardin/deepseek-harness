# Agent Note: 按工作区默认模型

状态：已实现（implemented）

[English](2026-08-25-per-workspace-default-model.md) | 中文

## 问题

默认模型是一项部署级设置：共享的 `agent-default-model` Settings 分节，由 `ctx.agentDefaultModel` 读取，并逐会话按 已选择 → 已记录 `request/header` → 共享默认 解析。同时打开多个工作区、分别对应不同项目的用户，无法在不改动所有工作区默认值的前提下表达「该工作区的新会话从模型 X 开始」。侧边栏行菜单这个唯一的工作区级界面，之前只提供重命名与删除。

## 决策

在会话自身已记录选择与共享默认之间，增加一层按工作区覆盖，通过工作区行菜单新增的「默认模型」对话框设置。

存储沿用共享默认的先例：第二个 Settings 分节 `workspace-default-model`，以工作区 id 为键，承载同样的 `{provider, model, reasoningEffort?}` 结构。`AgentDefaultModelConfig` 新增 `workspaceSelection(workspaceId)` 与 `saveWorkspaceSelection(workspaceId, selection|null)`；后者通过 settings seam 的路径操作写入（对工作区键执行 `set`，清除则 `unset`），因此保存的条目会完整替换已存条目，包括清除过期的推理强度。工作区 id 是 `dsh-workspace` 中持久化的注册表 `randomUUID`，重启后依然稳定；服务在本地用 `dsh-brand` 的 `Branded<'WorkspaceId'>` 施加品牌标记，因此 settings seam 不会引入对 workspace 包的依赖。

解析把新层级并入 `selectionFor`（`packages/host/apiproxy`）既有的每次读取优先级：带已记录路由的会话继续从自身日志推导；覆盖工作区内的空白会话读取该覆盖；其余情况回落到共享默认。`saveDefaultFor` 在会话所在工作区带有覆盖时，把 composer 切换（`session.selectModel`）的保存指向该工作区覆盖，否则仍保存共享默认——因此工作区默认值会跟随用户在该工作区内的选择，而没有覆盖的工作区则完全保持旧的全局行为。删除工作区时，其覆盖随记录一并清除（尽力而为：残留条目只是不可达的垃圾，而删除失败不是）。

线上界面是一对工作区领域方法，镜像 `session.models`／`session.selectModel`：`workspace.defaultModel` 提供覆盖（`null` = 沿用共享默认）、共享默认与建议目录；`workspace.setDefaultModel` 对非空选择做路由校验（没有适配器服务该路由时返回 `model-unavailable`），然后保存或清除。浏览器对话框（ui-workspace）把目录渲染成带「使用全局默认」行的单选列表，仅在点击保存时提交。

## 影响

网关新增 `workspace.defaultModel`／`workspace.setDefaultModel` RPC 对，settings 文档新增以工作区 id 为键的 `workspace-default-model:` 分节，composer 的模型席位只对所在工作区无覆盖的会话继续保存共享默认。`agent-default-model` 的服务 API 与 README、apiproxy README 以及浏览器工作区菜单文案（中／英）都记录了新表面。本笔记扩展——并部分取代——[默认模型跟随选择器](2026-08-07-default-model-follows-the-picker.zh.md)，后者拥有本层级构建其上的共享默认持久化；两者均保持活跃并互相交叉引用。

## 备选方案

**把覆盖存到工作区记录上**（在 `workspaceRecord` schema 中增加 `defaultModel?` 字段）。否决：这会把模型选择策略耦合进工作区领域，需要域版本升级，并把两个默认值拆进不同的存储家族——settings seam 已经拥有共享默认、客户端的 `settings/document-updated` 刷新以及脱敏／`revision` 机制。生命周期反而因此免费获得：删除路径只需一次尽力而为的清理调用。

**单独的 `workspace-default-model` 服务包。** 否决：选择策略是同一关注点、同一属主；第二个包会重复分节注册接线以及 `agent-default-model` README 中记录的「推理强度与配置」推演。

**Composer 切换始终写共享默认。** 否决：工作区默认值会在用户于该工作区切换模型的瞬间静默失去「该工作区从哪个模型开始」的含义。只在已设置覆盖时把切换写入工作区覆盖，既让覆盖保持粘性，又在其余位置完全保留今天的全局行为。

**不提供「使用全局默认」的清除路径。** 否决：没有清除，已设置的覆盖只能被改、不能被移除，一旦工作区被定制过，回落层级就再也无法到达。

## 测试

服务测试覆盖每个工作区的保存／读取／清除、与共享分节的独立性、强度替换，以及无设置提供方时的 no-op。网关测试覆盖两个 RPC（目录＋共享默认＋覆盖读取、校验后的设置、清除、`model-unavailable`、`workspace-not-found`、删除清理）以及经 `session.models` 的解析层级（空白会话由覆盖获胜、未分组与无覆盖会话用共享默认、已记录路由压过覆盖），外加 `selectModel` 向工作区或共享默认的保存路由。浏览器组件测试覆盖对话框的默认选中全局、选择并保存、清除、取消、加载失败重试与保存失败保留。无密钥的 `workspace-default-model` Web e2e 用真实线上链路驱动真实对话框，并断言 settings 文档与 `session.models` 的结果，沿用 `default-model` e2e 的零模型调用、无 golden 先例。
