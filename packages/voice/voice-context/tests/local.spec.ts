import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChildProcess } from 'node:child_process'

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void
type ExecFileMock = (command: string, args: readonly string[], options: object, callback: ExecFileCallback) => void

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn<ExecFileMock>(),
  spawnMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFile: execFileMock, spawn: spawnMock }))
vi.mock('node:os', () => ({
  cpus: vi.fn(() => [{ model: 'core-a' }, { model: 'core-b' }]),
  totalmem: vi.fn(() => 16 * 2 ** 30),
}))

import { LocalSttManager } from '../src/local.ts'
import type { ResolvedConfig } from '../src/config.ts'

function config(): ResolvedConfig {
  return {
    apiKey: '',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
    baseUrl: 'https://api.siliconflow.cn',
    model: 'FunAudioLLM/SenseVoiceSmall',
    language: 'zh',
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 60000,
    localPort: 8080,
    pythonBin: 'python',
    modelRoot: '/tmp/stt-models',
  }
}

/** One execFile answer keyed by the first argument, mirroring the check() probes. */
function mockChecks(map: Record<string, { ok: boolean; output: string }>): void {
  execFileMock.mockImplementation((_command, args, _opts, callback) => {
    const key = args[0] ?? ''
    const answer = map[key] ?? { ok: true, output: '' }
    callback(answer.ok ? null : new Error('probe failed'), answer.output, '')
  })
}

describe('LocalSttManager.run', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    execFileMock.mockReset()
    spawnMock.mockReset()
  })

  it('rejects an unknown subcommand with usage text', async () => {
    const manager = new LocalSttManager(config())
    const result = await manager.run('bogus', new AbortController().signal)
    expect(result).toEqual({ kind: 'error', text: 'Usage: /voice-local [status|install|start|stop]' })
  })

  it('reports hardware, tooling, and server state from status', async () => {
    mockChecks({
      '--version': { ok: true, output: 'Python 3.12.8\n' },
      '--query-gpu=name': { ok: false, output: 'nvidia-smi not found' },
      '-c': { ok: true, output: '' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })))

    const result = await new LocalSttManager(config()).run('status', new AbortController().signal)

    expect(result.kind).toBe('success')
    expect(result.text).toContain('Python: Python 3.12.8')
    expect(result.text).toContain('GPU: none detected')
    expect(result.text).toContain('CPU cores: 2')
    expect(result.text).toContain('RAM: 16.0 GiB')
    expect(result.text).toContain('Local STT dependencies: installed')
    expect(result.text).toContain('Local server: running on 127.0.0.1:8080')
  })

  it('returns an error when install is attempted without Python', async () => {
    mockChecks({ '--version': { ok: false, output: 'not found' } })
    const result = await new LocalSttManager(config()).run('install', new AbortController().signal)
    expect(result.kind).toBe('error')
    expect(result.text).toContain('Python not found')
  })

  it('installs both engines and CPU torch', async () => {
    mockChecks({
      '--version': { ok: true, output: 'Python 3.12.8' },
      '-c': { ok: false, output: 'torch is missing' },
    })

    const result = await new LocalSttManager(config()).run('install', new AbortController().signal)

    expect(result.kind).toBe('success')
    expect(result.text).toContain('Installed local STT dependencies')
    expect(execFileMock).toHaveBeenCalledTimes(5)
    expect(execFileMock.mock.calls[2]?.[1]).toEqual(expect.arrayContaining([expect.stringContaining('requirements.txt')]))
    expect(execFileMock.mock.calls[3]?.[1]).toEqual(expect.arrayContaining([expect.stringContaining('requirements-faster-whisper.txt')]))
    expect(execFileMock.mock.calls[4]?.[1]).toEqual(expect.arrayContaining(['torch', 'torchaudio']))
  })

  it('preserves an existing torch installation', async () => {
    mockChecks({
      '--version': { ok: true, output: 'Python 3.12.8' },
      '-c': { ok: true, output: '' },
    })

    const result = await new LocalSttManager(config()).run('install', new AbortController().signal)

    expect(result.kind).toBe('success')
    expect(execFileMock).toHaveBeenCalledTimes(4)
    expect(execFileMock.mock.calls.flatMap(call => call[1])).not.toContain('https://download.pytorch.org/whl/cpu')
  })

  it('stops installation at the first failed pip command', async () => {
    execFileMock
      .mockImplementationOnce((_command, _args, _opts, callback) => { callback(null, 'Python 3.12.8', '') })
      .mockImplementationOnce((_command, _args, _opts, callback) => { callback(null, '', '') })
      .mockImplementationOnce((_command, _args, _opts, callback) => { callback(new Error('pip failed'), '', 'network unavailable') })

    const result = await new LocalSttManager(config()).run('install', new AbortController().signal)

    expect(result).toEqual({ kind: 'error', text: 'pip install failed:\nnetwork unavailable' })
    expect(execFileMock).toHaveBeenCalledTimes(3)
  })

  it('reports a healthy server as already running on start', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })))
    const result = await new LocalSttManager(config()).run('start', new AbortController().signal)
    expect(result).toEqual({ kind: 'success', text: 'Local server already running on 127.0.0.1:8080.' })
  })

  it('reports no tracked server on stop', async () => {
    const result = await new LocalSttManager(config()).run('stop', new AbortController().signal)
    expect(result).toEqual({ kind: 'success', text: 'No local server is tracked by this process.' })
  })

  it('reports missing python and a stopped server from status', async () => {
    mockChecks({
      '--version': { ok: false, output: 'not found' },
      '--query-gpu=name': { ok: false, output: 'not found' },
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const result = await new LocalSttManager(config()).run('status', new AbortController().signal)

    expect(result.text).toContain('Python: not found')
    expect(result.text).toContain('GPU: none detected')
    expect(result.text).toContain('Local server: not running')
  })

  it('reports incomplete dependencies and a detected GPU from status', async () => {
    mockChecks({
      '--version': { ok: true, output: 'Python 3.12.8' },
      '--query-gpu=name': { ok: true, output: 'NVIDIA GeForce RTX 4090\n' },
      '-c': { ok: false, output: 'torch is missing' },
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const result = await new LocalSttManager(config()).run('status', new AbortController().signal)

    expect(result.text).toContain('GPU: NVIDIA GeForce RTX 4090')
    expect(result.text).toContain('Local STT dependencies: incomplete')
    expect(result.text).toContain('Local server: not running')
  })

  it('returns an error when the launched server never becomes healthy', async () => {
    vi.useFakeTimers()
    spawnMock.mockReturnValue(fakeChild())
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const manager = new LocalSttManager(config())
    const started = manager.run('start', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(31000)
    const result = await started

    expect(result.kind).toBe('error')
    expect(result.text).toContain('/health is not answering')
  })

  it('refuses a second launch while a child is tracked', async () => {
    vi.useFakeTimers()
    spawnMock.mockReturnValue(fakeChild())
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const manager = new LocalSttManager(config())
    const first = manager.run('start', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(31000)
    await first

    const second = await manager.run('start', new AbortController().signal)
    expect(second).toEqual({ kind: 'error', text: 'A local server launch is already tracked; run /voice-local stop first.' })
  })

  it('clears a child that failed to spawn', async () => {
    vi.useFakeTimers()
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const manager = new LocalSttManager(config())
    const first = manager.run('start', new AbortController().signal)
    // Let the health probe settle so the spawn registers its error listener.
    await vi.advanceTimersByTimeAsync(0)
    child.emit('error', new Error('ENOENT'))
    await vi.advanceTimersByTimeAsync(31000)
    await first

    spawnMock.mockClear()
    const secondChild = fakeChild()
    spawnMock.mockReturnValue(secondChild)
    const second = manager.run('start', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(31000)
    await second
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('stops a tracked server', async () => {
    vi.useFakeTimers()
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const manager = new LocalSttManager(config())
    const started = manager.run('start', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(31000)
    await started

    const result = await manager.run('stop', new AbortController().signal)
    expect(child.kill).toHaveBeenCalled()
    expect(result).toEqual({ kind: 'success', text: 'Stopped the local server.' })
  })

  it('clears a child that exited on its own', async () => {
    vi.useFakeTimers()
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const manager = new LocalSttManager(config())
    const first = manager.run('start', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(0)
    child.emit('exit', 0)
    await vi.advanceTimersByTimeAsync(31000)
    await first

    spawnMock.mockClear()
    const secondChild = fakeChild()
    spawnMock.mockReturnValue(secondChild)
    const second = manager.run('start', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(31000)
    await second
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('reports a started server once health answers after launch', async () => {
    vi.useFakeTimers()
    spawnMock.mockReturnValue(fakeChild())
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 })))

    const manager = new LocalSttManager(config())
    const started = manager.run('start', new AbortController().signal)
    // First poll fails (pre-spawn), the spawn happens, then the retry answers.
    await vi.advanceTimersByTimeAsync(1100)
    const result = await started
    expect(result).toEqual({ kind: 'success', text: 'Local STT server started on 127.0.0.1:8080. Point baseUrl at it.' })
  })

  it('dispatches an empty raw input to status', async () => {
    mockChecks({ '--version': { ok: false, output: 'not found' } })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    const result = await new LocalSttManager(config()).run('', new AbortController().signal)
    expect(result.text).toContain('Python: not found')
  })

  it('spawns the server with the configured model root on its environment', async () => {
    vi.useFakeTimers()
    spawnMock.mockReturnValue(fakeChild())
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    const manager = new LocalSttManager(config())
    const started = manager.run('start', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(0)

    expect(spawnMock).toHaveBeenCalledWith(
      'python',
      expect.arrayContaining(['-m', 'uvicorn', 'server:app']),
      expect.objectContaining({
        env: expect.objectContaining({ STT_MODEL_ROOT: '/tmp/stt-models' }),
      }),
    )
    await vi.advanceTimersByTimeAsync(31000)
    await started
  })
})

/** A scriptable stand-in for the spawned child process. */
function fakeChild(): ChildProcess {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), callback])
    }),
    on: vi.fn(),
    kill: vi.fn(() => true),
    emit: (event: string, ...args: unknown[]): void => {
      for (const callback of handlers.get(event) ?? []) callback(...args)
    },
  } as unknown as ChildProcess
}
