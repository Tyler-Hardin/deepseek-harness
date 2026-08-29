/**
 * SSH failure class. @module @deepseek-ai/dsh-ssh/error
 */

/**
 * Stable ssh transport failure codes used for routing. Consumers route on
 * `code`, never on the prototype chain or message text.
 */
export type SshErrorCode =
  /** No usable authentication method (agent and every candidate key failed). */
  | 'SSH_AUTH_FAILED'
  /** A known host presented a different key than the one recorded. */
  | 'SSH_HOST_KEY_CHANGED'
  /** Strict mode rejected a host with no known_hosts entry. */
  | 'SSH_UNKNOWN_HOST'
  /** `~/.ssh/config` or the destination could not be resolved. */
  | 'SSH_CONFIG_ERROR'
  /** The transport could not reach the host (DNS, refused, reset). */
  | 'SSH_CONNECT_ERROR'
  /** The connect or command exceeded its timeout. */
  | 'SSH_TIMEOUT'
  /** The operation was aborted by its caller's signal. */
  | 'SSH_ABORTED'

/**
 * Stable ssh failures suitable for host RPC error mapping.
 *
 * Deliberately re-implements the `HarnessError` shape instead of extending it:
 * the base lives in `@deepseek-ai/dsh-llm`, and a transport seam must not
 * depend on the LLM capability. Consumers route on `code`, never on the
 * prototype chain, so the shapes stay interchangeable at the wire boundary.
 */
export class SshError extends Error {
  /** Stable machine-routable failure class; route on this, never by parsing `message`. */
  readonly code: SshErrorCode

  constructor(code: SshErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
    this.name = 'SshError'
  }
}
