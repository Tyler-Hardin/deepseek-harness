import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SSH_PTY_HANDLE, SSH_SFTP_HANDLE, SshService, SshWorld } from '../src/index.ts'
import type { SshPtyHandle, SshPtyOptions } from '../src/index.ts'
import type {
  ResolvedSshHost,
  SftpHandle,
  SshConnectOptions,
  SshExecOptions,
  SshExecResult,
  SshStatus,
  SshTarget,
  SshWorldId,
} from '../src/index.ts'

/** Minimal service subclass exercising the abstract contract. */
class FakeService extends SshService {
  async connect(_target: SshTarget, _options?: SshConnectOptions): Promise<SshWorld> {
    return new FakeWorld()
  }

  worlds(): readonly SshWorld[] {
    return []
  }

  async disconnect(_worldId: SshWorldId): Promise<void> {}
}

/** Minimal world subclass exercising the abstract contract. */
class FakeWorld extends SshWorld {
  readonly id = 'world-1' as SshWorldId
  readonly target: SshTarget = { host: 'h' }
  readonly resolved: ResolvedSshHost | null = null

  status(): SshStatus {
    return 'connected'
  }

  async exec(_command: string, _options?: SshExecOptions): Promise<SshExecResult> {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    }
  }

  async sftp(): Promise<SftpHandle> {
    return { [SSH_SFTP_HANDLE]: SSH_SFTP_HANDLE, session: {} }
  }

  async pty(_options?: SshPtyOptions): Promise<SshPtyHandle> {
    return { [SSH_PTY_HANDLE]: SSH_PTY_HANDLE, channel: {} }
  }

  async dispose(): Promise<void> {}
}

describe('ssh Service Definition', () => {
  it('registers the service on its context under the ssh key', async () => {
    const ctx = new Context()
    const service = new FakeService(ctx)
    expect(ctx.ssh).toBeDefined()
    const world = await ctx.ssh.connect({ host: 'h' })
    expect(world.status()).toBe('connected')
    expect((service as { name: string }).name).toBe('ssh')
  })

  it('fake world implements the full abstract contract', async () => {
    const world = new FakeWorld()
    expect(world.status()).toBe('connected')
    expect(world.id).toBe('world-1')
    await expect(world.exec('echo hi')).resolves.toMatchObject({ exitCode: 0 })
    await expect(world.sftp()).resolves.toBeDefined()
    await expect(world.dispose()).resolves.toBeUndefined()
  })
})
