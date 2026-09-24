/** Workspace command implementation and stable Remote failure mapping. */

import type { Context } from '@deepseek-ai/cordis'
import type { ModelSelection as AgentModelSelection } from '@deepseek-ai/dsh-agent'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import {
  WorkspaceActiveSessionError,
  WorkspaceArchivedSessionPinError,
  WorkspaceId,
  WorkspaceMoveInvalidError,
  WorkspaceOrderInvalidError,
  WorkspaceUnknownSessionError,
} from '@deepseek-ai/dsh-workspace'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { workspaceView } from './feed.ts'
import type {
  WorkspaceArchiveSessionRequest,
  WorkspaceArchiveValue,
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceDefaultModelRequest,
  WorkspaceDefaultModelValue,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceInsertBeforeRequest,
  WorkspaceInsertSessionBeforeRequest,
  WorkspaceOrderValue,
  WorkspacePinSessionRequest,
  WorkspacePinValue,
  WorkspaceRenameRequest,
  WorkspaceSetDefaultModelRequest,
  WorkspaceSetDefaultModelValue,
  WorkspaceUnarchiveSessionRequest,
  WorkspaceUnpinSessionRequest,
  WorkspaceValue,
} from './types.ts'
import type { ModelSelection as WireModelSelection } from './types.ts'

/** Implements Workspace mutations against the authoritative registry. */
export class WorkspaceCommands {
  private operationTail = Promise.resolve()

  /** @param ctx - Host context containing the Workspace registry. */
  constructor(private readonly ctx: Context) {}

  /**
   * Create or resolve one Workspace over an existing directory.
   * @param request - directory path to register.
   * @returns the Workspace and whether this call created it.
   */
  create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue> {
    return this.enqueue(async () => {
      try {
        const existing = await this.ctx.workspaceRegistry.resolveByPath(request.path)
        if (existing !== undefined) {
          return { workspace: workspaceView(existing), created: false }
        }
        const workspace = await this.ctx.workspaceRegistry.create(request.path)
        return { workspace: workspaceView(workspace), created: true }
      } catch (error) {
        if (remoteErrorOf(error) !== undefined) throw error
        throw new RemoteError(
          'workspace/invalid-path',
          `cannot create a Workspace at "${request.path}": ${errorMessage(error)}`,
          { path: request.path },
          { cause: error },
        )
      }
    })
  }

  /**
   * Rename one Workspace after serializing title ownership checks.
   * @param request - Workspace identity and proposed title.
   * @returns the updated Workspace projection.
   */
  rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue> {
    const title = request.title.trim()
    if (title === '') {
      return Promise.reject(new RemoteError('gateway/bad-request', 'Workspace rename requires a non-blank title', {}))
    }
    return this.enqueue(async () => {
      const workspace = this.requireWorkspace(request.workspaceId)
      if (title !== workspace.title) {
        if (this.ctx.workspaceRegistry.list().some(candidate =>
          candidate.id !== workspace.id && candidate.title === title)) {
          throw new RemoteError(
            'workspace/name-conflict',
            `Workspace name '${title}' is already in use`,
            { name: title },
          )
        }
        await workspace.setTitle(title)
      }
      return { workspace: workspaceView(workspace) }
    })
  }

  /**
   * Delete one Workspace registration without deleting its directory or Sessions.
   * @param request - Workspace identity to remove.
   * @returns deletion confirmation.
   */
  delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue> {
    return this.enqueue(async () => {
      if (!await this.ctx.workspaceRegistry.delete(WorkspaceId(request.workspaceId))) {
        throw workspaceNotFound(request.workspaceId)
      }
      // A deleted Workspace must not leave a durable override behind: the id is
      // never reused, so a stale entry would be unreachable clutter.
      const defaults = this.defaultModelService()
      if (defaults !== undefined) {
        await defaults.saveWorkspaceSelection(WorkspaceId(request.workspaceId), null)
          .catch((error: unknown) => {
            this.ctx.logger.warn(
              `workspace-controller: deleted Workspace "${request.workspaceId}" left a default-model override: ${String(error)}`,
            )
          })
      }
      return { deleted: true }
    })
  }

  /**
   * Read one Workspace's explicit default-model override and the shared default.
   * @param request - Workspace identity to read.
   * @returns the override and the shared default it falls back to.
   */
  defaultModel(request: WorkspaceDefaultModelRequest): Promise<WorkspaceDefaultModelValue> {
    return this.enqueue(() => {
      const workspace = this.requireWorkspace(request.workspaceId)
      const defaults = this.defaultModelService()
      if (defaults === undefined) throw defaultModelUnavailable()
      const shared = toWireSelection(defaults.currentSelection())
      const override = defaults.workspaceSelection(workspace.id)
      return Promise.resolve({ override: override === undefined ? null : toWireSelection(override), shared })
    })
  }

  /**
   * Validate and save or clear one Workspace's explicit default-model override.
   * @param request - Workspace identity and the selection to store (null clears).
   * @returns receipt after the override is saved or cleared.
   */
  setDefaultModel(request: WorkspaceSetDefaultModelRequest): Promise<WorkspaceSetDefaultModelValue> {
    return this.enqueue(async () => {
      const workspace = this.requireWorkspace(request.workspaceId)
      const defaults = this.defaultModelService()
      if (defaults === undefined) throw defaultModelUnavailable()
      const next = request.selection
      if (next !== null) await this.validateSelection(next)
      await defaults.saveWorkspaceSelection(
        workspace.id,
        next === null ? null : toAgentSelection(next),
      )
      // The override is the model a blank Session in this Workspace starts
      // from, and the composer reads the Session's `modelSelection` projection
      // rather than the override, so every still-blank Session records the new
      // intent now; a Session that already chose keeps its choice.
      if (next !== null) await this.adoptBlankSessions(workspace, next)
      return { saved: true }
    })
  }

  /**
   * Point one Workspace's still-blank Sessions at a newly saved default.
   *
   * A Session that already logged a selection is left alone, and a deployment
   * that mounts no Session Controller or projection registry keeps the override
   * as a creation-time default only.
   * @param workspace - Workspace whose override just changed.
   * @param selection - the saved override.
   */
  private async adoptBlankSessions(workspace: Workspace, selection: WireModelSelection): Promise<void> {
    const sessions = this.ctx.get('sessions')
    const projections = this.ctx.get('sessionProjections')
    const controller = this.ctx.get('sessionController')
    if (sessions === undefined || projections === undefined || controller === undefined) return
    for (const sessionId of workspace.sessionIds) {
      const session = sessions.get(sessionId)
      if (session === undefined) continue
      const projected = projections.snapshot(session).values.modelSelection
      if (projected?.next !== null && projected?.next !== undefined) continue
      try {
        await controller.selectModel({ sessionId, ...toAgentSelection(selection) })
      } catch (error) {
        // One Session failing to adopt keeps its own state; the Workspace
        // default still applies to Sessions created from here on.
        this.ctx.logger.warn(
          `workspace-controller: session "${sessionId}" did not adopt the workspace default: ${String(error)}`,
        )
      }
    }
  }

  /**
   * Reject a selection no mounted adapter can serve, before anything is stored.
   * @param selection - requested provider/model route, with optional reasoning effort.
   */
  private async validateSelection(selection: WireModelSelection): Promise<void> {
    const llm = this.ctx.get('llm')
    if (llm === undefined) {
      throw new RemoteError(
        'workspace/model-unavailable',
        'no model service is mounted; a workspace default model cannot be validated or saved',
        { provider: selection.provider, model: selection.model },
      )
    }
    try {
      await llm.resolveCallConfig({
        provider: selection.provider,
        model: selection.model,
        ...selection.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) },
      })
    } catch (error) {
      if (remoteErrorOf(error) !== undefined) throw error
      throw new RemoteError(
        'workspace/model-unavailable',
        errorMessage(error),
        { provider: selection.provider, model: selection.model },
      )
    }
  }

  /**
   * The optional default-model service, absent when the deployment mounts none.
   * @returns the mounted service, or undefined.
   */
  private defaultModelService(): AgentDefaultModelConfig | undefined {
    return this.ctx.get('agentDefaultModel')
  }

  /**
   * Move one Workspace within the durable registry order.
   * @param request - moved Workspace and optional anchor.
   * @returns the complete resulting Workspace order.
   */
  async insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue> {
    try {
      const workspaceIds = await this.ctx.workspaceRegistry.insertBefore(
        WorkspaceId(request.workspaceId),
        request.beforeWorkspaceId === undefined
          ? undefined
          : WorkspaceId(request.beforeWorkspaceId),
      )
      return { workspaceIds: [...workspaceIds] }
    } catch (error) {
      if (!(error instanceof WorkspaceOrderInvalidError)) throw error
      throw workspaceNotFound(error.workspaceId)
    }
  }

  /**
   * Move one accounted Session within a Workspace's manual order.
   * @param request - Workspace, Session, and optional anchor identities.
   * @returns the updated Workspace projection.
   */
  async insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    try {
      await workspace.insertSessionBefore(request.sessionId, request.beforeSessionId)
    } catch (error) {
      if (!(error instanceof WorkspaceMoveInvalidError)) throw error
      throw new RemoteError(
        'workspace/move-invalid',
        error.message,
        {
          workspaceId: request.workspaceId,
          sessionId: request.sessionId,
          ...request.beforeSessionId === undefined
            ? {}
            : { beforeSessionId: request.beforeSessionId },
        },
        { cause: error },
      )
    }
    return { workspace: workspaceView(workspace) }
  }

  /**
   * Add one known Session to the registry-global archive set. Without
   * `stopActivity` a Session with running work is refused as
   * `workspace/session-active` with the activity the registry's providers
   * reported; with it, the providers stop that work first.
   * @param request - Session identity to archive and whether to stop its work.
   * @returns the complete resulting archive set.
   */
  async archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    try {
      await this.ctx.workspaceRegistry.archiveSession(
        request.sessionId,
        request.stopActivity === true ? { stopActivity: true } : {},
      )
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
      }
      if (error instanceof WorkspaceActiveSessionError) {
        throw new RemoteError(
          'workspace/session-active',
          error.message,
          { sessionId: request.sessionId, activity: error.activity },
          { cause: error },
        )
      }
      throw error
    }
    return { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] }
  }

  /**
   * Drop one Session from the registry-global archive set. An id that is not
   * archived is not an error: the call is idempotent, so a lost race with
   * another surface resolves as a no-op.
   * @param request - Session identity to unarchive.
   * @returns the complete resulting archive set.
   */
  async unarchiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    await this.ctx.workspaceRegistry.unarchiveSession(request.sessionId)
    return { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] }
  }

  /**
   * Add one known unarchived Session to the registry-global pin set.
   * @param request - Session identity to pin.
   * @returns the complete resulting pin set, most recently pinned first.
   */
  async pinSession(request: WorkspacePinSessionRequest): Promise<WorkspacePinValue> {
    try {
      await this.ctx.workspaceRegistry.pinSession(request.sessionId)
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
      }
      if (error instanceof WorkspaceArchivedSessionPinError) {
        throw new RemoteError('gateway/bad-request', error.message, {}, { cause: error })
      }
      throw error
    }
    return { pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds] }
  }

  /**
   * Drop one Session from the registry-global pin set. An id that is not
   * pinned is not an error: the call is idempotent, so a lost race with
   * another surface resolves as a no-op.
   * @param request - Session identity to unpin.
   * @returns the complete resulting pin set, most recently pinned first.
   */
  async unpinSession(request: WorkspaceUnpinSessionRequest): Promise<WorkspacePinValue> {
    await this.ctx.workspaceRegistry.unpinSession(request.sessionId)
    return { pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds] }
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) throw workspaceNotFound(workspaceId)
    return workspace
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => undefined, () => undefined)
    return result
  }
}

function defaultModelUnavailable(): RemoteError<'workspace/default-model-unavailable'> {
  return new RemoteError(
    'workspace/default-model-unavailable',
    'no agent-default-model service is mounted; workspace defaults cannot be served',
    {},
  )
}

function toWireSelection(selection: AgentModelSelection): WireModelSelection {
  return {
    provider: selection.provider,
    model: selection.model,
    ...selection.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: String(selection.reasoningEffort) },
  }
}

function toAgentSelection(selection: WireModelSelection): AgentModelSelection {
  return {
    provider: selection.provider,
    model: selection.model,
    ...selection.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) },
  }
}

function workspaceNotFound(workspaceId: WorkspaceId): RemoteError<'workspace/not-found'> {
  return new RemoteError(
    'workspace/not-found',
    `Workspace "${workspaceId}" not found`,
    { workspaceId },
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
