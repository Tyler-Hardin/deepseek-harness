import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory, ModelSelection as AgentModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions, LlmModelInfo, LlmProviderInfo,
  LlmResolvedModelInfo, StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionTitleService from '@deepseek-ai/dsh-session-title'
import * as FirstMessageTitleProvider from '@deepseek-ai/dsh-session-title-first-prompt-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Storage from '@deepseek-ai/dsh-storage'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { DirectoryPickerError } from '@deepseek-ai/dsh-host-directory-picker'
import type { DirectoryPickerCapability } from '@deepseek-ai/dsh-host-directory-picker'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { HostFrame, WorkspaceId } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import type { ApiProxyDefaults } from '@deepseek-ai/dsh-host-apiproxy'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

let nextRpc = 1

function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`workspace-${String(nextRpc++)}`), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

async function nextHostFrame(
  stream: AsyncIterator<RpcRequest<HostFrame>>,
): Promise<RpcRequest<HostFrame>> {
  const next = await stream.next()
  if (next.done === true) throw new Error('Host stream ended before the expected increment')
  return next.value
}

function stubAgent(session: Session): Agent {
  return {
    id: session.id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** Compose the API over real Session, Agent, Storage, Domain, and Workspace services. */
async function harness(
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-apiproxy-workspace-'))),
  picker: DirectoryPickerCapability = { kind: 'native', pick: async () => null },
  extras: {
    openPath?: (path: string, signal: AbortSignal) => Promise<void>
    canOpenPath?: () => boolean
  } = {},
  modelDefaults: Partial<Pick<
    ApiProxyDefaults,
    'defaultModelSelection' | 'saveDefaultModelSelection' | 'workspaceModelSelection' | 'saveWorkspaceModelSelection'
  >> = {},
) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)

  const factory: AgentFactory = {
    async createAgent(_ownerCtx, options) {
      const session = ctx.sessions.create(
        options.sessionId,
        options.meta === undefined ? {} : { meta: options.meta },
      )
      const agent = stubAgent(session)
      const unregister = ctx.agents.register(agent)
      return {
        agent,
        dispose: () => {
          unregister()
          return Promise.resolve()
        },
      }
    },
    async resume() {
      throw new Error('test harness has no persisted sessions')
    },
  }
  ctx.agents.setFactory(factory)
  // Structural picker fake: the gateway only reads capability(); a stable
  // object per harness mirrors the seam's stability contract.
  ctx.provide('directoryPicker', { capability: () => picker } as never)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: root,
    ...extras.openPath === undefined ? {} : { openPath: extras.openPath },
    ...extras.canOpenPath === undefined ? {} : { canOpenPath: extras.canOpenPath },
    ...modelDefaults,
  })
  return { api, ctx, storageDomain, root }
}

/** Minimal adapter covering one provider so route validation has a target. */
class TestAdapter extends LlmAdapter {
  constructor(private readonly provider: string, private readonly models: readonly string[]) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: provider }
  }

  override listModels(): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.models.map(id => ({ provider: this.provider, id, name: id })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    // Route-validation tests never enter provider streaming.
  }
}

/** In-memory per-workspace default store behind the two workspace hooks. */
function workspaceDefaultStore() {
  const store = new Map<string, AgentModelSelection>()
  return {
    store,
    workspaceModelSelection: (workspaceId: WorkspaceId): AgentModelSelection | undefined =>
      store.get(String(workspaceId)),
    saveWorkspaceModelSelection: async (
      workspaceId: WorkspaceId,
      selection: AgentModelSelection | null,
    ): Promise<void> => {
      if (selection === null) store.delete(String(workspaceId))
      else store.set(String(workspaceId), selection)
    },
  }
}

/** Stage one directory under the harness root for path adoption. */
function stageDir(root: string, name: string): string {
  const path = join(root, name)
  mkdirSync(path)
  return path
}

describe('host.pickDirectory', () => {
  it('returns a selected path or explicit cancellation from the native capability', async () => {
    const selected = await harness(undefined, { kind: 'native', pick: async () => '/tmp/project' })
    expect((await selected.api.host.pickDirectory(request({}), new AbortController().signal)).result)
      .toEqual({ ok: true, value: { path: '/tmp/project' } })

    const cancelled = await harness(undefined, { kind: 'native', pick: async () => null })
    expect((await cancelled.api.host.pickDirectory(request({}), new AbortController().signal)).result)
      .toEqual({ ok: true, value: { path: null } })
  })

  it('propagates abort into the native capability as a cancelled RPC error', async () => {
    const { api } = await harness(undefined, {
      kind: 'native',
      pick: signal => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      }),
    })
    const abort = new AbortController()
    const pending = api.host.pickDirectory(request({}), abort.signal)
    abort.abort()
    expect((await pending).result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })

  it('folds a non-abort native-chooser failure into an internal error', async () => {
    const { api } = await harness(undefined, { kind: 'native', pick: async () => { throw new Error('no chooser installed') } })
    const response = await api.host.pickDirectory(request({}), new AbortController().signal)
    expect(response.result).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('refuses the native RPC under a browse composition', async () => {
    const { api } = await harness(undefined, BROWSE_STUB)
    const response = await api.host.pickDirectory(request({}), new AbortController().signal)
    expect(response.result).toMatchObject({
      ok: false,
      error: { code: 'directory-picker-unavailable', details: { capability: 'browse' } },
    })
  })
})

/** Canned browse capability: one listing, one created path, typed failures on demand. */
const BROWSE_STUB: DirectoryPickerCapability = {
  kind: 'browse',
  list: async (path) => {
    if (path === '/denied') throw new DirectoryPickerError('directory-unreadable', '/denied', 'cannot list /denied')
    const target = path ?? '/home/user'
    return {
      path: target,
      home: '/home/user',
      crumbs: [{ name: '/', path: '/', hidden: false }],
      entries: [{ name: 'projects', path: `${target}/projects`, hidden: false }],
      truncated: false,
    }
  },
  createDirectory: async (path, name) => {
    if (name === 'taken') throw new DirectoryPickerError('directory-exists', `${path}/${name}`, 'already exists')
    if (name === 'unwritable') throw new Error('disk detached')
    return `${path}/${name}`
  },
}

describe('host.listDirectory / host.createDirectory', () => {
  it('serves listings and creation through the browse capability, defaulting to home', async () => {
    const { api } = await harness(undefined, BROWSE_STUB)
    const home = await api.host.listDirectory(request({}), new AbortController().signal)
    expect(home.result).toMatchObject({ ok: true, value: { path: '/home/user', home: '/home/user' } })
    const listed = await api.host.listDirectory(request({ path: '/home/user/projects' }), new AbortController().signal)
    expect(listed.result).toMatchObject({ ok: true, value: { path: '/home/user/projects' } })
    const created = await api.host.createDirectory(request({ path: '/home/user', name: 'fresh' }))
    expect(created.result).toEqual({ ok: true, value: { path: '/home/user/fresh' } })
  })

  it('maps typed picker failures onto the wire error codes and folds unknown throws to internal', async () => {
    const { api } = await harness(undefined, BROWSE_STUB)
    expect((await api.host.listDirectory(request({ path: '/denied' }), new AbortController().signal)).result).toMatchObject({
      ok: false, error: { code: 'directory-unreadable', details: { path: '/denied' } },
    })
    expect((await api.host.createDirectory(request({ path: '/home/user', name: 'taken' }))).result).toMatchObject({
      ok: false, error: { code: 'directory-exists' },
    })
    expect((await api.host.createDirectory(request({ path: '/home/user', name: 'unwritable' }))).result).toMatchObject({
      ok: false, error: { code: 'internal' },
    })
  })

  it('reports an aborted listing as cancelled, like the other signal-following RPCs', async () => {
    const { api } = await harness(undefined, {
      kind: 'browse',
      list: (_path, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => { reject(new Error('scan aborted')) }, { once: true })
      }),
      createDirectory: async () => '/never',
    })
    const abort = new AbortController()
    const pending = api.host.listDirectory(request({}), abort.signal)
    abort.abort()
    expect((await pending).result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })

  it('refuses the browse RPCs under a native composition', async () => {
    const { api } = await harness()
    expect((await api.host.listDirectory(request({}), new AbortController().signal)).result).toMatchObject({
      ok: false, error: { code: 'directory-picker-unavailable', details: { capability: 'native' } },
    })
    expect((await api.host.createDirectory(request({ path: '/x', name: 'y' }))).result).toMatchObject({
      ok: false, error: { code: 'directory-picker-unavailable', details: { capability: 'native' } },
    })
  })
})

describe('host.openPath', () => {
  it('describes whether this deployment can reach a user-visible native desktop', async () => {
    const visible = await harness(undefined, undefined, { canOpenPath: () => true })
    const headless = await harness(undefined, undefined, { canOpenPath: () => false })
    expect(expectOk(await visible.api.host.describe(request({}))).canOpenPath).toBe(true)
    expect(expectOk(await headless.api.host.describe(request({}))).canOpenPath).toBe(false)
    expect(expectOk(await visible.api.host.describe(request({}))).home).toBe(homedir())
  })

  it('opens through the injected native boundary', async () => {
    const opened: string[] = []
    const { api } = await harness(undefined, undefined, {
      openPath: async (path) => { opened.push(path) },
    })
    expect((await api.host.openPath(request({ path: '/tmp/a.txt' }), new AbortController().signal)).result)
      .toEqual({ ok: true, value: { opened: true } })
    expect(opened).toEqual(['/tmp/a.txt'])
  })

  it('propagates abort into the native boundary as a cancelled RPC error', async () => {
    const { api } = await harness(undefined, undefined, {
      openPath: (_path, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      }),
    })
    const abort = new AbortController()
    const pending = api.host.openPath(request({ path: '/tmp/a.txt' }), abort.signal)
    abort.abort()
    expect((await pending).result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })
})

describe('workspace.create', () => {
  it('serializes concurrent creates of one path into a single registration', async () => {
    const { api, root } = await harness()
    const target = stageDir(root, 'alpha')
    const responses = await Promise.all([
      api.workspace.create(request({ path: target })),
      api.workspace.create(request({ path: target })),
    ])
    const values = responses.map(response => expectOk(response))
    const created = values.find(value => value.created)
    const resolved = values.find(value => !value.created)

    expect(created).toMatchObject({ workspace: { path: target, title: 'alpha' } })
    expect(resolved?.workspace.workspaceId).toBe(created?.workspace.workspaceId)
    expect(expectOk(await api.workspace.list(request({}))).items).toHaveLength(1)
  })

  it('adopts only existing directories', async () => {
    const { api, root } = await harness()
    const existing = stageDir(root, 'existing')
    const first = expectOk(await api.workspace.create(request({ path: existing })))
    const repeated = expectOk(await api.workspace.create(request({ path: existing })))
    expect(first).toMatchObject({ created: true, workspace: { path: existing, title: 'existing' } })
    expect(repeated).toMatchObject({ created: false, workspace: { workspaceId: first.workspace.workspaceId } })

    expectOk(await api.workspace.rename(request({
      workspaceId: first.workspace.workspaceId,
      title: 'renamed-existing',
    })))
    const reopened = expectOk(await api.workspace.create(request({ path: existing })))
    expect(reopened.workspace.title).toBe('renamed-existing')

    const missing = join(root, 'missing')
    const missingResult = await api.workspace.create(request({ path: missing }))
    expect(missingResult.result).toMatchObject({ ok: false, error: { code: 'workspace-invalid-path' } })
    expect(existsSync(missing)).toBe(false)
  })

  it('adopts different paths that derive the same Workspace title', async () => {
    const { api, root } = await harness()
    const first = join(root, 'one', 'project')
    const second = join(root, 'two', 'project')
    mkdirSync(first, { recursive: true })
    mkdirSync(second, { recursive: true })
    const firstResult = expectOk(await api.workspace.create(request({ path: first })))
    const secondResult = expectOk(await api.workspace.create(request({ path: second })))
    expect(firstResult).toMatchObject({
      created: true,
      workspace: { path: first, title: 'project' },
    })
    expect(secondResult).toMatchObject({
      created: true,
      workspace: { path: second, title: 'project' },
    })
    expect(secondResult.workspace.workspaceId).not.toBe(firstResult.workspace.workspaceId)
    expect(expectOk(await api.workspace.list(request({}))).items.map(workspace => workspace.path))
      .toEqual([second, first])
  })

  it('creates an ssh workspace over a probed remote path', async () => {
    const { api, ctx } = await harness()
    const lstat = vi.fn(async () => ({ type: 'directory' }))
    ctx.provide('worlds', {
      resolve: vi.fn(async () => ({ fs: () => ({ lstat }) })),
    } as never)
    const place = { kind: 'ssh' as const, host: 'build.example.com', user: 'ci', port: 2222 }
    const created = expectOk(await api.workspace.create(request({ path: '/srv/project', place })))
    expect(created).toMatchObject({
      created: true,
      workspace: { path: '/srv/project', place, title: 'project' },
    })
    expect(lstat).toHaveBeenCalledWith('/srv/project')
    // The wire projection carries the place.
    expect(expectOk(await api.workspace.list(request({}))).items[0]?.place).toEqual(place)
  })

  it('refuses an ssh workspace whose remote path is missing or not a directory', async () => {
    const { api, ctx } = await harness()
    ctx.provide('worlds', {
      resolve: vi.fn(async () => ({ fs: () => ({ lstat: vi.fn(async () => undefined) }) })),
    } as never)
    const place = { kind: 'ssh' as const, host: 'build.example.com' }
    const missing = await api.workspace.create(request({ path: '/no/such', place }))
    expect(missing.result).toMatchObject({ ok: false, error: { code: 'workspace-invalid-path' } })

    const second = await harness()
    second.ctx.provide('worlds', {
      resolve: vi.fn(async () => ({ fs: () => ({ lstat: vi.fn(async () => ({ type: 'file' })) }) })),
    } as never)
    const notDir = await second.api.workspace.create(request({ path: '/etc/hosts', place }))
    expect(notDir.result).toMatchObject({ ok: false, error: { code: 'workspace-invalid-path' } })
  })
})

describe('workspace.insertBefore', () => {
  it('commits the complete order, streams one order frame, and maps unknown ids', async () => {
    const { api, ctx, root } = await harness()
    const first = expectOk(await api.workspace.create(request({ path: stageDir(root, 'first') }))).workspace
    const second = expectOk(await api.workspace.create(request({ path: stageDir(root, 'second') }))).workspace
    const third = expectOk(await api.workspace.create(request({ path: stageDir(root, 'third') }))).workspace

    const abort = new AbortController()
    const listWorkspaces = vi.spyOn(ctx.workspaceRegistry, 'list')
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    expect(listWorkspaces).toHaveBeenCalledTimes(1)
    const changed = nextHostFrame(stream)
    const reordered = expectOk(await api.workspace.insertBefore(request({
      workspaceId: first.workspaceId,
      beforeWorkspaceId: second.workspaceId,
    })))
    expect(reordered.workspaceIds).toEqual([third.workspaceId, first.workspaceId, second.workspaceId])
    expect(await changed).toMatchObject({
      payload: {
        type: 'host/workspace-order-changed',
        workspaceIds: [third.workspaceId, first.workspaceId, second.workspaceId],
      },
    })
    expect(expectOk(await api.workspace.list(request({}))).items.map(item => item.workspaceId))
      .toEqual(reordered.workspaceIds)

    const missingSource = await api.workspace.insertBefore(request({
      workspaceId: 'missing' as WorkspaceId,
    }))
    expect(missingSource.result).toMatchObject({
      ok: false, error: { code: 'workspace-not-found', details: { workspaceId: 'missing' } },
    })
    const missingAnchor = await api.workspace.insertBefore(request({
      workspaceId: first.workspaceId,
      beforeWorkspaceId: 'missing-anchor' as WorkspaceId,
    }))
    expect(missingAnchor.result).toMatchObject({
      ok: false, error: { code: 'workspace-not-found', details: { workspaceId: 'missing-anchor' } },
    })
    abort.abort()
  })
})

describe('session creation and Workspace membership', () => {
  it('attaches a preallocated idempotent session while cwd-only sessions stay ungrouped', async () => {
    const { api, ctx, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'project') }))).workspace
    const sessionId = SessionId('session-workspace-preallocated')

    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    expect(expectOk(await api.workspace.list(request({}))).items[0]?.sessionIds).toEqual([sessionId])
    expect(ctx.agents.list().filter(agent => agent.id === sessionId)).toHaveLength(1)

    const ungrouped = SessionId('session-cwd-only')
    expectOk(await api.sessions.create(request({ cwd: workspace.path, sessionId: ungrouped })))
    expect(expectOk(await api.workspace.list(request({}))).items[0]?.sessionIds).toEqual([sessionId])
    expect(expectOk(await api.sessions.list(request({}))).items.map(item => item.sessionId)).toContain(ungrouped)

    const conflict = await api.sessions.create(request({ cwd: join(workspace.path, 'other'), sessionId }))
    expect(conflict.result).toMatchObject({
      ok: false,
      error: { code: 'session-conflict', details: { sessionId, existingCwd: workspace.path } },
    })
    const missing = await api.sessions.create(request({
      workspaceId: 'missing-workspace' as WorkspaceId,
      sessionId: SessionId('session-missing-workspace'),
    }))
    expect(missing.result).toMatchObject({ ok: false, error: { code: 'workspace-not-found' } })
  })

  it('retains a published session when attachment fails and repairs it on retry', async () => {
    const { api, ctx, root } = await harness()
    const created = expectOk(await api.workspace.create(request({ path: stageDir(root, 'project') }))).workspace
    const workspace = ctx.workspaceRegistry.list()[0]
    if (workspace === undefined) throw new Error('workspace missing from registry')
    vi.spyOn(workspace, 'attachSession').mockRejectedValueOnce(new Error('simulated write failure'))
    const sessionId = SessionId('session-attach-retry')

    const failed = await api.sessions.create(request({ workspaceId: created.workspaceId, sessionId }))
    expect(failed.result).toMatchObject({
      ok: false,
      error: { code: 'workspace-attach-failed', details: { sessionId, workspaceId: created.workspaceId } },
    })
    expect(ctx.agents.get(sessionId)).toBeDefined()

    expectOk(await api.sessions.create(request({ workspaceId: created.workspaceId, sessionId })))
    expect(expectOk(await api.workspace.list(request({}))).items[0]?.sessionIds).toEqual([sessionId])
  })
})

describe('Host Workspace increments', () => {
  it('projects subagent origin in attached summaries and creation increments', async () => {
    const { api, ctx } = await harness()
    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const pending = nextHostFrame(stream)
    const childId = SessionId('session-subagent-child')

    ctx.sessions.create(childId, {
      meta: {
        cwd: '/tmp',
        parentSession: SessionId('session-parent'),
        origin: 'subagent',
      },
    })

    expect(await pending).toMatchObject({
      payload: {
        type: 'host/session-added',
        sessionId: childId,
        parentSessionId: 'session-parent',
        origin: 'subagent',
      },
    })
    expect(expectOk(await api.sessions.list(request({}))).items).toContainEqual(
      expect.objectContaining({ sessionId: childId, origin: 'subagent' }),
    )
    abort.abort()
  })

  it('streams committed Workspace and Session increments after empty baselines', async () => {
    const { api, root } = await harness()
    expect(expectOk(await api.workspace.list(request({}))).items).toEqual([])
    expect(expectOk(await api.sessions.list(request({}))).items).toEqual([])

    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const workspaceIncrement = nextHostFrame(stream)
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'project') }))).workspace
    expect(await workspaceIncrement).toMatchObject({
      payload: { type: 'host/workspace-changed', workspace: { workspaceId: workspace.workspaceId } },
    })

    const sessionId = SessionId('session-streamed-workspace')
    const pending = nextHostFrame(stream)
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    const increments: HostFrame[] = []
    increments.push((await pending).payload)
    while (increments.length < 2) {
      const next = await stream.next()
      if (next.done === true) throw new Error('Host stream ended before both increments')
      increments.push(next.value.payload)
    }
    expect(increments.find(increment => increment.type === 'host/session-added')).toMatchObject({
      // A just-created session has no events: the frame constantly carries blank:true.
      type: 'host/session-added', sessionId, blank: true, cwd: workspace.path,
    })
    const workspaceChanged = increments.find(
      (increment): increment is Extract<HostFrame, { type: 'host/workspace-changed' }> =>
        increment.type === 'host/workspace-changed',
    )
    expect(workspaceChanged?.workspace.sessionIds).toEqual([sessionId])
    abort.abort()
  })

  it('does not publish a Workspace whose registry-order commit fails', async () => {
    const { api, storageDomain, root } = await harness()
    const domain = storageDomain.get('workspace')
    if (domain === undefined) throw new Error('workspace domain is not open')
    vi.spyOn(domain.global, 'set').mockRejectedValueOnce(new Error('simulated registry order failure'))
    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const next = stream.next()

    const failed = await api.workspace.create(request({ path: stageDir(root, 'ghost') }))
    expect(failed.result.ok).toBe(false)
    expect(expectOk(await api.workspace.list(request({}))).items).toEqual([])
    abort.abort()
    expect(await next).toMatchObject({ done: true })
  })

  it('deletes the registration, keeps its session and folder, and streams one removal', async () => {
    const { api, ctx, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'delete-me') }))).workspace
    const sessionId = SessionId('session-kept-after-workspace-delete')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))

    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const removed = nextHostFrame(stream)
    expectOk(await api.workspace.delete(request({ workspaceId: workspace.workspaceId })))
    expect(await removed).toMatchObject({
      payload: { type: 'host/workspace-removed', workspaceId: workspace.workspaceId },
    })
    expect(expectOk(await api.workspace.list(request({}))).items).toEqual([])
    expect(expectOk(await api.sessions.list(request({}))).items.map(item => item.sessionId)).toContain(sessionId)
    expect(ctx.agents.get(sessionId)).toBeDefined()
    expect(existsSync(workspace.path)).toBe(true)

    const missing = await api.workspace.delete(request({ workspaceId: workspace.workspaceId }))
    expect(missing.result).toMatchObject({
      ok: false,
      error: { code: 'workspace-not-found', details: { workspaceId: workspace.workspaceId } },
    })

    const reregistered = expectOk(await api.workspace.create(request({ path: workspace.path }))).workspace
    expect(reregistered.workspaceId).not.toBe(workspace.workspaceId)
    expect(reregistered.path).toBe(workspace.path)
    expect(reregistered.sessionIds).toEqual([])
    expect(expectOk(await api.sessions.list(request({}))).items.map(item => item.sessionId)).toContain(sessionId)
    abort.abort()
  })

  it('archives a session into the global set, keeps its accounting, and streams the set once', async () => {
    const { api, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'archive-home') }))).workspace
    const sessionId = SessionId('session-to-archive')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    expect(expectOk(await api.workspace.list(request({}))).archivedSessionIds).toEqual([])

    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const changed = nextHostFrame(stream)
    expect(expectOk(await api.workspace.archiveSession(request({ sessionId }))).archivedSessionIds)
      .toEqual([sessionId])
    expect(await changed).toMatchObject({
      payload: { type: 'host/archived-sessions-changed', archivedSessionIds: [sessionId] },
    })

    // Accounting and the session itself are untouched; list re-baselines the set.
    const listed = expectOk(await api.workspace.list(request({})))
    expect(listed.archivedSessionIds).toEqual([sessionId])
    expect(listed.items[0]?.sessionIds).toEqual([sessionId])
    expect(expectOk(await api.sessions.list(request({}))).items.map(item => item.sessionId)).toContain(sessionId)

    // The idempotent repeat emits no second frame: the next observed frame is
    // the workspace-changed of a later attach, not another archive snapshot.
    const after = nextHostFrame(stream)
    expect(expectOk(await api.workspace.archiveSession(request({ sessionId }))).archivedSessionIds)
      .toEqual([sessionId])
    const otherSession = SessionId('session-after-archive')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId: otherSession })))
    expect((await after).payload.type).not.toBe('host/archived-sessions-changed')

    const missing = await api.workspace.archiveSession(request({ sessionId: SessionId('session-ghost') }))
    expect(missing.result).toMatchObject({
      ok: false,
      error: { code: 'session-not-found', details: { sessionId: 'session-ghost' } },
    })
    abort.abort()
  })
})

describe('workspace.defaultModel / workspace.setDefaultModel', () => {
  it('serves the shared default, an empty override, and the advisory catalog', async () => {
    const { api, ctx, root } = await harness()
    ctx.llm.registerAdapter(['acme'], new TestAdapter('acme', ['acme-large', 'acme-plain']))
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'models') }))).workspace

    const view = expectOk(await api.workspace.defaultModel(request({ workspaceId: workspace.workspaceId })))
    expect(view.selection).toBeNull()
    expect(view.shared).toEqual({ provider: 'test', model: 'test-model' })
    expect(view.groups).toEqual([{
      id: 'acme',
      name: 'acme',
      models: [
        { id: 'acme-large', name: 'acme-large' },
        { id: 'acme-plain', name: 'acme-plain' },
      ],
    }])
    expect(view.failures).toEqual([])

    const missing = await api.workspace.defaultModel(request({ workspaceId: 'missing' as WorkspaceId }))
    expect(missing.result).toMatchObject({
      ok: false, error: { code: 'workspace-not-found', details: { workspaceId: 'missing' } },
    })
  })

  it('sets a validated override, reads it back, and clears it back to the shared default', async () => {
    const { api, ctx, root } = await harness(undefined, undefined, {}, workspaceDefaultStore())
    ctx.llm.registerAdapter(['acme'], new TestAdapter('acme', ['acme-large']))
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'override') }))).workspace

    const set = await api.workspace.setDefaultModel(request({
      workspaceId: workspace.workspaceId,
      selection: { provider: 'acme', model: 'acme-large' },
    }))
    expect(set.result).toEqual({ ok: true, value: { selection: { provider: 'acme', model: 'acme-large' } } })
    expect(expectOk(await api.workspace.defaultModel(request({ workspaceId: workspace.workspaceId }))).selection)
      .toEqual({ provider: 'acme', model: 'acme-large' })

    const cleared = await api.workspace.setDefaultModel(request({
      workspaceId: workspace.workspaceId,
      selection: null,
    }))
    expect(cleared.result).toEqual({ ok: true, value: { selection: null } })
    expect(expectOk(await api.workspace.defaultModel(request({ workspaceId: workspace.workspaceId }))).selection)
      .toBeNull()
  })

  it('refuses an unresolvable route and an unknown workspace', async () => {
    const { api, root } = await harness(undefined, undefined, {}, workspaceDefaultStore())
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'refuse') }))).workspace

    const route = await api.workspace.setDefaultModel(request({
      workspaceId: workspace.workspaceId,
      selection: { provider: 'no-such-provider', model: 'no-such-model' },
    }))
    expect(route.result).toMatchObject({
      ok: false, error: { code: 'model-unavailable', details: { provider: 'no-such-provider', model: 'no-such-model' } },
    })
    expect(expectOk(await api.workspace.defaultModel(request({ workspaceId: workspace.workspaceId }))).selection)
      .toBeNull()

    const missing = await api.workspace.setDefaultModel(request({
      workspaceId: 'missing' as WorkspaceId,
      selection: { provider: 'acme', model: 'acme-large' },
    }))
    expect(missing.result).toMatchObject({
      ok: false, error: { code: 'workspace-not-found', details: { workspaceId: 'missing' } },
    })
  })

  it('clears the override when its workspace is deleted', async () => {
    const defaults = workspaceDefaultStore()
    const { api, root } = await harness(undefined, undefined, {}, defaults)
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'delete-default') }))).workspace
    defaults.store.set(String(workspace.workspaceId), { provider: 'acme', model: 'acme-large' })

    expectOk(await api.workspace.delete(request({ workspaceId: workspace.workspaceId })))
    expect(defaults.store.has(String(workspace.workspaceId))).toBe(false)
  })

  it('reports a storage failure to set or clear the override, and keeps a delete successful', async () => {
    const failing = {
      workspaceModelSelection: () => undefined,
      saveWorkspaceModelSelection: async () => { throw new Error('settings disk detached') },
    }
    const { api, ctx, root } = await harness(undefined, undefined, {}, failing)
    ctx.llm.registerAdapter(['acme'], new TestAdapter('acme', ['acme-large']))
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'storage-fail') }))).workspace

    const set = await api.workspace.setDefaultModel(request({
      workspaceId: workspace.workspaceId,
      selection: { provider: 'acme', model: 'acme-large' },
    }))
    expect(set.result).toMatchObject({ ok: false, error: { code: 'internal' } })
    const cleared = await api.workspace.setDefaultModel(request({
      workspaceId: workspace.workspaceId,
      selection: null,
    }))
    expect(cleared.result).toMatchObject({ ok: false, error: { code: 'internal' } })

    // The delete already committed; a failed cleanup is logged, not a failure.
    const deleted = await api.workspace.delete(request({ workspaceId: workspace.workspaceId }))
    expect(deleted.result).toEqual({ ok: true, value: { deleted: true } })
  })
})

describe('per-workspace default model resolution', () => {
  it('derives a blank session in an overridden workspace from the workspace default', async () => {
    const defaults = workspaceDefaultStore()
    const { api, ctx, root } = await harness(undefined, undefined, {}, defaults)
    ctx.llm.registerAdapter(['acme'], new TestAdapter('acme', ['acme-large']))
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'ws-default') }))).workspace
    defaults.store.set(String(workspace.workspaceId), { provider: 'acme', model: 'acme-large' })
    const sessionId = SessionId('session-workspace-default')

    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    const view = expectOk(await api.sessions.models(request({ sessionId })))
    expect(view.current).toEqual({ provider: 'acme', model: 'acme-large' })
  })

  it('falls back to the shared default for an ungrouped session and one in a workspace without an override', async () => {
    const defaults = workspaceDefaultStore()
    const { api, root } = await harness(undefined, undefined, {}, defaults)
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'ws-shared') }))).workspace

    const grouped = SessionId('session-grouped-no-override')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId: grouped })))
    expect(expectOk(await api.sessions.models(request({ sessionId: grouped }))).current)
      .toEqual({ provider: 'test', model: 'test-model' })

    const ungrouped = SessionId('session-ungrouped')
    expectOk(await api.sessions.create(request({ cwd: root, sessionId: ungrouped })))
    expect(expectOk(await api.sessions.models(request({ sessionId: ungrouped }))).current)
      .toEqual({ provider: 'test', model: 'test-model' })
  })

  it('keeps a session with a logged route on its own selection despite the workspace default', async () => {
    const defaults = workspaceDefaultStore()
    const { api, ctx, root } = await harness(undefined, undefined, {}, defaults)
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'ws-logged') }))).workspace
    defaults.store.set(String(workspace.workspaceId), { provider: 'acme', model: 'acme-large' })
    const sessionId = SessionId('session-logged-route')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))

    const session = ctx.sessions.get(sessionId)
    if (session === undefined) throw new Error('session missing from store')
    session.append('request/header', {
      header: { config: { provider: 'test', model: 'test-model' } },
      reason: 'initial',
    })
    expect(expectOk(await api.sessions.models(request({ sessionId }))).current)
      .toEqual({ provider: 'test', model: 'test-model' })
  })

  it('routes a composer switch to the workspace default when one is set, else to the shared default', async () => {
    const defaults = workspaceDefaultStore()
    const saveShared = vi.fn(async (_selection: AgentModelSelection) => {})
    const { api, ctx, root } = await harness(undefined, undefined, {}, {
      ...defaults,
      saveDefaultModelSelection: saveShared,
    })
    ctx.llm.registerAdapter(['acme'], new TestAdapter('acme', ['acme-large', 'acme-plain']))
    const overridden = expectOk(await api.workspace.create(request({ path: stageDir(root, 'ws-switch') }))).workspace
    defaults.store.set(String(overridden.workspaceId), { provider: 'acme', model: 'acme-large' })
    const plain = expectOk(await api.workspace.create(request({ path: stageDir(root, 'ws-plain') }))).workspace

    const inOverridden = SessionId('session-switch-overridden')
    expectOk(await api.sessions.create(request({ workspaceId: overridden.workspaceId, sessionId: inOverridden })))
    const switched = await api.sessions.selectModel(request({
      sessionId: inOverridden,
      provider: 'acme',
      model: 'acme-plain',
    }))
    expect(switched.result).toEqual({
      ok: true,
      value: { selected: { provider: 'acme', model: 'acme-plain' } },
    })
    expect(defaults.store.get(String(overridden.workspaceId))).toEqual({ provider: 'acme', model: 'acme-plain' })
    expect(saveShared).not.toHaveBeenCalled()

    const inPlain = SessionId('session-switch-plain')
    expectOk(await api.sessions.create(request({ workspaceId: plain.workspaceId, sessionId: inPlain })))
    await api.sessions.selectModel(request({ sessionId: inPlain, provider: 'acme', model: 'acme-large' }))
    expect(saveShared).toHaveBeenCalledWith({ provider: 'acme', model: 'acme-large' })
    expect(defaults.store.has(String(plain.workspaceId))).toBe(false)
  })
})

/** Recording adapter that streams one scripted text response per call. */
class StreamingAdapter extends LlmAdapter {
  requests: GenerateOptions[] = []

  constructor(private readonly provider: string, private readonly response: string) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: provider }
  }

  override listModels(): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider: this.provider, id: 'any', name: 'any' }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    for (const chunk of textResponse(this.response)) yield chunk
  }
}

/** Real-loop composition: workspace registry, agent loop, title service, and test adapters. */
async function realHarness(): Promise<{
  ctx: Context
  api: ReturnType<typeof createApiProxy>
  store: Map<string, AgentModelSelection>
  shared: StreamingAdapter
  workspace: StreamingAdapter
  root: string
}> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-apiproxy-workspace-real-')))
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)
  ctx.provide('directoryPicker', { capability: () => ({ kind: 'native', pick: async () => null }) } as never)
  await ctx.plugin(SessionTitleService, {
    fallbackMaxWords: 5,
    fallbackMaxBytes: 40,
    maxTitleBytes: 80,
  })
  await ctx.plugin(FirstMessageTitleProvider, {
    targetWords: 5,
    targetCjkCharacters: 10,
    maxInputBytes: 4_096,
    maxOutputTokens: 64,
    timeoutMs: 60_000,
  })
  const shared = new StreamingAdapter('test', 'shared default reply')
  const workspace = new StreamingAdapter('acme', 'workspace default reply')
  ctx.llm.registerAdapter(['test'], shared)
  ctx.llm.registerAdapter(['acme'], workspace)
  const store = new Map<string, AgentModelSelection>()
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    saveDefaultModelSelection: async () => {},
    workspaceModelSelection: workspaceId => store.get(String(workspaceId)),
    saveWorkspaceModelSelection: async (workspaceId, selection) => {
      if (selection === null) store.delete(String(workspaceId))
      else store.set(String(workspaceId), selection)
    },
    cwd: root,
  })
  return { ctx, api, store, shared, workspace, root }
}

describe('per-workspace default model drives the running request and title route', () => {
  it('runs the first turn and the title dispatch on the workspace default', async () => {
    const { ctx, api, store, shared, workspace, root } = await realHarness()
    try {
      const created = expectOk(await api.workspace.create(request({ path: stageDir(root, 'title-workspace') }))).workspace
      store.set(String(created.workspaceId), { provider: 'acme', model: 'acme-local' })
      const sessionId = SessionId('workspace-default-title')

      expectOk(await api.sessions.create(request({ workspaceId: created.workspaceId, sessionId })))

      const agent = ctx.agents.get(sessionId)
      if (agent === undefined) throw new Error('workspace-default session has no live agent')

      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Summarize the local provider routing.' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      // The main request logged and streamed the workspace default, not the shared default.
      const headerEvent = agent.session.events.find(event => event.type === 'request/header')
      expect(headerEvent?.type).toBe('request/header')
      if (headerEvent?.type !== 'request/header') throw new Error('unreachable')
      expect(headerEvent.data.header.config).toMatchObject({ provider: 'acme', model: 'acme-local' })
      expect(workspace.requests.some(options => options.purpose !== 'session-title')).toBe(true)
      expect(shared.requests).toEqual([])

      // The deferred title dispatch reused the same logged route.
      await vi.waitFor(() => {
        const record = agent.session.events.findLast(event => event.type === 'session/title-llm-request')
        expect(record?.type === 'session/title-llm-request' && record.data.route)
          .toEqual({ provider: 'acme', model: 'acme-local' })
      }, { timeout: 5_000 })
      await vi.waitFor(() => {
        expect(workspace.requests.some(options => options.purpose === 'session-title')).toBe(true)
      }, { timeout: 5_000 })
      expect(agent.session.events.findLast(event => event.type === 'session/title')).toMatchObject({
        type: 'session/title',
        data: {
          source: {
            kind: 'provider',
            provider: 'session-title-first-prompt-llm',
            model: { provider: 'acme', model: 'acme-local' },
          },
        },
      })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
