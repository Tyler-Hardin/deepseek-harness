import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkHostKey,
  hostKeyAlgorithmFromBlob,
  knownHostPattern,
  learnKnownHostLine,
  loadKnownHosts,
  parseKnownHosts,
} from '../src/known-hosts.ts'

/** Build a plausible wire-format key blob for a named algorithm. */
function blobFor(algorithm: string): string {
  const name = Buffer.from(algorithm, 'utf8')
  const blob = Buffer.alloc(4 + name.length + 16)
  blob.writeUInt32BE(name.length, 0)
  name.copy(blob, 4)
  return blob.toString('base64')
}

const HOST = 'example.com'
const KEY = blobFor('ssh-ed25519')

describe('parseKnownHosts', () => {
  it('parses entries and skips blanks, comments, markers, and hashed lines', () => {
    const text = [
      '# a comment',
      '',
      `${HOST} ssh-ed25519 ${KEY}`,
      '@cert-authority example.com ssh-ed25519 ${KEY}',
      '|1|aGVsbG8=|aGVsbG8= ssh-ed25519 ${KEY}',
      '[other]:2222 ssh-ed25519 ${KEY} extra-token',
      'just-two-fields',
      '',
    ].join('\n')
    const entries = parseKnownHosts(text)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({ pattern: HOST, keyType: 'ssh-ed25519', keyBase64: KEY })
    expect(entries[1]!.pattern).toBe('[other]:2222')
  })
})

describe('knownHostPattern', () => {
  it('uses the bare host for port 22 and the bracket form otherwise', () => {
    expect(knownHostPattern('example.com', 22)).toBe('example.com')
    expect(knownHostPattern('example.com', 2222)).toBe('[example.com]:2222')
  })
})

describe('checkHostKey', () => {
  it('returns known for an exact match', () => {
    expect(checkHostKey([{ pattern: HOST, keyType: 'ssh-ed25519', keyBase64: KEY }], HOST, 22, KEY)).toEqual({ kind: 'known' })
  })

  it('returns changed when a matching entry carries a different key', () => {
    const other = blobFor('ssh-rsa')
    expect(checkHostKey([{ pattern: HOST, keyType: 'ssh-rsa', keyBase64: other }], HOST, 22, KEY)).toEqual({ kind: 'changed' })
  })

  it('returns unknown when no entry matches', () => {
    expect(checkHostKey([{ pattern: 'elsewhere', keyType: 'ssh-ed25519', keyBase64: KEY }], HOST, 22, KEY)).toEqual({ kind: 'unknown' })
  })

  it('matches glob patterns and the non-22 bracket form', () => {
    expect(checkHostKey([{ pattern: '*.example.com', keyType: 'ssh-ed25519', keyBase64: KEY }], 'web.example.com', 22, KEY)).toEqual({ kind: 'known' })
    expect(checkHostKey([{ pattern: '[example.com]:2222', keyType: 'ssh-ed25519', keyBase64: KEY }], 'example.com', 2222, KEY)).toEqual({ kind: 'known' })
    expect(checkHostKey([{ pattern: 'web.*', keyType: 'ssh-ed25519', keyBase64: KEY }], 'web.example.com', 22, KEY)).toEqual({ kind: 'known' })
    expect(checkHostKey([{ pattern: 'web*', keyType: 'ssh-ed25519', keyBase64: KEY }], 'web', 22, KEY)).toEqual({ kind: 'known' })
  })
})

describe('learnKnownHostLine', () => {
  it('produces the canonical newline-terminated line', () => {
    expect(learnKnownHostLine(HOST, 2222, 'ssh-ed25519', KEY)).toBe(`[${HOST}]:2222 ssh-ed25519 ${KEY}\n`)
  })
})

describe('hostKeyAlgorithmFromBlob', () => {
  it('decodes the length-prefixed algorithm name', () => {
    expect(hostKeyAlgorithmFromBlob(blobFor('ssh-ed25519'))).toBe('ssh-ed25519')
    expect(hostKeyAlgorithmFromBlob(blobFor('ssh-rsa'))).toBe('ssh-rsa')
  })

  it('returns empty for malformed blobs', () => {
    expect(hostKeyAlgorithmFromBlob('not-base64!!')).toBe('')
    expect(hostKeyAlgorithmFromBlob('AA==')).toBe('') // length 0
    expect(hostKeyAlgorithmFromBlob(Buffer.from([0, 0, 0, 50, 1]).toString('base64'))).toBe('') // overruns
  })
})

describe('loadKnownHosts', () => {
  it('returns an empty list when the file is missing', () => {
    expect(loadKnownHosts('/nonexistent/known_hosts')).toEqual([])
  })

  it('parses an existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-kh-'))
    try {
      const path = join(dir, 'known_hosts')
      writeFileSync(path, `${HOST} ssh-ed25519 ${KEY}\n`)
      expect(loadKnownHosts(path)).toEqual([{ pattern: HOST, keyType: 'ssh-ed25519', keyBase64: KEY }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
