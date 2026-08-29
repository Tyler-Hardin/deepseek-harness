/**
 * Browser-safe request, result, and state-stream vocabulary for the Workspace
 * and directory-picking Remote namespaces this package owns. The picking seam
 * declares its own listing types, so they are re-exported here rather than
 * restated: a browser consumer reads the very declaration the backend answers.
 */

import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId, WorkspacePlace } from '@deepseek-ai/dsh-workspace/types'

export type { WorkspaceId, WorkspacePlace } from '@deepseek-ai/dsh-workspace/types'
export type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
export type { DirectoryEntry, DirectoryListing } from '@deepseek-ai/dsh-host-directory-picker/types'

/** One durable Workspace projected for browser consumers. */
export interface WorkspaceView {
  readonly workspaceId: WorkspaceId
  /**
   * The durable remote-ness statement: absent means local, so the path is the
   * canonical host directory; an ssh destination carries host/user/port and the
   * path is the remote absolute working path.
   */
  readonly place?: WorkspacePlace | undefined
  /** Canonical working path: host directory for a local place, remote absolute for ssh. */
  readonly path: string
  /** User-visible title. */
  readonly title: string
  /** Sessions accounted to this Workspace in manual order. */
  readonly sessionIds: readonly SessionId[]
  /** ISO-8601 creation instant. */
  readonly createdAt: string
  /** ISO-8601 last-mutation instant. */
  readonly updatedAt: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The requested directory cannot back a Workspace. */
    'workspace/invalid-path': { readonly path: string }
    /** Another Workspace already uses the requested name. */
    'workspace/name-conflict': { readonly name: string }
    /** The Session or its anchor is not in the Workspace's manual order. */
    'workspace/move-invalid': {
      readonly workspaceId: WorkspaceId
      readonly sessionId: SessionId
      readonly beforeSessionId?: SessionId
    }
    /** The verb needs an interaction the composed backend does not serve. */
    'directory-picker/unavailable': { readonly capability: string }
    /** The target is not fully qualified, or the backend cannot list it. */
    'directory-picker/unreadable': { readonly path: string }
    /** A child of that name is already there. */
    'directory-picker/exists': { readonly path: string }
    /** The parent is not fully qualified, the name is not one segment, or creation failed. */
    'directory-picker/create-failed': { readonly path: string }
    /** No adapter serves the requested provider/model route. */
    'workspace/model-unavailable': { readonly provider: string; readonly model: string }
    /** The deployment mounts no agent-default-model service to serve workspace defaults. */
    'workspace/default-model-unavailable': {}
  }
}

/** One Workspace's default-model override read. */
export interface WorkspaceDefaultModelRequest {
  readonly workspaceId: WorkspaceId
}

/** One Workspace's override and the shared default it falls back to. */
export interface WorkspaceDefaultModelValue {
  /** Explicit override, or null when the Workspace inherits the shared default. */
  readonly override: ModelSelection | null
  /** Deployment-wide shared default. */
  readonly shared: ModelSelection
}

/** One Workspace default-model override mutation. */
export interface WorkspaceSetDefaultModelRequest {
  readonly workspaceId: WorkspaceId
  /** The override to save, or null to clear it. */
  readonly selection: ModelSelection | null
}

/** Receipt after one Workspace default-model override is saved or cleared. */
export interface WorkspaceSetDefaultModelValue {
  readonly saved: true
}

/** Existing directory or ssh destination requested for Workspace adoption. */
export interface WorkspaceCreateRequest {
  readonly path: string
  /** Place to adopt: omitted and `{ kind: 'local' }` both mean the local directory. */
  readonly place?: WorkspacePlace | undefined
}

/** Created or previously registered Workspace. */
export interface WorkspaceCreateValue {
  readonly workspace: WorkspaceView
  readonly created: boolean
}

/** Workspace title mutation. */
export interface WorkspaceRenameRequest {
  readonly workspaceId: WorkspaceId
  readonly title: string
}

/** Workspace mutation returning the complete changed row. */
export interface WorkspaceValue {
  readonly workspace: WorkspaceView
}

/** Workspace registration deletion. */
export interface WorkspaceDeleteRequest {
  readonly workspaceId: WorkspaceId
}

/** Receipt after one Workspace registration is deleted. */
export interface WorkspaceDeleteValue {
  readonly deleted: true
}

/** DOM-insertBefore-like Workspace order mutation. */
export interface WorkspaceInsertBeforeRequest {
  readonly workspaceId: WorkspaceId
  readonly beforeWorkspaceId?: WorkspaceId
}

/** Complete Workspace registry order after a mutation. */
export interface WorkspaceOrderValue {
  readonly workspaceIds: readonly WorkspaceId[]
}

/** DOM-insertBefore-like Session membership order mutation. */
export interface WorkspaceInsertSessionBeforeRequest {
  readonly workspaceId: WorkspaceId
  readonly sessionId: SessionId
  readonly beforeSessionId?: SessionId
}

/** Session requested for archival from Workspace grouping surfaces. */
export interface WorkspaceUnarchiveSessionRequest {
  readonly sessionId: SessionId
}

/** Restored archive set after a Session leaves the registry-global set. */
export interface WorkspaceUnarchiveValue {
  readonly archivedSessionIds: readonly SessionId[]
}

/** Session removal from the registry-global archive set. */
export interface WorkspaceArchiveSessionRequest {
  readonly sessionId: SessionId
}

/** Complete archived Session set after a mutation. */
export interface WorkspaceArchiveValue {
  readonly archivedSessionIds: readonly SessionId[]
}

/** Complete reconnect baseline for Workspace browser state. */
export interface WorkspaceBaseline {
  readonly items: readonly WorkspaceView[]
  readonly archivedSessionIds: readonly SessionId[]
}

/** One ordered Workspace change after a generation's baseline. */
export type WorkspaceFollowIncrement =
  | { readonly type: 'upsert'; readonly workspace: WorkspaceView }
  | { readonly type: 'remove'; readonly workspaceId: WorkspaceId }
  | { readonly type: 'order'; readonly workspaceIds: readonly WorkspaceId[] }
  | { readonly type: 'archived'; readonly archivedSessionIds: readonly SessionId[] }

/** Workspace state stream; every generation starts with exactly one baseline. */
export type WorkspaceFollowFrame =
  | { readonly type: 'baseline'; readonly value: WorkspaceBaseline }
  | WorkspaceFollowIncrement
