import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  defaultIdentityFiles,
  defaultSshUser,
  expandSshPath,
  parseSshDestination,
  resolveSshConfig,
  selectAuthMethods,
} from '../src/config.ts'
import { SshError } from '../src/error.ts'

describe('parseSshDestination', () => {
  it('parses bare, user, port, and combined forms', () => {
    expect(parseSshDestination('host')).toEqual({ host: 'host' })
    expect(parseSshDestination('user@host')).toEqual({ user: 'user', host: 'host' })
    expect(parseSshDestination('host:2222')).toEqual({ host: 'host', port: 2222 })
    expect(parseSshDestination('user@host:2222')).toEqual({ user: 'user', host: 'host', port: 2222 })
  })

  it('supports bracket-quoted IPv6 literals', () => {
    expect(parseSshDestination('[::1]:2222')).toEqual({ host: '::1', port: 2222 })
    expect(parseSshDestination('user@[::1]')).toEqual({ user: 'user', host: '::1' })
  })

  it('rejects malformed destinations with SSH_CONFIG_ERROR', () => {
    for (const bad of ['', '@host', 'host:0', 'host:70000', 'host:abc', '[::1', '[::1]x']) {
      expect(() => parseSshDestination(bad)).toThrow(SshError)
      try {
        parseSshDestination(bad)
      } catch (error) {
        expect((error as SshError).code).toBe('SSH_CONFIG_ERROR')
      }
    }
  })
})

const HOME = '/home/tyler'

describe('resolveSshConfig', () => {
  it('returns defaults for an empty config', () => {
    expect(resolveSshConfig('myserver', '', HOME, { defaultUser: 'alice' })).toEqual({
      hostName: 'myserver',
      port: 22,
      user: 'alice',
      identityFiles: [],
      proxyJumps: [],
    })
  })

  it('applies the first matching Host block with overrides', () => {
    const text = [
      'Host myserver',
      '  HostName 10.0.0.5',
      '  Port 2222',
      '  User bob',
      '  IdentityFile ~/.ssh/one',
      '  IdentityFile %d/.ssh/two',
      '  ProxyJump jump1, jump2, none',
      'Host other',
      '  User nobody',
      '',
    ].join('\n')
    expect(resolveSshConfig('myserver', text, HOME, { defaultUser: 'alice' })).toEqual({
      hostName: '10.0.0.5',
      port: 2222,
      user: 'bob',
      identityFiles: [`${HOME}/.ssh/one`, `${HOME}/.ssh/two`],
      proxyJumps: ['jump1', 'jump2'],
    })
  })

  it('resolves glob Host patterns first-match-wins', () => {
    const text = [
      'Host *.example.com',
      '  User globuser',
      'Host *.example.com',
      '  User second',
      '',
    ].join('\n')
    expect(resolveSshConfig('web.example.com', text, HOME, { defaultUser: 'alice' }).user).toBe('globuser')
  })

  it('handles a single IdentityFile and first-wins repeated ProxyJump', () => {
    const text = [
      'Host single',
      '  IdentityFile ~/.ssh/only',
      '  ProxyJump jump-a',
      '  ProxyJump jump-b',
      '',
    ].join('\n')
    expect(resolveSshConfig('single', text, HOME, { defaultUser: 'alice' }).identityFiles).toEqual([`${HOME}/.ssh/only`])
    // OpenSSH first-value-wins semantics for repeated non-accumulating options.
    expect(resolveSshConfig('single', text, HOME, { defaultUser: 'alice' }).proxyJumps).toEqual(['jump-a'])
  })

  it('lets explicit destination user and port win over the config', () => {
    const text = 'Host db\n  User cfguser\n  Port 1111\n'
    const resolved = resolveSshConfig('db', text, HOME, { user: 'destuser', port: 2222 })
    expect(resolved.user).toBe('destuser')
    expect(resolved.port).toBe(2222)
  })

  it('rejects an invalid config Port with SSH_CONFIG_ERROR', () => {
    const text = 'Host x\n  Port abc\n'
    expect(() => resolveSshConfig('x', text, HOME)).toThrow(SshError)
    try {
      resolveSshConfig('x', text, HOME)
    } catch (error) {
      expect((error as SshError).code).toBe('SSH_CONFIG_ERROR')
    }
  })
})

describe('expandSshPath', () => {
  it('expands ~, ~/, %d, %u, and %h tokens', () => {
    expect(expandSshPath('~', HOME, 'bob', 'h')).toBe(HOME)
    expect(expandSshPath('~/keys/id', HOME, 'bob', 'h')).toBe(join(HOME, 'keys/id'))
    expect(expandSshPath('%d/.ssh/key', HOME, 'bob', 'h')).toBe(`${HOME}/.ssh/key`)
    expect(expandSshPath('%u-key', HOME, 'bob', 'h')).toBe('bob-key')
    expect(expandSshPath('%h-key', HOME, 'bob', 'myhost')).toBe('myhost-key')
  })
})

describe('defaultIdentityFiles', () => {
  it('lists the three default keys in try order', () => {
    expect(defaultIdentityFiles(HOME)).toEqual([
      join(HOME, '.ssh/id_ed25519'),
      join(HOME, '.ssh/id_rsa'),
      join(HOME, '.ssh/id_ecdsa'),
    ])
  })
})

describe('selectAuthMethods', () => {
  it('puts the agent first when a socket is present', () => {
    expect(selectAuthMethods({ agentSocket: '/run/agent.sock', identityFiles: ['/k1', '/k2'] })).toEqual([
      { kind: 'agent' },
      { kind: 'key', path: '/k1' },
      { kind: 'key', path: '/k2' },
    ])
  })

  it('omits the agent without a socket and treats an empty socket as absent', () => {
    expect(selectAuthMethods({ agentSocket: null, identityFiles: ['/k1'] })).toEqual([{ kind: 'key', path: '/k1' }])
    expect(selectAuthMethods({ agentSocket: '', identityFiles: [] })).toEqual([])
  })
})

describe('defaultSshUser', () => {
  const originalUser = process.env.USER
  const originalHome = process.env.HOME
  afterEach(() => {
    if (originalUser === undefined) delete process.env.USER
    else process.env.USER = originalUser
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
  })

  it('returns USER when set', () => {
    process.env.USER = 'alice'
    expect(defaultSshUser()).toBe('alice')
  })

  it('falls back to the last home path segment', () => {
    delete process.env.USER
    process.env.HOME = '/home/alice'
    expect(defaultSshUser()).toBe('alice')
  })

  it('returns empty when the home path has no usable segment', () => {
    delete process.env.USER
    process.env.HOME = '/'
    expect(defaultSshUser()).toBe('')
  })
})
