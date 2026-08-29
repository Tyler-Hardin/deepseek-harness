import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer as createNetServer, connect as netConnect } from 'node:net'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AgentProtocol, Server, utils, type Connection as ServerConnection, type ParsedKey } from 'ssh2'
import type { SFTPWrapper } from 'ssh2'
import { SshError } from '@deepseek-ai/dsh-ssh'
import Ssh2Service from '../src/index.ts'
import type { Config } from '../src/index.ts'

/** Wire-format blob base64 for a generated key pair. */
function publicBlob(keyPair: { public: string }): Buffer {
  const parsed = utils.parseKey(keyPair.public)
  if (parsed instanceof Error) throw parsed
  return parsed.getPublicSSH()
}

/**
 * Generate an ed25519 key pair, retrying the rare malformed-key race in
 * ssh2's synchronous generator under parallel workers.
 */
function generateKeyPair(): { private: string; public: string } {
  for (let attempt = 0; ; attempt++) {
    const pair = utils.generateKeyPairSync('ed25519')
    if (!(utils.parseKey(pair.private) instanceof Error)) return pair
    if (attempt >= 5) throw new Error('could not generate a usable test key')
  }
}

interface SshdOptions {
  /** When true, the server rejects every authentication attempt. */
  rejectAuth?: boolean
  /** Recorded environment entries from exec requests. */
  onEnv?: (key: string, value: string) => void
  /** When true, the server does not handle the sftp subsystem. */
  noSftp?: boolean
  /** When true, the server does not handle exec requests. */
  noExec?: boolean
  /** When true, the server does not handle shell (pty) requests. */
  noShell?: boolean
  /** When true, the server rejects the pty-req request. */
  noPty?: boolean
}

/** An in-process ssh2 sshd with exec, env, and sftp support. */
interface Sshd {
  host: string
  port: number
  hostKeyPair: { public: string; private: string }
  userKeyPair: { public: string; private: string }
  userKey: ParsedKey
  hostKeyBlob: string
  close: () => Promise<void>
}

async function startSshd(options: SshdOptions = {}): Promise<Sshd> {
  const hostKeyPair = generateKeyPair()
  const userKeyPair = generateKeyPair()
  const parsedKey = utils.parseKey(userKeyPair.private)
  if (parsedKey instanceof Error) throw parsedKey
  const userBlob = publicBlob(userKeyPair)
  const liveClients = new Set<ServerConnection>()
  const server = new Server({ hostKeys: [hostKeyPair.private] }, (client: ServerConnection) => {
    liveClients.add(client)
    client.on('close', () => { liveClients.delete(client) })
    client.on('authentication', (ctx) => {
      if (options.rejectAuth === true) {
        ctx.reject()
        return
      }
      if (ctx.method === 'publickey' && ctx.key !== undefined && ctx.key.data.equals(userBlob)) {
        ctx.accept()
        return
      }
      ctx.reject()
    })
    client.on('ready', () => {})
    client.on('session', (accept) => {
      const session = accept()
      session.on('env', (_acceptEnv, _rejectEnv, info) => {
        options.onEnv?.(info.key, info.val)
      })
      if (options.noExec === true) {
        return
      }
      session.on('exec', (acceptExec, _rejectExec, info) => {
        const stream = acceptExec()
        stream.on('error', () => {})
        const command = info.command
        if (command === 'echo hello') {
          stream.write('hello\n')
          stream.exit(0)
          stream.end()
        } else if (command === 'echo err >&2') {
          stream.stderr.write('err\n')
          stream.exit(0)
          stream.end()
        } else if (command === 'exit 7') {
          stream.exit(7)
          stream.end()
        } else if (command === 'cat') {
          stream.on('data', (data: Buffer) => { stream.write(data) })
          stream.on('end', () => { stream.exit(0); stream.end() })
        } else if (command === 'killme') {
          stream.exit('KILL')
          stream.end()
        } else if (command === 'bigerr') {
          stream.stderr.write('e'.repeat(2000))
          stream.exit(0)
          stream.end()
        } else if (command === 'sleep 30') {
          // Hold the channel open; the client timeout closes it.
        } else if (command === 'big') {
          stream.write('x'.repeat(2000))
          stream.write('y'.repeat(2000))
          stream.exit(0)
          stream.end()
        } else {
          // Echo the raw command so tests can inspect exec wiring (cwd).
          stream.write(command)
          stream.exit(0)
          stream.end()
        }
      })
      if (options.noShell !== true) {
        session.on('pty', (acceptPty, rejectPty) => {
          if (options.noPty === true) rejectPty()
          else acceptPty()
        })
        session.on('shell', (acceptShell, _rejectShell) => {
          const stream = acceptShell()
          stream.on('error', () => {})
          // Echo every line back (uppercased) so tests observe pty I/O.
          let buffer = ''
          stream.on('data', (data: Buffer) => {
            buffer += data.toString()
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              stream.write(line.toUpperCase() + '\n')
            }
          })
          stream.on('end', () => { stream.exit(0); stream.end() })
        })
      }
      if (options.noSftp !== true) {
        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp()
          sftp.on('error', () => {})
          sftp.on('REALPATH', (reqID, path) => {
            sftp.name(reqID, [{ filename: path, longname: path, attrs: { mode: 0, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 } }])
          })
        })
      }
    })
    client.on('error', () => {})
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () =>{  resolve() })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('sshd did not bind a TCP port')
  return {
    host: '127.0.0.1',
    port: address.port,
    hostKeyPair,
    userKeyPair,
    userKey: parsedKey,
    hostKeyBlob: publicBlob(hostKeyPair).toString('base64'),
    close: () => {
      for (const client of liveClients) client.end()
      return new Promise<void>(resolve => server.close(() =>{  resolve() }))
    },
  }
}

/** A bare TCP listener whose sockets are force-closed on teardown. */
async function startNetListener(onConnection: (socket: import('node:net').Socket) => void): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<import('node:net').Socket>()
  const server = createNetServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => { sockets.delete(socket) })
    onConnection(socket)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () =>{  resolve() }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('listener did not bind')
  return {
    port: address.port,
    close: () => {
      for (const socket of sockets) socket.destroy()
      return new Promise<void>(resolve => server.close(() =>{  resolve() }))
    },
  }
}

/** A bare TCP listener that accepts and immediately destroys (handshake-close path). */
function startClosingListener(): Promise<{ port: number; close: () => Promise<void> }> {
  return startNetListener(socket => socket.destroy())
}

/** A net server that accepts connections and never speaks (handshake-timeout path). */
function startSilentListener(): Promise<{ port: number; close: () => Promise<void> }> {
  return startNetListener(() => {})
}

describe('dsh-ssh-client', () => {
  const originalSock = process.env.SSH_AUTH_SOCK
  let homes: string[] = []

  beforeEach(() => {
    homes = []
    delete process.env.SSH_AUTH_SOCK
  })

  afterEach(() => {
    for (const home of homes) rmSync(home, { recursive: true, force: true })
    if (originalSock === undefined) delete process.env.SSH_AUTH_SOCK
    else process.env.SSH_AUTH_SOCK = originalSock
  })

  /** A temp home with a private .ssh dir and the given identity key. */
  function tempHome(keyPem?: string): { home: string; ssh: string } {
    const home = mkdtempSync(join(tmpdir(), 'dsh-ssh-'))
    homes.push(home)
    const ssh = join(home, '.ssh')
    mkdirSync(ssh, { recursive: true, mode: 0o700 })
    if (keyPem !== undefined) {
      const keyPath = join(ssh, 'id_ed25519')
      writeFileSync(keyPath, keyPem, { mode: 0o600 })
    }
    chmodSync(ssh, 0o700)
    return { home, ssh }
  }

  async function makeService(config: Config): Promise<{ ctx: Context; ssh: Ssh2Service }> {
    const ctx = new Context()
    await ctx.plugin(Ssh2Service, config)
    return { ctx, ssh: ctx.ssh as Ssh2Service }
  }

  it('connects with a default identity key and TOFU-learns the host key', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    const knownHosts = join(ssh, 'known_hosts')
    const { ctx, ssh: service } = await makeService({ homeDir: home, knownHostsPath: knownHosts, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      expect(world.status()).toBe('connected')
      expect(service.worlds()).toContain(world)
      const learned = readFileSync(knownHosts, 'utf8')
      expect(learned).toContain(`[127.0.0.1]:${sshd.port} ssh-ed25519 ${sshd.hostKeyBlob}`)
      await service.disconnect(world.id)
      expect(world.status()).toBe('closed')
      expect(service.worlds()).not.toContain(world)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('accepts a known host key and rejects a changed one', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    const knownHosts = join(ssh, 'known_hosts')
    writeFileSync(knownHosts, `[127.0.0.1]:${sshd.port} ssh-ed25519 ${sshd.hostKeyBlob}\n`, { mode: 0o600 })
    const first = await makeService({ homeDir: home, knownHostsPath: knownHosts, timeoutMs: 5000 })
    try {
      const world = await first.ssh.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      await first.ssh.disconnect(world.id)
    } finally {
      await first.ctx.fiber.dispose()
    }
    const otherBlob = publicBlob(generateKeyPair())
    writeFileSync(knownHosts, `[127.0.0.1]:${sshd.port} ssh-ed25519 ${otherBlob.toString('base64')}\n`, { mode: 0o600 })
    const second = await makeService({ homeDir: home, knownHostsPath: knownHosts, timeoutMs: 5000 })
    try {
      await expect(second.ssh.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toMatchObject({ code: 'SSH_HOST_KEY_CHANGED' })
    } finally {
      await second.ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('rejects an unknown host in strict mode', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({
      homeDir: home,
      knownHostsPath: join(ssh, 'known_hosts'),
      strictHostKey: true,
      timeoutMs: 5000,
    })
    try {
      await expect(service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toMatchObject({ code: 'SSH_UNKNOWN_HOST' })
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('runs commands with output, exit codes, stderr, cwd, and env', async () => {
    const envs: Array<[string, string]> = []
    const sshd = await startSshd({ onEnv: (key, value) => envs.push([key, value]) })
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      await expect(world.exec('echo hello')).resolves.toMatchObject({ stdout: 'hello\n', exitCode: 0, timedOut: false, aborted: false })
      await expect(world.exec('echo err >&2')).resolves.toMatchObject({ stderr: 'err\n', exitCode: 0 })
      await expect(world.exec('exit 7')).resolves.toMatchObject({ exitCode: 7 })
      const withCwd = await world.exec('echo hi', { cwd: '/remote/dir' })
      expect(withCwd.stdout).toContain("cd '/remote/dir' &&")
      const quoted = await world.exec('echo hi', { cwd: "/remote/it's" })
      expect(quoted.stdout).toContain("cd '/remote/it'\"'\"'s' &&")
      await world.exec('echo env', { env: { FOO: 'bar' } })
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(envs).toContainEqual(['FOO', 'bar'])
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('bounds output, times out held commands, and aborts on signal', async () => {
    const sshd = await startSshd()
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000, defaultMaxOutputBytes: 100 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      const bounded = await world.exec('big')
      expect(bounded.stdout.length).toBeLessThanOrEqual(100)
      expect(bounded.stdoutTruncated).toBe(true)
      const boundedErr = await world.exec('bigerr')
      expect(boundedErr.stderrTruncated).toBe(true)
      const viaStdin = await world.exec('cat', { stdin: 'hello-stdin' })
      expect(viaStdin.stdout).toBe('hello-stdin')
      const signalled = await world.exec('killme')
      expect(signalled.signal).toBe('SIGKILL')
      const timed = await world.exec('sleep 30', { timeoutMs: 300 })
      expect(timed.timedOut).toBe(true)
      expect(timed.exitCode).toBeNull()
      const controller = new AbortController()
      const aborted = world.exec('sleep 30', { signal: controller.signal })
      setTimeout(() =>{  controller.abort() }, 300)
      await expect(aborted).resolves.toMatchObject({ aborted: true })
      const preAborted = new AbortController()
      preAborted.abort()
      await expect(world.exec('sleep 30', { signal: preAborted.signal })).resolves.toMatchObject({ aborted: true })
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('opens a branded sftp handle and caches the session', async () => {
    const sshd = await startSshd()
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      const handle = await world.sftp()
      const sftp = handle.session as SFTPWrapper
      const path = await new Promise<string>((resolve, reject) => {
        sftp.realpath('.', (error, resolved) => {
          if (error !== null && error !== undefined) { reject(error); return }
          resolve(resolved)
        })
      })
      expect(path).toBeTruthy()
      const second = await world.sftp()
      expect(second.session).toBe(handle.session)
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('authenticates through an ssh-agent on SSH_AUTH_SOCK', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome() // no key files at all
    const socketPath = join(ssh, 'agent.sock')
    const agentServer = createNetServer((socket) => {
      const agent = new AgentProtocol(false)
      socket.pipe(agent).pipe(socket)
      agent.on('identities', (req) => {
        agent.getIdentitiesReply(req, [sshd.userKey])
      })
      agent.on('sign', (req, _pubKey, data) => {
        agent.signReply(req, sshd.userKey.sign(data))
      })
    })
    await new Promise<void>(resolve => agentServer.listen(socketPath, resolve))
    process.env.SSH_AUTH_SOCK = socketPath
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      expect(world.status()).toBe('connected')
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await new Promise<void>(resolve => agentServer.close(() =>{  resolve() }))
      await sshd.close()
    }
  })

  it('fails auth loudly with key notes when nothing is usable', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome()
    writeFileSync(join(ssh, 'id_ed25519'), 'not a key', { mode: 0o600 })
    writeFileSync(join(ssh, 'id_rsa'), 'also not a key', { mode: 0o644 })
    mkdirSync(join(ssh, 'id_ecdsa'), { mode: 0o700 }) // a directory reads as EISDIR
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      await expect(service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toMatchObject({ code: 'SSH_AUTH_FAILED' })
      await expect(service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toThrow(/group\/world-accessible/)
      await expect(service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toThrow(/unreadable key/)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('maps a server-rejected key to SSH_AUTH_FAILED, with key notes', async () => {
    const sshd = await startSshd({ rejectAuth: true })
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    writeFileSync(join(ssh, 'id_ecdsa'), 'not a key', { mode: 0o600 }) // unusable -> note
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      await expect(service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toMatchObject({ code: 'SSH_AUTH_FAILED' })
      await expect(service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toThrow(/unusable key/)
      // A clean home reaches the same failure without key notes.
      const clean = await makeService({ homeDir: tempHome().home, timeoutMs: 5000 })
      try {
        await expect(clean.ssh.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
          .rejects.toMatchObject({ code: 'SSH_AUTH_FAILED' })
      } finally {
        await clean.ctx.fiber.dispose()
      }
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('fails auth when no agent and no identity files exist', async () => {
    const sshd = await startSshd()
    const { home } = tempHome()
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      await expect(service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toThrow(/no usable authentication method/)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('maps connect, timeout, abort, and handshake-close failures', async () => {
    const dummyKey = generateKeyPair()
    const { home } = tempHome(dummyKey.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 3000 })
    try {
      await expect(service.connect({ host: '127.0.0.1', port: 1, user: 'test' }))
        .rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
      const closer = await startClosingListener()
      try {
        await expect(service.connect({ host: '127.0.0.1', port: closer.port, user: 'test' }))
          .rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
      } finally {
        await closer.close()
      }
      // A graceful FIN before the handshake completes reaches the close path.
      const finisher = await startNetListener(socket => socket.end())
      try {
        await expect(service.connect({ host: '127.0.0.1', port: finisher.port, user: 'test' }))
          .rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
      } finally {
        await finisher.close()
      }
      const silent = await startSilentListener()
      try {
        await expect(service.connect({ host: '127.0.0.1', port: silent.port, user: 'test' }, { timeoutMs: 300 }))
          .rejects.toMatchObject({ code: 'SSH_TIMEOUT' })
      } finally {
        await silent.close()
      }
      const controller = new AbortController()
      controller.abort()
      await expect(service.connect({ host: '127.0.0.1', port: 1, user: 'test' }, { signal: controller.signal }))
        .rejects.toMatchObject({ code: 'SSH_ABORTED' })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('aborts a connect with a live signal and survives a TOFU write failure', async () => {
    const sshd = await startSshd()
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      // Live signal aborting mid-handshake (silent listener never responds).
      const silent = await startSilentListener()
      try {
        const controller = new AbortController()
        const attempt = service.connect({ host: '127.0.0.1', port: silent.port, user: 'test' }, {
          timeoutMs: 5000,
          signal: controller.signal,
        })
        setTimeout(() =>{  controller.abort() }, 150)
        await expect(attempt).rejects.toMatchObject({ code: 'SSH_ABORTED' })
      } finally {
        await silent.close()
      }
      // TOFU write failure (known_hosts is read-only) must not block connect.
      const knownHosts = join(home, 'known_hosts')
      writeFileSync(knownHosts, '', { mode: 0o400 })
      chmodSync(knownHosts, 0o400)
      const { ctx: ctx2, ssh: service2 } = await makeService({ homeDir: home, knownHostsPath: knownHosts, timeoutMs: 5000 })
      try {
        const world = await service2.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
        await service2.disconnect(world.id)
      } finally {
        await ctx2.fiber.dispose()
      }
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('opens a pty shell channel and exchanges interactive I/O', async () => {
    const sshd = await startSshd()
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      const handle = await world.pty({ rows: 24, cols: 80, env: { DSH_TEST: 'pty' } })
      expect(String(handle.channel)).toBeTruthy()
      const channel = handle.channel as {
        write(text: string): void
        on(event: 'data', cb: (data: Buffer) => void): void
        end(): void
      }
      const output: string[] = []
      channel.on('data', (data: Buffer) => { output.push(data.toString()) })
      channel.write('hello\n')
      // Let the echo round-trip land.
      await new Promise<void>(resolve => setTimeout(resolve, 100))
      channel.end()
      await world.dispose()
      expect(output.join('')).toContain('HELLO')
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('rejects pty on a disposed or disconnected world', async () => {
    const sshd = await startSshd()
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      await world.dispose()
      await expect(world.pty()).rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('rejects pty when the server refuses the pty request', async () => {
    const sshd = await startSshd({ noPty: true })
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      await expect(world.pty()).rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('rejects sftp when the server does not support the subsystem', async () => {
    const sshd = await startSshd({ noSftp: true })
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      await expect(world.sftp()).rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('resolves config aliases and ProxyJump chains through ~/.ssh/config', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    // A forwarding jump server: authenticates the same key and pipes
    // direct-tcpip requests to the final sshd.
    const userBlob = publicBlob(sshd.userKeyPair)
    const hostKeyPair = generateKeyPair()
    const forwarder = new Server({ hostKeys: [hostKeyPair.private] }, (client: ServerConnection) => {
      client.on('authentication', (ctx) => {
        if (ctx.method === 'publickey' && ctx.key !== undefined && ctx.key.data.equals(userBlob)) {
          ctx.accept()
          return
        }
        ctx.reject()
      })
      client.on('ready', () => {})
      client.on('tcpip', (accept) => {
        const stream = accept()
        const target = netConnect(sshd.port, '127.0.0.1')
        stream.pipe(target).pipe(stream)
        stream.on('error', () => {})
        target.on('error', () => {})
      })
      client.on('error', () => {})
    })
    await new Promise<void>(resolve => forwarder.listen(0, '127.0.0.1', () =>{  resolve() }))
    const forwardAddress = forwarder.address()
    if (forwardAddress === null || typeof forwardAddress === 'string') throw new Error('forwarder did not bind')
    writeFileSync(join(ssh, 'config'), [
      'Host final',
      '  HostName 127.0.0.1',
      `  Port ${sshd.port}`,
      '  User test',
      `  ProxyJump test@127.0.0.1:${forwardAddress.port}`,
      '',
    ].join('\n'), { mode: 0o600 })
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: 'final' })
      await expect(world.exec('echo hello')).resolves.toMatchObject({ stdout: 'hello\n' })
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await new Promise<void>(resolve => forwarder.close(() =>{  resolve() }))
      await sshd.close()
    }
  })

  it('chains two ProxyJump hops through two forwarding servers', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    const userBlob = publicBlob(sshd.userKeyPair)
    const makeForwarder = async (targetPort: number): Promise<{ port: number; close: () => Promise<void> }> => {
      const hostKeyPair = generateKeyPair()
      const server = new Server({ hostKeys: [hostKeyPair.private] }, (client: ServerConnection) => {
        client.on('authentication', (ctx) => {
          if (ctx.method === 'publickey' && ctx.key !== undefined && ctx.key.data.equals(userBlob)) { ctx.accept(); return }
          ctx.reject()
        })
        client.on('ready', () => {})
        client.on('tcpip', (accept) => {
          const stream = accept()
          const target = netConnect(targetPort, '127.0.0.1')
          stream.pipe(target).pipe(stream)
          stream.on('error', () => {})
          target.on('error', () => {})
        })
        client.on('error', () => {})
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () =>{  resolve() }))
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('forwarder did not bind')
      return { port: address.port, close: () => new Promise<void>(resolve => server.close(() =>{  resolve() })) }
    }
    const inner = await makeForwarder(sshd.port)
    const outer = await makeForwarder(inner.port)
    writeFileSync(join(ssh, 'config'), [
      'Host final',
      '  HostName 127.0.0.1',
      `  Port ${sshd.port}`,
      '  User test',
      `  ProxyJump test@127.0.0.1:${outer.port}, test@127.0.0.1:${inner.port}`,
      '',
    ].join('\n'), { mode: 0o600 })
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: 'final' }, { signal: new AbortController().signal })
      await expect(world.exec('echo hello')).resolves.toMatchObject({ stdout: 'hello\n' })
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await outer.close()
      await inner.close()
      await sshd.close()
    }
  })

  it('resolves a ProxyJump without an explicit user or port', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    writeFileSync(join(ssh, 'config'), [
      'Host final',
      '  HostName 127.0.0.1',
      `  Port ${sshd.port}`,
      '  User test',
      '  ProxyJump 127.0.0.1',
      '',
    ].join('\n'), { mode: 0o600 })
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      // The hop resolves with defaults and fails to connect (port 22), mapping
      // to the seam vocabulary; the exact code depends on the host's port 22.
      await expect(service.connect({ host: 'final' })).rejects.toBeInstanceOf(SshError)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('rejects a hop with a changed host key', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    const userBlob = publicBlob(sshd.userKeyPair)
    const hostKeyPair = generateKeyPair()
    const forwarder = new Server({ hostKeys: [hostKeyPair.private] }, (client: ServerConnection) => {
      client.on('authentication', (ctx) => {
        if (ctx.method === 'publickey' && ctx.key !== undefined && ctx.key.data.equals(userBlob)) { ctx.accept(); return }
        ctx.reject()
      })
      client.on('ready', () => {})
      client.on('tcpip', (accept) => {
        const stream = accept()
        const target = netConnect(sshd.port, '127.0.0.1')
        stream.pipe(target).pipe(stream)
        stream.on('error', () => {})
        target.on('error', () => {})
      })
      client.on('error', () => {})
    })
    await new Promise<void>(resolve => forwarder.listen(0, '127.0.0.1', () => { resolve() }))
    const address = forwarder.address()
    if (address === null || typeof address === 'string') throw new Error('forwarder did not bind')
    writeFileSync(join(ssh, 'config'), [
      'Host final',
      '  HostName 127.0.0.1',
      `  Port ${sshd.port}`,
      '  User test',
      `  ProxyJump test@127.0.0.1:${address.port}`,
      '',
    ].join('\n'), { mode: 0o600 })
    // Pre-seed a WRONG key for the hop: the hop's verifier must reject it.
    const wrongBlob = publicBlob(generateKeyPair())
    writeFileSync(join(ssh, 'known_hosts'), `[127.0.0.1]:${address.port} ssh-ed25519 ${wrongBlob.toString('base64')}\n`, { mode: 0o600 })
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      await expect(service.connect({ host: 'final' }))
        .rejects.toMatchObject({ code: 'SSH_HOST_KEY_CHANGED' })
    } finally {
      await ctx.fiber.dispose()
      await new Promise<void>(resolve => forwarder.close(() => { resolve() }))
      await sshd.close()
    }
  })

  it('rejects exec when the server does not handle exec requests', async () => {
    const sshd = await startSshd({ noExec: true })
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      await expect(world.exec('echo hi')).rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('falls back to the real home directory when homeDir is unset', async () => {
    const sshd = await startSshd()
    const { ctx, ssh: service } = await makeService({ timeoutMs: 5000 })
    try {
      // No homeDir: the provider reads the real ~/.ssh, so auth fails loudly.
      await expect(service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toBeInstanceOf(SshError)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('uses config IdentityFile entries over the defaults', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    writeFileSync(join(ssh, 'config'), [
      'Host final',
      '  HostName 127.0.0.1',
      `  Port ${sshd.port}`,
      '  User test',
      '  IdentityFile ~/.ssh/id_ed25519',
      '',
    ].join('\n'), { mode: 0o600 })
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: 'final' })
      expect(world.status()).toBe('connected')
      await service.disconnect(world.id)
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('fails the hop chain when a jump server rejects forwarding', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    // A jump server with no tcpip listener rejects direct-tcpip requests.
    const userBlob = publicBlob(sshd.userKeyPair)
    const hostKeyPair = generateKeyPair()
    const bare = new Server({ hostKeys: [hostKeyPair.private] }, (client: ServerConnection) => {
      client.on('authentication', (ctx) => {
        if (ctx.method === 'publickey' && ctx.key !== undefined && ctx.key.data.equals(userBlob)) {
          ctx.accept()
          return
        }
        ctx.reject()
      })
      client.on('ready', () => {})
      client.on('error', () => {})
    })
    await new Promise<void>(resolve => bare.listen(0, '127.0.0.1', () =>{  resolve() }))
    const address = bare.address()
    if (address === null || typeof address === 'string') throw new Error('bare server did not bind')
    writeFileSync(join(ssh, 'config'), [
      'Host final',
      '  HostName 127.0.0.1',
      `  Port ${sshd.port}`,
      '  User test',
      `  ProxyJump 127.0.0.1:${address.port}`,
      '',
    ].join('\n'), { mode: 0o600 })
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      await expect(service.connect({ host: 'final' }))
        .rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
    } finally {
      await ctx.fiber.dispose()
      await new Promise<void>(resolve => bare.close(() =>{  resolve() }))
      await sshd.close()
    }
  })

  it('maps config and known_hosts read failures to SSH_CONFIG_ERROR', async () => {
    const sshd = await startSshd()
    const { home, ssh } = tempHome(sshd.userKeyPair.private)
    const dirConfig = await makeService({ homeDir: home, configPath: ssh, timeoutMs: 5000 })
    try {
      await expect(dirConfig.ssh.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toMatchObject({ code: 'SSH_CONFIG_ERROR' })
    } finally {
      await dirConfig.ctx.fiber.dispose()
    }
    const dirKnown = await makeService({ homeDir: home, knownHostsPath: ssh, timeoutMs: 5000 })
    try {
      await expect(dirKnown.ssh.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' }))
        .rejects.toMatchObject({ code: 'SSH_CONFIG_ERROR' })
    } finally {
      await dirKnown.ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('exec and sftp on a disposed world fail with SSH_CONNECT_ERROR', async () => {
    const sshd = await startSshd()
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
      await service.disconnect(world.id)
      await expect(world.exec('echo hi')).rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
      await expect(world.sftp()).rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
      await expect(service.disconnect(world.id)).resolves.toBeUndefined() // unknown id is a no-op
      await world.dispose() // double dispose is a no-op
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })

  it('disposes every live world when the context tears down', async () => {
    const sshd = await startSshd()
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    const world = await service.connect({ host: '127.0.0.1', port: sshd.port, user: 'test' })
    expect(world.status()).toBe('connected')
    await ctx.fiber.dispose()
    expect(world.status()).toBe('closed')
    await sshd.close()
  })

  it('rejects an invalid resolved config', () => {
    expect(() => new Ssh2Service(new Context(), { timeoutMs: 0 })).toThrow(/positive finite/)
    expect(() => new Ssh2Service(new Context(), { timeoutMs: 1000, defaultMaxOutputBytes: -1 })).toThrow(/positive finite/)
  })

  it('surfaces SshError instances unchanged through mapping', async () => {
    const sshd = await startSshd()
    const { home } = tempHome(sshd.userKeyPair.private)
    const { ctx, ssh: service } = await makeService({ homeDir: home, timeoutMs: 5000 })
    try {
      const controller = new AbortController()
      controller.abort()
      const attempt = service.connect({ host: '127.0.0.1', port: 1, user: 'test' }, { signal: controller.signal })
      await expect(attempt).rejects.toMatchObject({ code: 'SSH_ABORTED' })
    } finally {
      await ctx.fiber.dispose()
      await sshd.close()
    }
  })
})
