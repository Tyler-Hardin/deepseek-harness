/**
 * Public type vocabulary of the workspace entity: the `WorkspaceId` brand, the
 * `Workspace` consumer interface, and the workspace `place` that locates it —
 * remote-ness is a property of the workspace definition. Types only — the
 * `WorkspaceId` factory lives in `index.ts` (this file carries no runtime
 * code).
 * @module @deepseek-ai/dsh-workspace/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'

/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
export type WorkspaceId = Branded<'WorkspaceId'>

/**
 * Where a workspace lives: remote-ness is a property of the workspace
 * definition. A local place is the working directory; an ssh place names the
 * remote destination (host, optional user and port). The working path is NOT
 * part of the place — it lives once in {@link Workspace.path} (a remote
 * workspace's path is its remote absolute path), so the two facts have one
 * home each. Consumers switch on `kind` and never assume a local path.
 */
export type WorkspacePlace =
  | { readonly kind: 'local' }
  | {
    readonly kind: 'ssh'
    readonly host: string
    readonly user?: string | undefined
    readonly port?: number | undefined
  }

/**
 * One workspace: a stable id over a place (an existing directory or a remote
 * ssh destination), a display title, and an ordered candidate account of
 * sessions. Membership requires both an id in that account and a session
 * header whose canonical cwd equals the workspace's working path. Consumers
 * only see this interface; the implementation stays private.
 */
export interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * The workspace's place: the durable statement of where it lives. Local
   * workspaces carry their canonical directory path; remote workspaces carry
   * the ssh destination and remote working path.
   */
  readonly place: WorkspacePlace

  /**
   * The working path: the canonical local directory path for a local place,
   * or the remote absolute path for an ssh place. Never rewritten afterwards,
   * even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to `basename(path)` at create; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Header-validated sessions in manually owned order: a new session is
   * prepended at attach, explicit reordering goes through
   * `insertSessionBefore`, and activity never reorders. The durable candidate
   * account is filtered synchronously: missing headers, invalid cwd values,
   * and canonical cwd mismatches are never returned. A subsequent workspace
   * mutation prunes those filtered candidates durably.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Prepend a session to this workspace's candidate account. An already
   * accounted id resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs. A new id's
   * live or persisted
   * header cwd must resolve to an existing directory equal to {@link path};
   * unknown ids, missing or invalid cwd values, and mismatches reject without
   * writing.
   * @param sessionId - The session to record.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing, aside from the durable filtered-candidate
   * prune every accepted mutation performs; decided on the domain write
   * chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account. Idempotent: an id not on
   * the account resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs; decided on
   * the domain write chain like attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live place check, uncached: whether the workspace's place is currently
   * reachable. For a local place this is the existing-directory check; a
   * remote place's probe is the transport's concern and reports `'missing'`
   * when unreachable. A missing place never mutates the record.
   * @returns `'ok'` when the place is reachable, `'missing'` otherwise.
   */
  status(): Promise<'ok' | 'missing'>
}
