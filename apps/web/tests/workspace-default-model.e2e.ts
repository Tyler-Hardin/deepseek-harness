// Web e2e scenario: the per-workspace default model. The workspace row menu's
// Default model dialog writes an explicit override (workspace.setDefaultModel)
// beside the shared agent-default-model section; a session created in that
// workspace starts from the override; and a composer switch inside an
// overridden workspace updates the override rather than the shared default.
// Zero model calls: the dialog, resolution, and switch are settings/llm-domain
// traffic only, so there is no fixture and a stray stream would fail loud
// because the adapter registry is empty. Both routes are declared host-side
// through the settings seam (the same way default-model.e2e declares them),
// not through the UI's Models page.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE, connectFreshWorkspaceZh, saveFailureShot } from './support.ts'

/** Points the shipped shared Agent default at this scenario's own route. */
const OVERLAY = fileURLToPath(new URL('./workspace-default-model.overlay.yml', import.meta.url))

/** The route the shared default starts on (the dialog's "use global" row). */
const START_ROUTE = 'origin-gateway'
const START_MODEL = 'origin-large'
/** The route the dialog picks as this workspace's own default. */
const ROUTE = 'acme-gateway'
const MODEL = 'acme-large'

describe('web e2e: per-workspace default model via the workspace row menu', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  /** The one workspace the fresh scaffold connected, resolved from the registry. */
  const workspaceOf = (): { id: string; title: string } => {
    const workspace = scaffold.ctx.workspaceRegistry.list()[0]
    if (workspace === undefined) throw new Error('no connected workspace')
    return { id: workspace.id, title: workspace.title }
  }

  /** Create one session inside the connected workspace through the wire face. */
  const createSession = async (sessionId: string): Promise<string> => {
    const response = await scaffold.ctx.apiProxy.sessions.create({
      rpcId: `workspace-default-model-create-${sessionId}` as never,
      payload: { sessionId: SessionId(sessionId), workspaceId: workspaceOf().id as never },
    })
    if (!response.result.ok) throw new Error(`session.create failed: ${response.result.error.message}`)
    return response.result.value.sessionId
  }

  /** The route the gateway reports for one session, through the real wire face. */
  const currentOf = async (sessionId: string): Promise<unknown> => {
    const response = await scaffold.ctx.apiProxy.sessions.models({
      rpcId: `workspace-default-model-${sessionId}` as never,
      payload: { sessionId: SessionId(sessionId) },
    })
    if (!response.result.ok) throw new Error(`session.models failed: ${response.result.error.message}`)
    return response.result.value.current
  }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // Two routes so the picker has somewhere to start and somewhere to go.
    // Declared through the settings seam rather than the Models page: this
    // scenario is about the workspace dialog, and the declaring flow is
    // covered by models-settings.e2e.
    await scaffold.ctx.settings.update(settingsNamespace('llm-pi-ai'), {
      providers: {
        [START_ROUTE]: {
          displayName: 'Origin Gateway',
          api: 'openai-completions',
          baseURL: 'https://gateway.origin.example/v1',
          models: [{ id: START_MODEL, name: 'Origin Large' }],
        },
        [ROUTE]: {
          displayName: 'Acme Gateway',
          api: 'openai-completions',
          baseURL: 'https://gateway.acme.example/v1',
          models: [{ id: MODEL, name: 'Acme Large' }],
        },
      },
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('sets a workspace default through the row-menu dialog and new sessions start from it', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-default-model'))
    const workspace = workspaceOf()

    // Row menu → Default model dialog; the global default is preselected.
    const row = page.getByRole('button', { name: `工作区“${workspace.title}”的操作` })
    await row.waitFor({ timeout: 15_000 })
    await row.click()
    await page.getByRole('menuitem', { name: '默认模型' }).click()
    const dialog = page.getByRole('dialog', { name: `“${workspace.title}”的默认模型` })
    await dialog.waitFor({ timeout: 10_000 })
    await expect.poll(async () => {
      const global = dialog.getByRole('radio', { name: /使用全局默认/ })
      return (await global.getAttribute('aria-checked')) === 'true'
    }, { timeout: 10_000 }).toBe(true)

    // Pick the workspace's own model and commit.
    await dialog.getByRole('radio', { name: 'Acme Large' }).click()
    await dialog.getByRole('button', { name: '保存' }).click()
    await expect.poll(async () => page.getByRole('dialog').count(), { timeout: 10_000 }).toBe(0)

    // The override landed in the settings document beside the shared default.
    await expect.poll(
      async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'),
      { timeout: 10_000 },
    ).toContain('workspace-default-model:')
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain(`provider: ${ROUTE}`)
    expect(document).toContain(`model: ${MODEL}`)

    // A session created in the workspace after the switch starts from it.
    expect(await currentOf(await createSession('workspace-default-after')))
      .toEqual({ provider: ROUTE, model: MODEL })
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('routes a composer switch to the workspace default instead of the shared one', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-default-model-switch'))
    const before = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(before).not.toContain('agent-default-model:')

    const trigger = page.getByRole('button', { name: /^选择模型/ })
    await trigger.waitFor({ timeout: 15_000 })
    await trigger.click()
    await page.getByRole('menuitem', { name: /模型/ }).click()
    await page.getByRole('menuitemradio', { name: 'Origin Large' }).click()

    // The workspace override now names the switched route; the shared section
    // is still absent (no user layer — the composition entry keeps serving).
    await expect.poll(
      async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'),
      { timeout: 10_000 },
    ).toContain(`provider: ${START_ROUTE}`)
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('workspace-default-model:')
    expect(document).not.toContain('agent-default-model:')

    // A session created afterwards starts from the switched workspace default.
    expect(await currentOf(await createSession('workspace-default-switched')))
      .toEqual({ provider: START_ROUTE, model: START_MODEL })
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
