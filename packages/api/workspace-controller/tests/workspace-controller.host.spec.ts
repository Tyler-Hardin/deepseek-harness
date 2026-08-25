import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import WorkspaceController from '../src/index.ts'
import { WorkspaceFeed } from '../src/feed.ts'
import type { WorkspaceFollowFrame } from '../src/types.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'fixture/failure': {}
  }
}

const roots: Context[] = []

/** Workspace roots created per test, removed after their context settles. */
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

async function harness() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-workspace-controller-')))
  tempDirs.push(root)
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)
  const dispose = (): void => {}
  ctx.provide('typert', {
    lookups: { configure: () => dispose },
    contexts: { configureHost: () => dispose },
  } as never)
  const controller = new WorkspaceController(ctx)
  return { controller, ctx, root, storageDomain }
}

function stageDir(root: string, name: string): string {
  const path = join(root, name)
  mkdirSync(path, { recursive: true })
  return path
}

async function nextFrame(
  iterator: AsyncIterator<WorkspaceFollowFrame>,
): Promise<WorkspaceFollowFrame> {
  const next = await iterator.next()
  if (next.done === true) throw new Error('Workspace stream ended before the expected frame')
  return next.value
}

describe('WorkspaceController commands', () => {
  it('serializes concurrent path adoption and preserves an existing title', async () => {
    const { controller, root } = await harness()
    const path = stageDir(root, 'alpha')
    const results = await Promise.all([
      controller.create({ path }),
      controller.create({ path }),
    ])
    const created = results.find(result => result.created)
    const resolved = results.find(result => !result.created)
    expect(created).toMatchObject({ workspace: { path, title: 'alpha' } })
    expect(resolved?.workspace.workspaceId).toBe(created?.workspace.workspaceId)

    const workspaceId = created?.workspace.workspaceId
    if (workspaceId === undefined) throw new Error('fixture did not create a Workspace')
    await controller.rename({ workspaceId, title: 'renamed' })
    await expect(controller.create({ path })).resolves.toMatchObject({
      created: false,
      workspace: { workspaceId, title: 'renamed' },
    })
  })

  it('points the Workspace\'s blank Sessions at a saved default and leaves chosen ones alone', async () => {
    const { controller, ctx, root } = await harness()
    const created = await controller.create({ path: stageDir(root, 'defaults') })
    const workspaceId = created.workspace.workspaceId
    const workspace = ctx.workspaceRegistry.get(workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')
    const blank = ctx.sessions.create(SessionId('blank-session'), { meta: { cwd: created.workspace.path } })
    const chosen = ctx.sessions.create(SessionId('chosen-session'), { meta: { cwd: created.workspace.path } })
    await workspace.attachSession(blank.id)
    await workspace.attachSession(chosen.id)

    const saveWorkspaceSelection = vi.fn(() => Promise.resolve())
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'shared-gateway', model: 'shared-large' }),
      workspaceSelection: () => undefined,
      saveWorkspaceSelection,
    } as never)
    ctx.provide('llm', {
      resolveCallConfig: () => Promise.resolve({ provider: 'acme-gateway', model: 'acme-large' }),
    } as never)
    const snapshot = vi.fn((session: { id: string }) => ({
      values: {
        modelSelection: session.id === 'chosen-session'
          ? { lastUsed: { provider: 'own-gateway', model: 'own-large' }, next: { provider: 'own-gateway', model: 'own-large' } }
          : { lastUsed: null, next: null },
      },
    }))
    ctx.provide('sessionProjections', { snapshot } as never)
    const selectModel = vi.fn(() => Promise.resolve({ selected: { provider: 'acme-gateway', model: 'acme-large' } }))
    ctx.provide('sessionController', { selectModel } as never)

    await controller.setDefaultModel({
      workspaceId,
      selection: { provider: 'acme-gateway', model: 'acme-large' },
    })

    expect(saveWorkspaceSelection).toHaveBeenCalledWith(workspaceId, { provider: 'acme-gateway', model: 'acme-large' })
    expect(selectModel).toHaveBeenCalledTimes(1)
    expect(selectModel).toHaveBeenCalledWith({
      sessionId: blank.id, provider: 'acme-gateway', model: 'acme-large',
    })
  })

  it('adopts a Session that has no registered selection projection yet', async () => {
    const { controller, ctx, root } = await harness()
    const created = await controller.create({ path: stageDir(root, 'defaults-untracked') })
    const workspace = ctx.workspaceRegistry.get(created.workspace.workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')
    const session = ctx.sessions.create(SessionId('untracked-session'), { meta: { cwd: created.workspace.path } })
    await workspace.attachSession(session.id)
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'shared-gateway', model: 'shared-large' }),
      workspaceSelection: () => undefined,
      saveWorkspaceSelection: () => Promise.resolve(),
    } as never)
    ctx.provide('llm', {
      resolveCallConfig: () => Promise.resolve({ provider: 'acme-gateway', model: 'acme-large' }),
    } as never)
    ctx.provide('sessionProjections', { snapshot: () => ({ values: {} }) } as never)
    const selectModel = vi.fn(() => Promise.resolve({ selected: { provider: 'acme-gateway', model: 'acme-large' } }))
    ctx.provide('sessionController', { selectModel } as never)

    await controller.setDefaultModel({
      workspaceId: created.workspace.workspaceId,
      selection: { provider: 'acme-gateway', model: 'acme-large' },
    })

    expect(selectModel).toHaveBeenCalledWith({
      sessionId: session.id, provider: 'acme-gateway', model: 'acme-large',
    })
  })

  it('skips a Workspace Session that is not live', async () => {
    const { controller, ctx, root } = await harness()
    const created = await controller.create({ path: stageDir(root, 'defaults-cold') })
    const workspace = ctx.workspaceRegistry.get(created.workspace.workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')
    const session = ctx.sessions.create(SessionId('cold-session'), { meta: { cwd: created.workspace.path } })
    await workspace.attachSession(session.id)
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'shared-gateway', model: 'shared-large' }),
      workspaceSelection: () => undefined,
      saveWorkspaceSelection: () => Promise.resolve(),
    } as never)
    ctx.provide('llm', {
      resolveCallConfig: () => Promise.resolve({ provider: 'acme-gateway', model: 'acme-large' }),
    } as never)
    const selectModel = vi.fn(() => Promise.resolve({ selected: { provider: 'acme-gateway', model: 'acme-large' } }))
    ctx.provide('sessionController', { selectModel } as never)
    vi.spyOn(ctx.sessions, 'get').mockReturnValue(undefined)

    await controller.setDefaultModel({
      workspaceId: created.workspace.workspaceId,
      selection: { provider: 'acme-gateway', model: 'acme-large' },
    })

    expect(selectModel).not.toHaveBeenCalled()
  })

  it('keeps serving a saved default when no Session Controller is mounted', async () => {
    const { controller, ctx, root } = await harness()
    const created = await controller.create({ path: stageDir(root, 'defaults-unmounted') })
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'shared-gateway', model: 'shared-large' }),
      workspaceSelection: () => undefined,
      saveWorkspaceSelection: () => Promise.resolve(),
    } as never)
    ctx.provide('llm', {
      resolveCallConfig: () => Promise.resolve({ provider: 'acme-gateway', model: 'acme-large' }),
    } as never)

    await expect(controller.setDefaultModel({
      workspaceId: created.workspace.workspaceId,
      selection: { provider: 'acme-gateway', model: 'acme-large' },
    })).resolves.toEqual({ saved: true })
  })

  it('clearing a default leaves the Workspace Sessions untouched', async () => {
    const { controller, ctx, root } = await harness()
    const created = await controller.create({ path: stageDir(root, 'defaults-cleared') })
    const workspace = ctx.workspaceRegistry.get(created.workspace.workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')
    const session = ctx.sessions.create(SessionId('cleared-session'), { meta: { cwd: created.workspace.path } })
    await workspace.attachSession(session.id)
    const saveWorkspaceSelection = vi.fn(() => Promise.resolve())
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'shared-gateway', model: 'shared-large' }),
      workspaceSelection: () => ({ provider: 'acme-gateway', model: 'acme-large' }),
      saveWorkspaceSelection,
    } as never)
    const selectModel = vi.fn(() => Promise.resolve({ selected: { provider: 'shared-gateway', model: 'shared-large' } }))
    ctx.provide('sessionProjections', { snapshot: () => ({ values: { modelSelection: { lastUsed: null, next: null } } }) } as never)
    ctx.provide('sessionController', { selectModel } as never)

    await controller.setDefaultModel({ workspaceId: created.workspace.workspaceId, selection: null })

    expect(saveWorkspaceSelection).toHaveBeenCalledWith(created.workspace.workspaceId, null)
    expect(selectModel).not.toHaveBeenCalled()
  })

  it('keeps the saved default when one Session refuses to adopt it', async () => {
    const { controller, ctx, root } = await harness()
    const created = await controller.create({ path: stageDir(root, 'defaults-refused') })
    const workspace = ctx.workspaceRegistry.get(created.workspace.workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')
    const session = ctx.sessions.create(SessionId('refusing-session'), { meta: { cwd: created.workspace.path } })
    await workspace.attachSession(session.id)
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'shared-gateway', model: 'shared-large' }),
      workspaceSelection: () => undefined,
      saveWorkspaceSelection: () => Promise.resolve(),
    } as never)
    ctx.provide('llm', {
      resolveCallConfig: () => Promise.resolve({ provider: 'acme-gateway', model: 'acme-large' }),
    } as never)
    ctx.provide('sessionProjections', { snapshot: () => ({ values: { modelSelection: { lastUsed: null, next: null } } }) } as never)
    ctx.provide('sessionController', {
      selectModel: () => Promise.reject(new Error('session is gone')),
    } as never)
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})

    await expect(controller.setDefaultModel({
      workspaceId: created.workspace.workspaceId,
      selection: { provider: 'acme-gateway', model: 'acme-large' },
    })).resolves.toEqual({ saved: true })

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not adopt the workspace default'))
  })

  it('maps invalid paths, blank names, conflicts, and unknown ids to stable failures', async () => {
    const { controller, root } = await harness()
    const first = await controller.create({ path: stageDir(root, 'first') })
    const second = await controller.create({ path: stageDir(root, 'second') })

    await expect(controller.create({ path: join(root, 'missing') })).rejects.toMatchObject({
      code: 'workspace/invalid-path',
      details: { path: join(root, 'missing') },
    })
    expect(existsSync(join(root, 'missing'))).toBe(false)
    await expect(controller.rename({ workspaceId: first.workspace.workspaceId, title: '  ' }))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await controller.rename({ workspaceId: first.workspace.workspaceId, title: 'occupied' })
    await expect(controller.rename({ workspaceId: second.workspace.workspaceId, title: ' occupied ' }))
      .rejects.toMatchObject({ code: 'workspace/name-conflict' })
    await expect(controller.delete({ workspaceId: 'missing' as WorkspaceId }))
      .rejects.toMatchObject({ code: 'workspace/not-found' })
  })

  it('preserves Remote failures and propagates unexpected registry failures', async () => {
    const { controller, ctx, root } = await harness()
    const remoteFailure = new RemoteError('fixture/failure', 'already mapped', {})
    const resolveByPath = vi.spyOn(ctx.workspaceRegistry, 'resolveByPath')
      .mockRejectedValueOnce(remoteFailure)
      .mockRejectedValueOnce('plain failure')
    await expect(controller.create({ path: stageDir(root, 'remote-failure') }))
      .rejects.toBe(remoteFailure)
    const plainFailure = controller.create({ path: stageDir(root, 'plain-failure') })
    await expect(plainFailure).rejects.toMatchObject({ code: 'workspace/invalid-path' })
    await expect(plainFailure).rejects.toThrow('plain failure')
    resolveByPath.mockRestore()

    const created = await controller.create({ path: stageDir(root, 'created') })
    const workspace = ctx.workspaceRegistry.get(created.workspace.workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')

    const orderFailure = new Error('order storage failed')
    vi.spyOn(ctx.workspaceRegistry, 'insertBefore').mockRejectedValueOnce(orderFailure)
    await expect(controller.insertBefore({ workspaceId: created.workspace.workspaceId }))
      .rejects.toBe(orderFailure)

    const moveFailure = new Error('membership storage failed')
    vi.spyOn(workspace, 'insertSessionBefore').mockRejectedValueOnce(moveFailure)
    await expect(controller.insertSessionBefore({
      workspaceId: created.workspace.workspaceId,
      sessionId: SessionId('session'),
    })).rejects.toBe(moveFailure)

    const archiveFailure = new Error('archive storage failed')
    vi.spyOn(ctx.workspaceRegistry, 'archiveSession').mockRejectedValueOnce(archiveFailure)
    await expect(controller.archiveSession({ sessionId: SessionId('session') }))
      .rejects.toBe(archiveFailure)
  })

  it('resolves queued Workspace identities when their operation starts', async () => {
    const { controller, ctx, root } = await harness()
    const target = await controller.create({ path: stageDir(root, 'target') })
    const blockerPath = stageDir(root, 'blocker')
    const gate = deferred<undefined>()
    const originalResolveByPath = ctx.workspaceRegistry.resolveByPath.bind(ctx.workspaceRegistry)
    const resolveByPath = vi.spyOn(ctx.workspaceRegistry, 'resolveByPath')
    resolveByPath.mockImplementationOnce(async (path) => {
      await gate.promise
      return originalResolveByPath(path)
    })

    const blocker = controller.create({ path: blockerPath })
    const deletion = controller.delete({ workspaceId: target.workspace.workspaceId })
    const staleRename = controller.rename({
      workspaceId: target.workspace.workspaceId,
      title: 'must-not-land',
    })
    gate.resolve(undefined)
    await blocker
    await expect(deletion).resolves.toEqual({ deleted: true })
    await expect(staleRename).rejects.toMatchObject({ code: 'workspace/not-found' })
  })

  it('reorders Workspaces and Sessions and archives only known Sessions', async () => {
    const { controller, ctx, root } = await harness()
    const first = await controller.create({ path: stageDir(root, 'first') })
    const second = await controller.create({ path: stageDir(root, 'second') })
    await expect(controller.insertBefore({
      workspaceId: first.workspace.workspaceId,
      beforeWorkspaceId: second.workspace.workspaceId,
    })).resolves.toEqual({
      workspaceIds: [first.workspace.workspaceId, second.workspace.workspaceId],
    })
    await expect(controller.insertBefore({ workspaceId: 'missing' as WorkspaceId }))
      .rejects.toMatchObject({ code: 'workspace/not-found' })

    const session = ctx.sessions.create(SessionId('session-one'), {
      meta: { cwd: first.workspace.path },
    })
    const workspace = ctx.workspaceRegistry.get(first.workspace.workspaceId)
    if (workspace === undefined) throw new Error('fixture Workspace disappeared')
    await workspace.attachSession(session.id)
    await expect(controller.insertSessionBefore({
      workspaceId: first.workspace.workspaceId,
      sessionId: session.id,
    })).resolves.toMatchObject({ workspace: { sessionIds: [session.id] } })
    await expect(controller.insertSessionBefore({
      workspaceId: first.workspace.workspaceId,
      sessionId: SessionId('missing-session'),
    })).rejects.toMatchObject({ code: 'workspace/move-invalid' })
    await expect(controller.insertSessionBefore({
      workspaceId: first.workspace.workspaceId,
      sessionId: session.id,
      beforeSessionId: SessionId('missing-anchor'),
    })).rejects.toMatchObject({
      code: 'workspace/move-invalid',
      details: { beforeSessionId: 'missing-anchor' },
    })
    await expect(controller.insertSessionBefore({
      workspaceId: 'missing' as WorkspaceId,
      sessionId: session.id,
    })).rejects.toMatchObject({ code: 'workspace/not-found' })

    await expect(controller.archiveSession({ sessionId: session.id }))
      .resolves.toEqual({ archivedSessionIds: [session.id] })
    await expect(controller.archiveSession({ sessionId: SessionId('unknown') }))
      .rejects.toMatchObject({ code: 'session/not-found' })
  })
})

describe('WorkspaceController follow', () => {
  it('seeds a new feed from existing rows and rejects an inconsistent registry commit', async () => {
    const { ctx, root } = await harness()
    const existing = await ctx.workspaceRegistry.create(stageDir(root, 'existing'))
    const feed = new WorkspaceFeed(ctx)
    expect(feed.baseline()).toMatchObject({
      items: [{ workspaceId: existing.id }],
    })

    expect(() => {
      ctx.emit('domain/changed', {
        domain: 'workspace',
        table: '',
        key: '',
        operation: 'put',
        value: {
          initialized: true,
          workspaceIds: ['missing'],
          archivedSessionIds: [],
        },
      })
    }).toThrow('references missing Workspace "missing"')
  })

  it('starts with a complete baseline and emits committed increments in domain order', async () => {
    const { controller, ctx, root } = await harness()
    const abort = new AbortController()
    const iterator = controller.follow(abort.signal)[Symbol.asyncIterator]()
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'baseline',
      value: { items: [], archivedSessionIds: [] },
    })

    const first = await controller.create({ path: stageDir(root, 'first') })
    await expect(nextFrame(iterator)).resolves.toMatchObject({
      type: 'upsert', workspace: { workspaceId: first.workspace.workspaceId },
    })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'order', workspaceIds: [first.workspace.workspaceId],
    })
    await controller.rename({ workspaceId: first.workspace.workspaceId, title: 'renamed' })
    await expect(nextFrame(iterator)).resolves.toMatchObject({
      type: 'upsert', workspace: { title: 'renamed' },
    })

    const second = await controller.create({ path: stageDir(root, 'second') })
    await expect(nextFrame(iterator)).resolves.toMatchObject({
      type: 'upsert', workspace: { workspaceId: second.workspace.workspaceId },
    })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'order', workspaceIds: [second.workspace.workspaceId, first.workspace.workspaceId],
    })
    await controller.insertBefore({
      workspaceId: first.workspace.workspaceId,
      beforeWorkspaceId: second.workspace.workspaceId,
    })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'order',
      workspaceIds: [first.workspace.workspaceId, second.workspace.workspaceId],
    })

    const session = ctx.sessions.create(SessionId('archived'), {
      meta: { cwd: first.workspace.path },
    })
    await controller.archiveSession({ sessionId: session.id })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'archived', archivedSessionIds: [session.id],
    })
    await controller.delete({ workspaceId: second.workspace.workspaceId })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'order', workspaceIds: [first.workspace.workspaceId],
    })
    await expect(nextFrame(iterator)).resolves.toEqual({
      type: 'remove', workspaceId: second.workspace.workspaceId,
    })

    abort.abort()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
  })

  it('ignores unrelated domain writes and closes active followers on disposal', async () => {
    const { controller, ctx, root } = await harness()
    const abort = new AbortController()
    const iterator = controller.follow(abort.signal)[Symbol.asyncIterator]()
    await nextFrame(iterator)
    ctx.emit('domain/changed', {
      domain: 'other', table: 'records', key: 'x', operation: 'put', value: {},
    })
    ctx.emit('domain/changed', {
      domain: 'workspace', table: '', key: '', operation: 'deleted',
    })
    ctx.emit('domain/changed', {
      domain: 'workspace', table: 'other', key: 'x', operation: 'put', value: {},
    })
    ctx.emit('domain/changed', {
      domain: 'workspace', table: 'workspaces', key: 'unknown', operation: 'deleted',
    })
    const pending = iterator.next()
    const created = await controller.create({ path: stageDir(root, 'visible') })
    await expect(pending).resolves.toMatchObject({ value: { type: 'upsert' } })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'order', workspaceIds: [created.workspace.workspaceId] },
    })

    const closing = iterator.next()
    await ctx.fiber.dispose()
    roots.splice(roots.indexOf(ctx), 1)
    await expect(closing).resolves.toEqual({ done: true, value: undefined })
  })
})
