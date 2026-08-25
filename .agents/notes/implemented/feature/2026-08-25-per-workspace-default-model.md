# Agent Note: Per-workspace default model

Status: implemented

English | [中文](2026-08-25-per-workspace-default-model.zh.md)

## Problem

The default model is one deployment-wide setting: the shared `agent-default-model` Settings section, read by `ctx.agentDefaultModel` and resolved per session as picked → logged `request/header` → shared default. A user who keeps several workspaces open for different projects had no way to say "this workspace starts new sessions on model X" without changing the default for every workspace. The only existing per-workspace surface, the sidebar row menu, stopped at rename and delete.

## Decision

Add a per-workspace override tier between the session's own logged selection and the shared default, set from the workspace row menu's new "Default model" dialog.

Storage follows the shared default's precedent: a second Settings section, `workspace-default-model`, keyed by workspace id, holding the same `{provider, model, reasoningEffort?}` shape. `AgentDefaultModelConfig` gains `workspaceSelection(workspaceId)` and `saveWorkspaceSelection(workspaceId, selection|null)`; the latter writes through the settings seam's path ops (`set` on the workspace key, `unset` to clear) so a saved entry fully replaces the stored one, including clearing a stale effort. The workspace id is the durable registry `randomUUID` (`dsh-workspace`), which survives restarts; the service brands it locally (`Branded<'WorkspaceId'>` from `dsh-brand`) so the settings seam gains no workspace-package dependency.

Resolution folds the new tier into the existing every-read precedence in `selectionFor` (`packages/host/apiproxy`): a session with a logged route keeps deriving from its log; a blank session in an overridden workspace reads the override; everything else falls to the shared default. `saveDefaultFor` routes a composer switch (`session.selectModel`) to the workspace override when the session's workspace carries one, and to the shared default otherwise — a workspace default therefore tracks what the user picks in that workspace, and a workspace without one keeps the old global behavior exactly. Deleting a workspace clears its override with the record (best-effort; a stale entry is unreachable garbage, a failed delete is not).

The wire surface is a workspace-domain pair mirroring `session.models`/`session.selectModel`: `workspace.defaultModel` serves the override (`null` = inherits shared), the shared default, and the advisory catalog; `workspace.setDefaultModel` route-validates a non-null selection (`model-unavailable` when no adapter serves it) and stores or clears it. The browser dialog (ui-workspace) renders the catalog as a radio list with a "use global default" row, and commits only on Save.

## Consequences

The gateway gains the `workspace.defaultModel` / `workspace.setDefaultModel` RPC pair, the settings document gains a `workspace-default-model:` section keyed by workspace id, and the composer's model seat keeps saving the shared default only for sessions whose workspace carries no override. `agent-default-model`'s service API and READMEs, the apiproxy READMEs, and the browser workspace-menu copy (zh/en) document the new surface. This note extends — and partially supersedes — [the default model follows the picker](2026-08-07-default-model-follows-the-picker.md), which owns the shared-default persistence this tier builds on; both stay active and cross-linked.

## Alternatives considered

**Store the override on the workspace record** (a `defaultModel?` field in the `workspaceRecord` schema). Rejected: it couples a model-selection policy to the workspace domain, forces a domain-version bump, and splits the two defaults across storage families — the settings seam already owns the shared default, the client's `settings/document-updated` refresh, and the redaction/`revision` machinery. Lifecycle came along for free instead: the delete-path cleanup is one best-effort call.

**A separate `workspace-default-model` service package.** Rejected: the selection policy is one concern with one owner; a second package would duplicate the section-registration wiring and the `reasoningEffort`-vs-config reasoning documented in `agent-default-model`'s README.

**Composer switches always write the shared default.** Rejected: the workspace default would silently stop meaning "what this workspace starts from" the moment the user switched models there. Routing the switch to the workspace override only when one is set keeps the override sticky while preserving today's global behavior everywhere else.

**No "use global default" clear path.** Rejected: without a clear, a set override could only be changed, never removed, and the fallback tier would be unreachable once a workspace had been customized.

## Testing

Service tests pin save/read/clear per workspace, independence from the shared section, effort replacement, and the no-settings-provider no-op. Gateway tests cover the two RPCs (catalog + shared default + override read, validated set, clear, `model-unavailable`, `workspace-not-found`, delete cleanup) and the resolution tier through `session.models` (override wins for a blank session, shared for ungrouped and non-overridden sessions, logged route wins over an override) plus the `selectModel` routing to workspace vs shared. Browser component tests cover the dialog's preselect-global, pick-and-save, clear, cancel, load-failure retry, and save-failure retention. The keyless `workspace-default-model` web e2e drives the real dialog over the real wire and asserts the settings document and `session.models` outcome, following the `default-model` e2e's zero-model-call, no-golden precedent.
