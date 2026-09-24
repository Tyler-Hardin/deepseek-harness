# Agent Note: Per-workspace default model

Status: implemented

English | [中文](2026-08-25-per-workspace-default-model.zh.md)

## Problem

The default model is one deployment-wide setting: the shared `agent-default-model` entry, read by `ctx.agentDefaultModel` and resolved per Session as picked → logged `request/header` → shared default. A user who keeps several workspaces open for different projects had no way to say "this workspace starts new Sessions on model X" without changing the default for every workspace. The only existing per-workspace surface, the sidebar row menu, stopped at rename and delete.

## Decision

Add a per-workspace override tier between the Session's own logged selection and the shared default, set from the workspace row menu's "Default model" dialog.

The override lives in the same composition entry that owns the shared default: `agent-default-model`'s `Config` gains `workspaceDefaults: Volatile<Record<string, StoredSelection>>`, keyed by workspace id and holding the same `{provider, model, reasoningEffort?}` selection. `AgentDefaultModelConfig` gains `workspaceSelection(workspaceId)` and `saveWorkspaceSelection(workspaceId, selection|null)`; both write through `configEditor.edit(entry, …)`, so the profile's own patch carries the whole entry (shared route plus every override) and the Loader reconciles it like any other configuration edit. `saveSelection` keeps the sibling `workspaceDefaults` while replacing the entry's own route and effort, so switching the shared default never drops a workspace's override; an omitted `reasoningEffort` still clears the previous effort. The workspace id is the durable registry `randomUUID` (`dsh-workspace`), which survives restarts; the service brands it locally (`Branded<'WorkspaceId'>` from `dsh-brand`) so it gains no workspace-package dependency.

Resolution folds the new tier into the existing every-read precedence in `ApiSessionAgentController.selectionFor` (`packages/api/session-controller`): a Session with a logged route keeps deriving from its log; a blank Session in an overridden workspace reads the override; everything else falls to the shared default. The owning workspace comes from `sessionWorkspaceId`, which finds the registry entry whose `sessionIds` contain the Session and returns undefined when no Workspace domain is mounted. `SessionCommandController` routes a composer switch (`session.selectModel`) to the workspace override when the Session's workspace carries one, and to the shared default otherwise — a workspace default therefore tracks what the user picks in that workspace, while a workspace without one keeps the old global behavior exactly. Creating a Session in an overridden workspace records the override in the Session log immediately, because the Client reads a Session's model from its `modelSelection` projection; saving an override likewise points every still-blank Session in that workspace at it, so the composer shows what the next turn will use. Deleting a workspace clears its override with the record (best-effort; a stale entry is unreachable garbage, a failed cleanup is not).

The wire surface is a workspace-domain pair mirroring `session.models`/`session.selectModel`: `workspace.defaultModel` serves the override (`null` = inherits shared) beside the shared default and the advisory catalog; `workspace.setDefaultModel` route-validates a non-null selection through `llm.resolveCallConfig` (`workspace/model-unavailable` when no adapter serves it) and stores or clears it. The browser dialog (ui-workspace) renders the catalog as a radio list with a "use global default" row and commits only on Save.

## Consequences

The gateway gains the `workspace.defaultModel` / `workspace.setDefaultModel` RPC pair, the profile patch gains a `workspaceDefaults` map inside the `agent-default-model` entry, and the composer's model seat keeps saving the shared default only for Sessions whose workspace carries no override. A deployment that mounts no `agentDefaultModel` service answers `workspace/default-model-unavailable`, and one without a configuration editor keeps its composition entry. This note extends — and partially supersedes — [the default model follows the picker](../../archived/feature/2026-08-07-default-model-follows-the-picker.md), which owns the shared-default persistence this tier builds on.

## Alternatives considered

**Store the override on the workspace record** (a `defaultModel?` field in the `workspaceRecord` schema). Rejected: it couples a model-selection policy to the workspace domain, forces a domain-version bump, and splits the two defaults across storage families — the configuration entry already owns the shared default and the `configEditor` write path. Lifecycle came along for free instead: the delete-path cleanup is one best-effort call.

**A separate `workspace-default-model` service package or settings section.** Rejected: the release that made configuration per-profile plugin configuration removed the second section, and the selection policy is one concern with one owner; a second package or entry would duplicate the write path and the `reasoningEffort`-versus-config reasoning documented in `agent-default-model`'s README.

**Composer switches always write the shared default.** Rejected: the workspace default would silently stop meaning "what this workspace starts from" the moment the user switched models there. Routing the switch to the workspace override only when one is set keeps the override sticky while preserving today's global behavior everywhere else.

**No "use global default" clear path.** Rejected: without a clear, a set override could only be changed, never removed, and the fallback tier would be unreachable once a workspace had been customized.

## Testing

Service tests pin save/read/clear per workspace, independence from the shared selection, effort replacement, the shared switch that must not drop the overrides, and the no-configuration-editor no-op. Gateway tests cover the two RPCs (catalog + shared default + override read, validated set, clear, `model-unavailable`, `workspace-not-found`, delete cleanup) and the resolution tier through `session.models` (override wins for a blank Session, shared for ungrouped and non-overridden Sessions, logged route wins over an override) plus `selectModel` routing to workspace versus shared. Browser component tests cover the dialog's preselect-global, pick-and-save, clear, cancel, load-failure retry, save-failure retention, and in-flight lock. The keyless `workspace-default-model` web e2e drives the real dialog over the real wire and asserts the profile patch and the resolved Session route, following the `default-model` e2e's zero-model-call, no-golden precedent.
