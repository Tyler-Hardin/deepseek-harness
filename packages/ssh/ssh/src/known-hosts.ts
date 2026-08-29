/**
 * Pure known_hosts policy for the SSH seam: parse, check, learn. The provider
 * wires these functions into the transport's host-key verification so TOFU
 * (learn on first sight) and changed-key rejection are the same logic in
 * tests and in production.
 * @module @deepseek-ai/dsh-ssh/known-hosts
 */

import { readFileSync } from 'node:fs'

/** One parsed `known_hosts` line. */
export interface KnownHostsEntry {
  /** The host pattern (`host`, `[host]:port`, or a `*`/`?` glob). */
  readonly pattern: string
  /** The key algorithm name (e.g. `ssh-ed25519`). */
  readonly keyType: string
  /** The base64 host-key blob (the SSH wire-format public key). */
  readonly keyBase64: string
}

/** Match one known_hosts host pattern (`*`/`?` globs only) against a name. */
function patternMatches(pattern: string, value: string): boolean {
  // Iterative `*`/`?` matching: `*` consumes any run, `?` consumes one char.
  let p = 0
  let v = 0
  let star = -1
  let mark = 0
  while (v < value.length) {
    if (p < pattern.length && (pattern[p] === '?' || pattern[p] === value[v])) {
      p += 1
      v += 1
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p
      mark = v
      p += 1
    } else if (star >= 0) {
      p = star + 1
      mark += 1
      v = mark
    } else {
      return false
    }
  }
  while (p < pattern.length && pattern[p] === '*') p += 1
  return p === pattern.length
}

/**
 * Parse known_hosts text into entries. Blank lines, comments, marker lines
 * (`@cert-authority`, `@revoked`), and hashed entries (`|1|...`) are skipped:
 * hashed entries cannot be matched without hashing the candidate key, which
 * the seam does not implement, so they are invisible to both TOFU and strict
 * checks (documented limitation).
 * @param text - the full known_hosts file content.
 * @returns the parseable entries in file order.
 */
export function parseKnownHosts(text: string): KnownHostsEntry[] {
  const entries: KnownHostsEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('@') || trimmed.startsWith('|')) continue
    const fields = trimmed.split(/\s+/)
    const [pattern, keyType, ...rest] = fields
    if (pattern === undefined || keyType === undefined) continue
    entries.push({ pattern, keyType, keyBase64: rest.join('') })
  }
  return entries
}

/**
 * The canonical host pattern for a host/port pair: `host` when the port is the
 * default 22, `[host]:port` otherwise (the OpenSSH spelling).
 * @param host - the host name.
 * @param port - the port.
 * @returns the canonical known_hosts pattern.
 */
export function knownHostPattern(host: string, port: number): string {
  return port === 22 ? host : `[${host}]:${port}`
}

/** The verdict of a host-key check against the known_hosts set. */
export type HostKeyCheck =
  /** A matching entry carries the exact same key. */
  | { readonly kind: 'known' }
  /** No entry matches this host at all. */
  | { readonly kind: 'unknown' }
  /** A matching entry carries a different key — possible key change or MITM. */
  | { readonly kind: 'changed' }

/**
 * Check a presented host key against the parsed known_hosts entries. The key
 * blob's wire format embeds the algorithm name, so blob equality implies the
 * same algorithm; the stored `keyType` participates only through the blob.
 * @param entries - the parsed entries.
 * @param host - the host name.
 * @param port - the port.
 * @param keyBase64 - the presented key blob, base64.
 * @returns the verdict; `unknown` when no entry's pattern matches.
 */
export function checkHostKey(
  entries: readonly KnownHostsEntry[],
  host: string,
  port: number,
  keyBase64: string,
): HostKeyCheck {
  const matches: KnownHostsEntry[] = entries.filter(entry =>
    patternMatches(entry.pattern, knownHostPattern(host, port))
    || (port === 22 && patternMatches(entry.pattern, host)),
  )
  if (matches.length === 0) return { kind: 'unknown' }
  for (const entry of matches) {
    if (entry.keyBase64 === keyBase64) return { kind: 'known' }
  }
  return { kind: 'changed' }
}

/**
 * Decode the algorithm name from an SSH wire-format public key blob (the
 * first field is a length-prefixed ASCII string naming the algorithm). The
 * transport's host-key verifier supplies only the blob, while a known_hosts
 * learn line needs the algorithm column.
 * @param keyBase64 - the base64 key blob.
 * @returns the algorithm name, or an empty string when the blob is malformed.
 */
export function hostKeyAlgorithmFromBlob(keyBase64: string): string {
  let bytes: Buffer
  try {
    bytes = Buffer.from(keyBase64, 'base64')
  } catch {
    /* v8 ignore next -- Buffer.from with base64 never throws for any string */
    return ''
  }
  if (bytes.length < 4) return ''
  const length = bytes.readUInt32BE(0)
  if (length <= 0 || 4 + length > bytes.length) return ''
  return bytes.toString('utf8', 4, 4 + length)
}

/**
 * Build the known_hosts line that records a host key (the TOFU learn step).
 * @param host - the host name.
 * @param port - the port.
 * @param keyType - the key algorithm.
 * @param keyBase64 - the key blob, base64.
 * @returns one newline-terminated known_hosts line.
 */
export function learnKnownHostLine(host: string, port: number, keyType: string, keyBase64: string): string {
  return `${knownHostPattern(host, port)} ${keyType} ${keyBase64}\n`
}

/**
 * Read and parse a known_hosts file, returning an empty entry list when the
 * file is absent. The provider calls this before connecting; the file is
 * appended to (never rewritten) by the TOFU learn step.
 * @param path - the known_hosts file path.
 * @returns the parsed entries.
 */
export function loadKnownHosts(path: string): KnownHostsEntry[] {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return parseKnownHosts(text)
}
