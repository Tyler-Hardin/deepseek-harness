# Agent Note：按工作区设置的默认模型

Status: implemented

[English](2026-08-25-per-workspace-default-model.md) | 中文

## Problem

默认模型是整份部署共用的一个设置：共享的 `agent-default-model` 条目由 `ctx.agentDefaultModel` 读取，并按“本会话选定 → 已记录的 `request/header` → 共享默认”的顺序在每次读取时解析。同时打开多个工作区、分别服务不同项目的用户，无法表达“这个工作区的新会话从模型 X 开始”，除非把所有工作区的默认都一起改掉。而工作区唯一现成的入口——侧边栏行菜单——只到重命名和删除为止。

## Decision

在会话自身已记录的选定与共享默认之间加入一层按工作区的覆盖，通过工作区行菜单新增的“默认模型”对话框设置。

该覆盖与共享默认存放在同一个组合条目中：`agent-default-model` 的 `Config` 新增 `workspaceDefaults: Volatile<Record<string, StoredSelection>>`，以工作区 id 为键，保存同样形状的 `{provider, model, reasoningEffort?}` 选定。`AgentDefaultModelConfig` 新增 `workspaceSelection(workspaceId)` 与 `saveWorkspaceSelection(workspaceId, selection|null)`，两者都经由 `configEditor.edit(entry, …)` 写入，因此该 profile 自己的补丁文件承载整个条目（共享路由加上全部覆盖），Loader 会像处理其他配置编辑一样完成协调。`saveSelection` 在替换条目自身路由与推理档位时保留同级的 `workspaceDefaults`，因此切换共享默认不会丢掉任何工作区覆盖；省略 `reasoningEffort` 仍会清除先前的档位。工作区 id 是注册表中持久化的 `randomUUID`（`dsh-workspace`），重启后依然有效；该服务在本地为其建立品牌类型（来自 `dsh-brand` 的 `Branded<'WorkspaceId'>`），因此不必依赖工作区包。

解析把新的一层并入 `ApiSessionAgentController.selectionFor`（`packages/api/session-controller`）既有的每次读取优先级：已记录路由的会话继续从其日志派生；有覆盖的工作区中的空白会话读取该覆盖；其余回落到共享默认。归属工作区由 `sessionWorkspaceId` 得出——它在注册表中查找 `sessionIds` 含该会话的条目，未挂载工作区域时返回 undefined。`SessionCommandController` 把输入区的模型切换（`session.selectModel`）路由到工作区覆盖（当该会话所属工作区带有覆盖时），否则写入共享默认，因此工作区默认会跟随用户在该工作区里的选择，而没有覆盖的工作区完全保持原有的全局行为。在有覆盖的工作区中创建会话时会立即把覆盖记录进会话日志，因为客户端从会话的 `modelSelection` 投影读取模型；保存覆盖同样会把该工作区中所有仍然空白的会话指向它，使输入区显示下一轮实际将使用的模型。删除工作区会随记录一起清除其覆盖（尽力而为；残留条目不可达，清理失败则不构成问题）。

线上接口是一对工作区域方法，与 `session.models`/`session.selectModel` 对称：`workspace.defaultModel` 在返回共享默认与建议性目录的同时返回覆盖（`null` 表示继承共享）；`workspace.setDefaultModel` 通过 `llm.resolveCallConfig` 对非空选定做路由校验（没有适配器可服务时返回 `workspace/model-unavailable`），并保存或清除它。浏览器对话框（ui-workspace）把目录渲染为单选列表并提供“使用全局默认”一行，仅在保存时提交。

## Consequences

网关新增 `workspace.defaultModel` / `workspace.setDefaultModel` 这对 RPC，profile 补丁在 `agent-default-model` 条目内新增 `workspaceDefaults` 映射，而输入区的模型席位只对所属工作区没有覆盖的会话继续保存共享默认。未挂载 `agentDefaultModel` 服务的部署返回 `workspace/default-model-unavailable`；没有配置编辑器的部署保留其组合条目。本记录扩展并部分取代 [默认模型跟随选择器](../../archived/feature/2026-08-07-default-model-follows-the-picker.md)，共享默认的持久化由后者负责，本层建立在其之上。

## Alternatives considered

**把覆盖存在工作区记录上**（在 `workspaceRecord` schema 中加 `defaultModel?` 字段）。否决：这会把模型选择策略耦合进工作区域，强制提升域版本，并把两份默认拆到两个存储体系——而配置条目本就拥有共享默认与 `configEditor` 写入路径。改用当前方案后生命周期也顺带解决：删除路径的清理只是一次尽力而为的调用。

**单独的 `workspace-default-model` 服务包或设置分区。** 否决：把配置改为按 profile 的插件配置的那个版本已经移除了第二个分区，而选择策略是同一个关注点、同一个归属；再建一个包或条目只会重复写入路径，以及 `agent-default-model` README 中记录的 `reasoningEffort` 与配置之别。

**输入区切换始终写共享默认。** 否决：那样工作区默认在用户于该工作区切换模型的瞬间，就不再表示“这个工作区从这里开始”。仅在存在覆盖时把切换路由到工作区覆盖，既让覆盖保持粘性，又在其他所有地方维持今天的全局行为。

**不提供“使用全局默认”的清除路径。** 否决：没有清除，已设置的覆盖就只能改、不能删，一旦某个工作区被定制过，回退层就再也无法到达。

## Testing

服务测试固定了按工作区的保存/读取/清除、与共享选定的相互独立、档位替换、切换共享时不得丢失覆盖，以及没有配置编辑器时的空操作。网关测试覆盖这对 RPC（目录 + 共享默认 + 覆盖读取、经校验的设置、清除、`model-unavailable`、`workspace-not-found`、删除清理），并通过 `session.models` 覆盖解析层级（空白会话由覆盖胜出，未分组与无覆盖会话用共享默认，已记录路由胜过覆盖），以及 `selectModel` 在工作区与共享之间的路由。浏览器组件测试覆盖对话框的预选全局、选择并保存、清除、取消、加载失败重试、保存失败保留，以及保存进行中的锁定。无密钥的 `workspace-default-model` Web e2e 在真实线路上驱动真实对话框，断言 profile 补丁与会话解析出的路由，沿用 `default-model` e2e 的零模型调用、无 golden 的先例。
