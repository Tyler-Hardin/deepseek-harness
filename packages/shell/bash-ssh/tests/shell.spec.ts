import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Ssh2Service from '@deepseek-ai/dsh-ssh-client'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import { SshBashExecutor } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import { startSshExecServer, type SshExecFixture } from './ssh-exec-server.ts'

/** A temp home whose `.ssh/id_ed25519` is the fixture's accepted user key. */
function tempHome(fixture: SshExecFixture): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-bash-ssh-home-'))
  const ssh = join(home, '.ssh')
  mkdirSync(ssh, { recursive: true, mode: 0o700 })
  writeFileSync(join(ssh, 'id_ed25519'), fixture.userKeyPrivate, { mode: 0o600 })
  writeFileSync(join(ssh, 'known_hosts'), `[127.0.0.1]:${fixture.port} ssh-ed25519 ${fixture.hostKeyBlob}\n`, { mode: 0o600 })
  return home
}

interface Harness {
  ctx: Context
  world: SshWorld
  shell: SshBashExecutor
}

describe('dsh-bash-ssh', () => {
  let fixture: SshExecFixture
  let harnesses: Harness[] = []
  let fixtures: SshExecFixture[] = []

  beforeEach(async () => {
    fixture = await startSshExecServer()
    fixtures = [fixture]
    harnesses = []
  })

  afterEach(async () => {
    for (const h of harnesses) await h.ctx.fiber.dispose()
    for (const f of fixtures) await f.close()
  })

  async function harness(config: Config = {}, fixtureOverride?: SshExecFixture): Promise<Harness> {
    const target = fixtureOverride ?? fixture
    if (fixtureOverride !== undefined) fixtures.push(fixtureOverride)
    const home = tempHome(target)
    const ctx = new Context()
    await ctx.plugin(Ssh2Service, { homeDir: home, timeoutMs: 5000 })
    const world = await ctx.ssh.connect({ host: '127.0.0.1', port: target.port, user: 'test' })
    const shell = new SshBashExecutor(ctx, {
      pollMs: 30,
      graceMs: 200,
      ...config,
    }, world)
    const h = { ctx, world, shell }
    harnesses.push(h)
    return h
  }

  it('resolves defaults, caps timeouts, and carries passthrough fields', async () => {
    const { shell } = await harness()
    const spec = shell.resolve({ command: 'echo hi' })
    expect(spec.command).toBe('echo hi')
    expect(spec.workdir).toBe('/')
    expect(spec.timeoutMs).toBe(120_000)
    expect(spec.stdoutMaxBytes).toBe(64_000)
    expect(spec.sandboxPolicy).toBeUndefined()

    const capped = shell.resolve({ command: 'x', timeoutMs: 999_999, workdir: '/w' })
    expect(capped.timeoutMs).toBe(600_000)
    expect(capped.workdir).toBe('/w')

    const signal = new AbortController().signal
    const carried = shell.resolve({
      command: 'x',
      signal,
      stdin: 'in',
      env: { A: '1' },
      dshEnv: { DSH_WORKSPACE_ID: 'abc' },
      sandboxPolicy: { mode: 'none' } as never,
      stdoutMaxBytes: 100,
      world: 'world-1',
    })
    expect(carried.signal).toBe(signal)
    expect(carried.stdin).toBe('in')
    expect(carried.env).toEqual({ A: '1' })
    expect(carried.dshEnv).toEqual({ DSH_WORKSPACE_ID: 'abc' })
    expect(carried.sandboxPolicy).toEqual({ mode: 'none' })
    expect(carried.stdoutMaxBytes).toBe(100)
    expect(carried.world).toBe('world-1')
  })

  it('rejects an invalid resolve timeout', async () => {
    const { shell } = await harness()
    expect(() => shell.resolve({ command: 'x', timeoutMs: 0 })).toThrow('bash-ssh: request.timeoutMs')
    expect(() => shell.resolve({ command: 'x', stdoutMaxBytes: -1 })).toThrow('bash-ssh: request.stdoutMaxBytes')
  })

  it('rejects invalid config values at construction', async () => {
    const { ctx, world } = await harness()
    for (const config of [
      { timeoutMs: 0 },
      { maxTimeoutMs: -5 },
      { maxOutputBytes: NaN },
      { pollMs: 0 },
      { graceMs: -1 },
    ]) {
      // Each construction registers the shell service on its own context.
      expect(() => new SshBashExecutor(new Context(), config, world)).toThrow('bash-ssh:')
    }
    expect(ctx).toBeDefined()
  })

  it('runs a foreground command with output, exit code, and stderr', async () => {
    const { shell } = await harness()
    const ok = await shell.run(shell.resolve({ command: 'echo hello' }))
    expect(ok).toMatchObject({ exitCode: 0, timedOut: false, aborted: false, timeoutMs: 120_000 })
    expect(ok.stdout.text).toBe('hello\n')
    expect(ok.stderr.text).toBe('')
    expect(ok.signal).toBeNull()

    const err = await shell.run(shell.resolve({ command: 'echo oops >&2; exit 7' }))
    expect(err.exitCode).toBe(7)
    expect(err.stderr.text).toBe('oops\n')
  })

  it('passes stdin, env, and cwd through to the remote command', async () => {
    const { shell } = await harness()
    const viaStdin = await shell.run(shell.resolve({ command: 'cat', stdin: 'hello-stdin' }))
    expect(viaStdin.stdout.text).toBe('hello-stdin')

    const viaEnv = await shell.run(shell.resolve({ command: 'echo "$FOO"', env: { FOO: 'bar' } }))
    expect(viaEnv.stdout.text).toBe('bar\n')

    const workdir = '/sub'
    mkdirSync(join(fixture.root, workdir), { recursive: true })
    const viaCwd = await shell.run(shell.resolve({ command: 'pwd', workdir }))
    expect(viaCwd.stdout.text.trim()).toBe(join(fixture.root, workdir))
  })

  it('classifies a timeout kill on a held command', async () => {
    const { shell } = await harness()
    const result = await shell.run(shell.resolve({ command: 'sleep 30', timeoutMs: 300 }))
    expect(result).toMatchObject({ timedOut: true, aborted: false, exitCode: null })
  })

  it('classifies an abort kill, including a pre-aborted signal', async () => {
    const { shell } = await harness()
    const controller = new AbortController()
    const inFlight = shell.run(shell.resolve({ command: 'sleep 30', signal: controller.signal }))
    controller.abort()
    expect(await inFlight).toMatchObject({ aborted: true, timedOut: false, exitCode: null })

    const preAborted = new AbortController()
    preAborted.abort()
    const result = await shell.run(shell.resolve({ command: 'sleep 30', signal: preAborted.signal }))
    expect(result).toMatchObject({ aborted: true, exitCode: null })
  })

  it('reports a remote signal kill and maps unknown signals to null', async () => {
    const { shell } = await harness()
    const signalled = await shell.run(shell.resolve({ command: 'killme' }))
    expect(signalled.signal).toBe('SIGKILL')
    expect(signalled.exitCode).toBeNull()

    const weird = await shell.run(shell.resolve({ command: 'weirdsig' }))
    expect(weird.signal).toBeNull()
    expect(weird.exitCode).toBeNull()
  })

  it('truncates foreground output at the combined capture ceiling', async () => {
    const { shell } = await harness({ maxOutputBytes: 32 })
    const result = await shell.run(shell.resolve({ command: 'printf x%.0s $(seq 2000)' }))
    expect(result.stdout.truncated).toBe(true)
    expect(result.stdout.text.length).toBeLessThanOrEqual(32)
  })

  it('rejects run on a world that is not connected', async () => {
    const { shell, world } = await harness()
    await world.dispose()
    await expect(shell.run(shell.resolve({ command: 'echo hi' }))).rejects.toMatchObject({ code: 'SSH_CONNECT_ERROR' })
  })

  it('completes a background process and delivers its output', async () => {
    const { shell } = await harness()
    const proc = shell.start(shell.resolve({ command: 'echo done' }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.exitCode).toBe(0)
    expect(proc.signal).toBeNull()
    expect(proc.readOutput()).toEqual({ delta: 'done\n', lossy: false })
    // A settled process cannot be killed.
    expect(proc.kill()).toBe(false)
  })

  it('delivers background output incrementally', async () => {
    const { shell } = await harness()
    const proc = shell.start(shell.resolve({ command: 'printf one; sleep 1; printf two' }))
    // Wait for the first chunk without consuming the second.
    let delta = ''
    const deadline = Date.now() + 5000
    while (delta === '' && Date.now() < deadline) {
      delta = proc.readOutput().delta
      if (delta === '') await new Promise((resolve) => { setTimeout(resolve, 20) })
    }
    expect(delta).toBe('one')
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.readOutput().delta).toBe('two')
  })

  it('kills a background process group and reports the signal', async () => {
    const { shell } = await harness()
    const proc = shell.start(shell.resolve({ command: 'sleep 30' }))
    expect(proc.kill()).toBe(true)
    await proc.done
    expect(proc.status).toBe('killed')
    expect(proc.exitCode).toBeNull()
    expect(proc.signal).toBe('SIGTERM')
  })

  it('kills a background process when its signal aborts', async () => {
    const { shell } = await harness()
    const controller = new AbortController()
    const proc = shell.start(shell.resolve({ command: 'sleep 30', signal: controller.signal }))
    controller.abort()
    await proc.done
    expect(proc.status).toBe('killed')
    expect(proc.signal).toBe('SIGTERM')
  })

  it('settles a background spawn failure as killed with a note', async () => {
    const { shell, world } = await harness()
    await world.dispose()
    const proc = shell.start(shell.resolve({ command: 'echo hi' }))
    await proc.done
    expect(proc.status).toBe('killed')
    const read = proc.readOutput()
    expect(read.delta).toContain('spawn failed')
    // The note is single-delivery.
    expect(proc.readOutput().delta).toBe('')
  })

  it('settles a background process when the connection is lost', async () => {
    const { shell } = await harness()
    const proc = shell.start(shell.resolve({ command: 'echo started; sleep 30' }))
    // Wait until the launch exec, pid read, and first poll have all run, so
    // the drop lands mid-poll rather than during the launch itself.
    let delta = ''
    const deadline = Date.now() + 5000
    while (delta === '' && Date.now() < deadline) {
      delta = proc.readOutput().delta
      if (delta === '') await new Promise((resolve) => { setTimeout(resolve, 20) })
    }
    expect(delta).toBe('started\n')
    fixture.dropClients()
    await proc.done
    expect(proc.status).toBe('killed')
    expect(proc.readOutput().delta).toContain('connection to the remote host was lost')
  })

  it('bounds background output tails and marks lossy reads', async () => {
    const { shell } = await harness({ maxOutputBytes: 8 })
    const proc = shell.start(shell.resolve({ command: 'printf x%.0s $(seq 100)' }))
    await proc.done
    const read = proc.readOutput()
    expect(read.lossy).toBe(true)
    expect(read.delta.length).toBeLessThanOrEqual(8)
  })

  it('applies env and stderr marking to background output', async () => {
    const { shell } = await harness()
    const proc = shell.start(shell.resolve({ command: 'printf "%s" "$FOO"; echo err >&2', env: { FOO: 'bar' } }))
    await proc.done
    expect(proc.readOutput()).toEqual({ delta: 'bar\n[stderr]\nerr\n', lossy: false })
  })

  it('expands a default ~ runtime root to the remote home', async () => {
    const { shell } = await harness({ runtimeRoot: '~/.dsh-bash' })
    const proc = shell.start(shell.resolve({ command: 'echo hi' }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.readOutput().delta).toBe('hi\n')
  })

  it('uses an absolute runtime root verbatim', async () => {
    const { shell } = await harness({ runtimeRoot: '/rt' })
    const proc = shell.start(shell.resolve({ command: 'echo hi' }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.readOutput().delta).toBe('hi\n')
  })

  it('kills a background process whose signal was already aborted', async () => {
    const { shell } = await harness()
    const controller = new AbortController()
    controller.abort()
    const proc = shell.start(shell.resolve({ command: 'sleep 30', signal: controller.signal }))
    await proc.done
    expect(proc.status).toBe('killed')
  })

  it('retries the pid read while the remote wrapper is slow to publish it', async () => {
    const slow = await startSshExecServer({ launchDelayMs: 300 })
    const { shell } = await harness({}, slow)
    const proc = shell.start(shell.resolve({ command: 'echo hi' }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.readOutput().delta).toBe('hi\n')
  })

  it('reports a high nonzero exit code that is not a signal status', async () => {
    const { shell } = await harness()
    const proc = shell.start(shell.resolve({ command: 'exit 200' }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.exitCode).toBe(200)
    expect(proc.signal).toBeNull()
  })

  it('terminates live background processes at composition disposal', async () => {
    const { ctx, shell } = await harness()
    const proc = shell.start(shell.resolve({ command: 'sleep 30' }))
    await ctx.fiber.dispose()
    await proc.done
    expect(proc.status).toBe('killed')
  })
})
