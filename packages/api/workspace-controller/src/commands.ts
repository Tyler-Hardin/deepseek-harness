/** Workspace command implementation and stable Remote failure mapping. */

import type { Context } from '@deepseek-ai/cordis'
import type { ModelSelection as AgentModelSelection } from '@deepseek-ai/dsh-agent'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import {
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
  WorkspaceRenameRequest,
  WorkspaceSetDefaultModelRequest,
  WorkspaceSetDefaultModelValue,
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
   * Add one known Session to the registry-global archive set.
   * @param request - Session identity to archive.
   * @returns the complete resulting archive set.
   */
  async archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    try {
      await this.ctx.workspaceRegistry.archiveSession(request.sessionId)
    } catch (error) {
      if (!(error instanceof WorkspaceUnknownSessionError)) throw error
      throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
    }
    return { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] }
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
      return { saved: true }
    })
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
        error instanceof Error ? error.message : String(error),
        { provider: selection.provider, model: selection.model },
      )
    }
  }

  /**
   * Resolve one Workspace or reject with the wire not-found refusal.
   * @param workspaceId - Workspace identity to resolve.
   * @returns the authoritative registry entity.
   */
  /**
   * The optional default-model service, absent when the deployment mounts none.
   * @returns the mounted service, or undefined.
   */
  private defaultModelService(): AgentDefaultModelConfig | undefined {
    return this.ctx.get('agentDefaultModel')
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

/** The deployment mounts no default-model service to serve workspace defaults. */
function defaultModelUnavailable(): RemoteError<'workspace/default-model-unavailable'> {
  return new RemoteError(
    'workspace/default-model-unavailable',
    'no agent-default-model service is mounted; workspace default models are unavailable',
    {},
  )
}

/**
 * Project one Agent-facing selection onto the wire vocabulary.
 * @param selection - Agent-side selection with a branded reasoning effort.
 * @returns the plain-string wire selection.
 */
function toWireSelection(selection: AgentModelSelection): WireModelSelection {
  return {
    provider: selection.provider,
    model: selection.model,
    ...selection.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: String(selection.reasoningEffort) },
  }
}

/**
 * Project one wire selection onto the Agent-facing vocabulary.
 * @param selection - plain-string wire selection.
 * @returns the Agent-side selection with a branded reasoning effort.
 */
function toAgentSelection(selection: WireModelSelection): AgentModelSelection {
  return {
    provider: selection.provider,
    model: selection.model,
    ...selection.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) },
  }
}
