/**
 * Push registration and delivery: the native client posts its token to
 * `/push/register`, the Host stores it, and run transitions push one structured
 * message each — never Session content, and only once per running→idle edge.
 */
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { PushNotify, assertionBody, messageBody } from '../src/index.ts'

interface Registered { route: WebRoute }
const registered: Registered[] = []

/** Minimal web carrier: capture the route the plugin registers. */
const fakeWebServer = {
  register(route: WebRoute): () => void {
    registered.push({ route })
    return () => { registered.splice(0, registered.length) }
  },
}

/** Fake request carrying one JSON body. */
function request(body: string): import('node:http').IncomingMessage {
  return Readable.from([Buffer.from(body, 'utf8')]) as import('node:http').IncomingMessage
}

/** Fake response capturing status and body. */
function response(): { res: import('node:http').ServerResponse; state: { status?: number; body?: string } } {
  const state: { status?: number; body?: string } = {}
  const res = {
    writeHead(status: number) { state.status = status; return res },
    end(body?: string) { if (body !== undefined) state.body = body },
  } as unknown as import('node:http').ServerResponse
  return { res, state }
}

/** Brand a literal as a Session id, the way producers hand them to events. */
const sid = (value: string): SessionId => value as SessionId

let home: string
let serviceAccountPath: string
let tokenPath: string

beforeEach(async () => {
  registered.length = 0
  home = await mkdtemp(join(tmpdir(), 'push-notify-'))
  serviceAccountPath = join(home, 'service-account.json')
  tokenPath = join(home, 'push', 'device.json')
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  await writeFile(serviceAccountPath, JSON.stringify({
    project_id: 'test-project',
    client_email: 'test@test-project.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }))
})

afterEach(() => { vi.restoreAllMocks() })

async function start() {
  const ctx = new Context()
  ctx.provide('webServer', fakeWebServer as never)
  await ctx.plugin(PushNotify, { serviceAccountPath, tokenPath, enabled: true }).await()
  return { ctx, service: ctx.get('pushNotify') as PushNotify }
}

describe('push-notify', () => {
  it('stores the token the client posts and answers ok', async () => {
    const { ctx } = await start()
    const route = registered[0]!.route
    expect(route).toMatchObject({ kind: 'exact', path: '/push/register' })
    const { res, state } = response()
    await route.handler(request('{"token":"device-token-1"}'), res)
    expect(state.status).toBe(200)
    expect(JSON.parse(state.body ?? '{}')).toEqual({ ok: true })
    expect(JSON.parse(await readFile(tokenPath, 'utf8'))).toEqual({ token: 'device-token-1' })
    await ctx.fiber.dispose()
  })

  it('rejects a body without a token', async () => {
    const { ctx } = await start()
    const { res, state } = response()
    await registered[0]!.route.handler(request('{}'), res)
    expect(state.status).toBe(400)
    await ctx.fiber.dispose()
  })

  it('pushes once on the running to idle transition, and not on repeats', async () => {
    const { ctx, service } = await start()
    const pushed = vi.spyOn(service, 'push').mockResolvedValue()
    ctx.emit('api-session/added', { sessionId: sid('s1'), cwd: '/home/me/projects/dsh', blank: false } as never)
    ctx.emit('api-session/status', sid('s1'), true)
    ctx.emit('api-session/status', sid('s1'), true)
    expect(pushed).not.toHaveBeenCalled()
    ctx.emit('api-session/status', sid('s1'), false)
    expect(pushed).toHaveBeenCalledTimes(1)
    expect(pushed).toHaveBeenCalledWith({ kind: 'finished', sessionId: sid('s1'), sessionLabel: 'dsh' })
    ctx.emit('api-session/status', sid('s1'), false)
    expect(pushed).toHaveBeenCalledTimes(1)
    await ctx.fiber.dispose()
  })

  it('pushes on a run error and on a pending approval', async () => {
    const { ctx, service } = await start()
    const pushed = vi.spyOn(service, 'push').mockResolvedValue()
    ctx.emit('api-session/error', sid('s2'), 'boom')
    expect(pushed).toHaveBeenCalledWith({ kind: 'error', sessionId: sid('s2'), sessionLabel: undefined })
    const fallback = vi.fn(async () => 'rejected' as const)
    const outcome = await ctx.waterfall('approval/request', {
      agent: { session: { id: 's3' } },
    } as never, fallback)
    expect(fallback).toHaveBeenCalled()
    expect(outcome).toBe('rejected')
    expect(pushed).toHaveBeenCalledWith({ kind: 'approval', sessionId: sid('s3'), sessionLabel: undefined })
    await ctx.fiber.dispose()
  })

  it('sends nothing when no device registered yet', async () => {
    const { ctx, service } = await start()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await service.push({ kind: 'finished', sessionId: sid('s4') })
    expect(fetchSpy).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })

  it('posts one FCM message with bearer auth once a token exists', async () => {
    const { ctx, service } = await start()
    await registered[0]!.route.handler(request('{"token":"device-token-2"}'), response().res)
    const calls: { url: string; body: string }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const body = typeof init?.body === 'string' ? init.body : ''
      calls.push({ url, body })
      if (url.startsWith('https://oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'access-1', expires_in: 3600 }), { status: 200 })
      }
      return new Response(JSON.stringify({ name: 'projects/test/messages/1' }), { status: 200 })
    })
    await service.push({ kind: 'error', sessionId: sid('s5'), sessionLabel: 'repo' })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.url).toBe('https://oauth2.googleapis.com/token')
    expect(calls[1]!.url).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send')
    const body = JSON.parse(calls[1]!.body) as { message: { token: string; data: Record<string, string>; android: { priority: string } } }
    expect(body.message).toMatchObject({
      token: 'device-token-2',
      data: { kind: 'error', sessionId: 's5', sessionLabel: 'repo' },
      android: { priority: 'high' },
    })
    // The access token is cached across pushes.
    await service.push({ kind: 'error', sessionId: sid('s6') })
    expect(calls.filter(call => call.url.includes('oauth2'))).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('builds an RS256 assertion and a content-free message body', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const body = assertionBody({
      client_email: 'svc@test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    }, 1000)
    const params = new URLSearchParams(body)
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [header, claims, signature] = (params.get('assertion') ?? '').split('.')
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toMatchObject({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toMatchObject({
      iss: 'svc@test.iam.gserviceaccount.com',
      iat: 1000,
      exp: 4600,
    })
    expect(signature!.length).toBeGreaterThan(0)
    const message = JSON.parse(messageBody('t', { kind: 'finished', sessionId: sid('s1') })) as { message: { data: Record<string, string> } }
    expect(message.message.data).toEqual({ kind: 'finished', sessionId: 's1' })
  })
})
