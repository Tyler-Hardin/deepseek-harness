/**
 * Firebase Cloud Messaging pushes for Session runs.
 *
 * The native client registers its FCM token over `POST /push/register`; this
 * Host service then pushes one structured message when a run finishes, fails,
 * or starts waiting for the user, so the phone needs neither a socket nor a
 * foreground service. The message carries `kind`, `sessionId`, and the Session
 * title — never Session content — and the client owns the localized wording.
 * @module @deepseek-ai/dsh-api-push-notify
 */

import { createSign } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'

/** Deployment policy for push delivery. */
export interface Config {
  /** Master switch; a deployment without a Firebase project leaves this off. */
  readonly enabled?: boolean
  /** Path of the Firebase service-account JSON used to mint OAuth2 tokens. */
  readonly serviceAccountPath: string
  /** Path of the registered device token, written by the native client. */
  readonly tokenPath: string
  /** OAuth2 token endpoint; overridable for tests. */
  readonly oauthTokenUrl?: string
  /** FCM send endpoint template; `{project}` is replaced with the project id. */
  readonly sendUrlTemplate?: string
}

/** One notification kind the client localizes. */
export type PushKind = 'finished' | 'error' | 'approval' | 'question'

/** Data carried by one push; the client renders the copy. */
export interface PushData {
  /** Why the push was sent. */
  readonly kind: PushKind
  /** Session the notification refers to. */
  readonly sessionId: string
  /** Short human label derived from the Session's working directory, if any. */
  readonly sessionLabel?: string | undefined
}

/** Last path segment of a Session's working directory, for a readable label. */
function labelOf(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined
  const trimmed = cwd.replace(/[/\\]+$/, '')
  const base = trimmed.slice(trimmed.lastIndexOf('/') + 1).slice(trimmed.lastIndexOf('\\') + 1)
  return base.length > 0 ? base : undefined
}

/** OAuth2 token response fields this service reads. */
interface OAuthToken {
  readonly access_token?: string
  readonly expires_in?: number
}

/** Service-account fields this service reads. */
interface ServiceAccount {
  readonly project_id?: string
  readonly client_email?: string
  readonly private_key?: string
}

/** Base64url-encode one JSON or byte value. */
function b64(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

/**
 * Signed JWT assertion for the FCM scope, as a URL-encoded grant body.
 * @param account - service account carrying the client email and private key.
 * @param nowSeconds - issuance time, in Unix seconds (tests pin it).
 * @returns the `application/x-www-form-urlencoded` token-request body.
 */
export function assertionBody(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (account.client_email === undefined || account.private_key === undefined) {
    throw new Error('push-notify: service account is missing client_email or private_key')
  }
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const assertion = `${header}.${claims}.${signer.sign(account.private_key, 'base64url')}`
  return new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString()
}

/**
 * One FCM v1 message body for a registered device token.
 * @param token - device registration token.
 * @param data - reason code, Session id, and optional label; never Session content.
 * @returns the JSON request body for the v1 send endpoint.
 */
export function messageBody(token: string, data: PushData): string {
  return JSON.stringify({
    message: {
      token,
      data: {
        kind: data.kind,
        sessionId: data.sessionId,
        ...(data.sessionLabel === undefined ? {} : { sessionLabel: data.sessionLabel }),
      },
      android: { priority: 'high' },
    },
  })
}

/** Push delivery over Firebase Cloud Messaging. */
export class PushNotify extends Service {
  static inject = ['webServer']

  static Config: z<Config> = z.object({
    enabled: z.boolean().default(true),
    serviceAccountPath: z.string().required(),
    tokenPath: z.string().required(),
    oauthTokenUrl: z.string().default('https://oauth2.googleapis.com/token'),
    sendUrlTemplate: z.string().default('https://fcm.googleapis.com/v1/projects/{project}/messages:send'),
  })

  private readonly config: Required<Config>
  /** Readable labels learned from `api-session/added`, keyed by Session id. */
  private readonly labels = new Map<string, string>()
  /** Sessions whose last observed status was running. */
  private readonly running = new Set<string>()
  private cachedToken: { value: string; expiresAt: number } | undefined

  /**
   * @param ctx - Host context exposing the browser HTTP carrier.
   * @param config - service-account path, token path, and endpoints.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'pushNotify')
    this.config = config as Required<Config>

    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/push/register',
      handler: (request, response) => this.handleRegister(request, response),
    }), 'push-notify: device registration route')

    ctx.on('api-session/added', (summary) => {
      const label = labelOf(summary.cwd)
      if (label !== undefined) this.labels.set(summary.sessionId, label)
    })
    ctx.on('api-session/removed', (sessionId) => {
      this.labels.delete(sessionId)
      this.running.delete(sessionId)
    })
    ctx.on('api-session/status', (sessionId, running) => {
      const was = this.running.has(sessionId)
      if (running) this.running.add(sessionId)
      else this.running.delete(sessionId)
      // Announce only the running→idle transition; status repeats on reconnects.
      if (was && !running) void this.push({ kind: 'finished', sessionId, sessionLabel: this.labels.get(sessionId) })
    })
    ctx.on('api-session/error', (sessionId) => {
      void this.push({ kind: 'error', sessionId, sessionLabel: this.labels.get(sessionId) })
    })
    ctx.on('approval/request', (request, next) => {
      const sessionId = request.agent.session.id
      void this.push({ kind: 'approval', sessionId, sessionLabel: this.labels.get(sessionId) })
      return next()
    })
    ctx.on('user-questions/request', (request, next) => {
      const agent = request.agent
      if (agent !== undefined) {
        const sessionId = agent.session.id
        void this.push({ kind: 'question', sessionId, sessionLabel: this.labels.get(sessionId) })
      }
      return next()
    })
  }

  /**
   * Store the device token the native client posted.
   * @param request - `{ token }` JSON body.
   * @param response - HTTP response.
   */
  private async handleRegister(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse): Promise<void> {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { token?: unknown }
      if (typeof body.token !== 'string' || body.token.length === 0) throw new Error('missing token')
      await mkdir(dirname(this.config.tokenPath), { recursive: true })
      await writeFile(this.config.tokenPath, `${JSON.stringify({ token: body.token })}\n`, { mode: 0o600 })
      this.ctx.logger.info('push-notify: device token registered')
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
    } catch (error) {
      this.ctx.logger.warn(`push-notify: registration rejected: ${error instanceof Error ? error.message : String(error)}`)
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: false }))
    }
  }

  /**
   * Registered device token, when the native client has posted one.
   * @returns the stored token, or undefined before the first registration.
   */
  async deviceToken(): Promise<string | undefined> {
    try {
      const stored = JSON.parse(await readFile(this.config.tokenPath, 'utf8')) as { token?: unknown }
      return typeof stored.token === 'string' && stored.token.length > 0 ? stored.token : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Push one notification to the registered device.
   * @param data - kind, Session id, and title.
   */
  async push(data: PushData): Promise<void> {
    if (!this.config.enabled) return
    const token = await this.deviceToken()
    if (token === undefined) return
    try {
      const account = JSON.parse(await readFile(this.config.serviceAccountPath, 'utf8')) as ServiceAccount
      if (account.project_id === undefined) throw new Error('service account has no project_id')
      const access = await this.accessToken(account)
      const url = this.config.sendUrlTemplate.replace('{project}', account.project_id)
      const response = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
        body: messageBody(token, data),
      })
      if (!response.ok) throw new Error(`FCM ${response.status}: ${(await response.text()).slice(0, 200)}`)
    } catch (error) {
      this.ctx.logger.warn(`push-notify: push failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Mint (and cache) one OAuth2 access token for the FCM scope.
   * @param account - parsed service account.
   * @returns the bearer token.
   */
  private async accessToken(account: ServiceAccount): Promise<string> {
    const now = Date.now()
    if (this.cachedToken !== undefined && this.cachedToken.expiresAt > now) return this.cachedToken.value
    const response = await fetch(this.config.oauthTokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: assertionBody(account),
    })
    if (!response.ok) throw new Error(`OAuth ${response.status}: ${(await response.text()).slice(0, 200)}`)
    const token = await response.json() as OAuthToken
    if (token.access_token === undefined) throw new Error('OAuth response has no access_token')
    // Refresh a minute early so a push never races expiry.
    this.cachedToken = { value: token.access_token, expiresAt: now + ((token.expires_in ?? 3600) - 60) * 1000 }
    return token.access_token
  }
}

export default PushNotify
