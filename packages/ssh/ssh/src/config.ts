/**
 * Pure `~/.ssh/config` policy for the SSH seam: destination parsing, host
 * resolution, default identity files, and the agent-then-keys auth order.
 * Every function here is deterministic and socket-free so the seam's policy
 * is unit-testable without a transport. Host resolution delegates to the
 * maintained `ssh-config` parser with OpenSSH first-match-wins semantics and
 * Match-exec evaluation disabled (untrusted config text must never run code).
 * @module @deepseek-ai/dsh-ssh/config
 */

import { parse as parseSshConfig } from 'ssh-config'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ResolvedSshHost } from './types.ts'
import { SshError } from './error.ts'

/** One `[user@]host[:port]` destination, split into parts. */
export interface ParsedSshDestination {
  /** Explicit user, when the destination carried one. */
  readonly user?: string
  /** Host name or alias. */
  readonly host: string
  /** Explicit port, when the destination carried one. */
  readonly port?: number
}

/**
 * Parse an ssh destination `[user@]host[:port]`. Supports bracket-quoted IPv6
 * literals (`[::1]:2222`); a malformed port or empty host rejects with
 * `SSH_CONFIG_ERROR`.
 * @param destination - the raw destination string.
 * @returns the split parts; absent parts stay undefined.
 */
export function parseSshDestination(destination: string): ParsedSshDestination {
  let rest = destination
  let user: string | undefined
  const at = rest.indexOf('@')
  if (at >= 0) {
    user = rest.slice(0, at)
    rest = rest.slice(at + 1)
  }
  let host: string
  let port: number | undefined
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    if (close < 0) {
      throw new SshError('SSH_CONFIG_ERROR', `invalid ssh destination ${JSON.stringify(destination)}: unterminated IPv6 literal`)
    }
    host = rest.slice(1, close)
    const tail = rest.slice(close + 1)
    if (tail !== '') {
      if (!tail.startsWith(':')) {
        throw new SshError('SSH_CONFIG_ERROR', `invalid ssh destination ${JSON.stringify(destination)}: unexpected suffix after IPv6 literal`)
      }
      port = parsePort(tail.slice(1), destination)
    }
  } else {
    const colon = rest.lastIndexOf(':')
    if (colon >= 0) {
      host = rest.slice(0, colon)
      port = parsePort(rest.slice(colon + 1), destination)
    } else {
      host = rest
    }
  }
  if (host === '') {
    throw new SshError('SSH_CONFIG_ERROR', `invalid ssh destination ${JSON.stringify(destination)}: empty host`)
  }
  if (user === '') {
    throw new SshError('SSH_CONFIG_ERROR', `invalid ssh destination ${JSON.stringify(destination)}: empty user`)
  }
  return { ...user === undefined ? {} : { user }, host, ...port === undefined ? {} : { port } }
}

function parsePort(text: string, source: string): number {
  const port = Number(text)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new SshError('SSH_CONFIG_ERROR', `invalid ssh port ${JSON.stringify(text)} in ${source}`)
  }
  return port
}

/** Options for {@link resolveSshConfig}. */
export interface ResolveSshConfigOptions {
  /**
   * Fallback user when neither the destination nor the config names one.
   * Defaults to the operating-system user.
   */
  defaultUser?: string
  /** Explicit user from the destination; wins over the config `User`. */
  user?: string
  /** Explicit port from the destination; wins over the config `Port`. */
  port?: number
}

/**
 * Resolve a host alias against `~/.ssh/config` text into a concrete
 * connection target. Delegates to the `ssh-config` parser's first-match-wins
 * `compute()` (OpenSSH semantics for `Host`/`Match` globs), with `Match exec`
 * evaluation disabled. `HostName`/`Port`/`User` override the destination, and
 * all `IdentityFile` entries plus the comma-separated `ProxyJump` chain are
 * collected. A parse failure rejects with `SSH_CONFIG_ERROR`.
 *
 * The caller reads the config file; this function stays pure so policy is
 * testable. A missing config file is the empty text.
 * @param alias - the host name or alias from the target.
 * @param configText - the full text of `~/.ssh/config` (may be empty).
 * @param homeDir - the user's home directory, for `~` expansion.
 * @param options - resolution options.
 * @returns the concrete connection parameters.
 */
export function resolveSshConfig(
  alias: string,
  configText: string,
  homeDir: string,
  options: ResolveSshConfigOptions = {},
): ResolvedSshHost {
  const defaultUser = options.defaultUser ?? defaultSshUser()
  const computed: Record<string, string | string[]> = {}
  if (configText.trim() !== '') {
    let parsed
    try {
      parsed = parseSshConfig(configText)
    } catch (error) {
      // ssh-config's parser is lenient over every string; this arm is defensive.
      /* v8 ignore next -- parse() does not throw on any string input */
      throw new SshError('SSH_CONFIG_ERROR', `~/.ssh/config could not be parsed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    try {
      for (const [key, value] of Object.entries(parsed.compute(alias, { matchExec: false }))) {
        computed[key.toLowerCase()] = value
      }
    } catch (error) {
      // compute() only throws on internal misuse; this arm is defensive.
      /* v8 ignore next -- compute() does not throw on parsed config text */
      throw new SshError('SSH_CONFIG_ERROR', `~/.ssh/config could not resolve ${JSON.stringify(alias)}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
  const first = (key: string): string | undefined => {
    const value = computed[key]
    /* v8 ignore next -- first() is only called for single-valued keys (HostName/Port/User) */
    return Array.isArray(value) ? value[0] : value
  }
  const hostName = first('hostname') ?? alias
  const portValue = first('port')
  const port = options.port ?? (portValue === undefined ? 22 : parsePort(portValue, `~/.ssh/config Port for ${alias}`))
  const user = options.user ?? first('user') ?? defaultUser
  const rawFiles = computed['identityfile']
  /* v8 ignore next -- ssh-config always returns IdentityFile as an array */
  const identityFiles = rawFiles === undefined ? [] : (Array.isArray(rawFiles) ? rawFiles : [rawFiles])
  const rawJumps = computed['proxyjump']
  const proxyJumps: string[] = []
  if (rawJumps !== undefined) {
    // compute() returns a single string for ProxyJump (first-value-wins), so the
    // array arm is defense against a hand-built computed map.
    /* v8 ignore start -- unreachable from ssh-config compute output */
    for (const entry of Array.isArray(rawJumps) ? rawJumps : [rawJumps]) {
      /* v8 ignore stop */
      proxyJumps.push(...entry.split(',').map(part => part.trim()).filter(part => part !== '' && part !== 'none'))
    }
  }
  return {
    hostName,
    port,
    user,
    identityFiles: identityFiles.map(path => expandSshPath(path, homeDir, user, alias)),
    proxyJumps,
  }
}

/**
 * Expand ssh path tokens in an `IdentityFile` value: leading `~`/`~/` to the
 * home directory, `%d` to home, `%u` to the user, `%h` to the alias.
 * @param path - the raw config value.
 * @param homeDir - the user's home directory.
 * @param user - the resolved user.
 * @param host - the alias from the destination.
 * @returns the expanded path.
 */
export function expandSshPath(path: string, homeDir: string, user: string, host: string): string {
  let expanded = path
  if (expanded === '~') expanded = homeDir
  else if (expanded.startsWith('~/')) expanded = join(homeDir, expanded.slice(2))
  expanded = expanded.replaceAll('%d', homeDir).replaceAll('%u', user).replaceAll('%h', host)
  return expanded
}

/**
 * The default identity files tried when the config names none:
 * `~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`.
 * @param homeDir - the user's home directory.
 * @returns the candidate paths in try order.
 */
export function defaultIdentityFiles(homeDir: string): string[] {
  return ['id_ed25519', 'id_rsa', 'id_ecdsa'].map(name => join(homeDir, '.ssh', name))
}

/** One authentication method, in the order the provider must try them. */
export type AuthMethod =
  | { readonly kind: 'agent' }
  | { readonly kind: 'key'; readonly path: string }

/** Inputs for {@link selectAuthMethods}. */
export interface AuthSelectionInput {
  /** The ssh-agent socket path (`SSH_AUTH_SOCK`), or null when no agent is available. */
  readonly agentSocket: string | null
  /** The identity files to try, in order (already resolved; defaults when none). */
  readonly identityFiles: readonly string[]
}

/**
 * Select the ordered authentication methods: the agent first when a socket is
 * present, then each identity file. There is deliberately no password variant.
 * @param input - the agent socket and resolved identity files.
 * @returns the methods in try order; empty when nothing is usable.
 */
export function selectAuthMethods(input: AuthSelectionInput): AuthMethod[] {
  const methods: AuthMethod[] = []
  if (input.agentSocket !== null && input.agentSocket !== '') {
    methods.push({ kind: 'agent' })
  }
  for (const path of input.identityFiles) {
    methods.push({ kind: 'key', path })
  }
  return methods
}

/**
 * The local username, used as the fallback ssh user (mirrors OpenSSH).
 * @returns `process.env.USER`, else the last segment of the home directory,
 *   else an empty string when the home path has no usable segment.
 */
export function defaultSshUser(): string {
  return process.env.USER ?? homedir().split('/').filter(Boolean).at(-1) ?? ''
}
