// Web e2e scenario: the per-workspace default model. The workspace row menu's
// Default model dialog writes an explicit override beside the shared
// agent-default-model entry; a session created in that workspace starts from
// the override; and a composer switch inside an overridden workspace updates
// the override rather than the shared default.
// Zero model calls: the dialog, resolution, and switch are configuration and
// llm-domain traffic only, so there is no fixture and a stray stream would fail
// loud because the adapter registry is empty. Both routes are declared
// host-side through the settings seam (the same way default-model.e2e declares
// them), not through the UI's Models page.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-workspace'
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

  /** The profile patch holding every explicit configuration edit. */
  const patchPath = (): string => join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml')

  /** The one workspace the fresh scaffold connected, resolved from the registry. */
  const workspaceOf = () => {
    const workspace = scaffold.ctx.workspaceRegistry.list()[0]
    if (workspace === undefined) throw new Error('no connected workspace')
    return workspace
  }

  /** Create one session inside the connected workspace through the wire face. */
  const createSession = async (sessionId: string): Promise<string> => {
    const created = await scaffold.ctx.sessionController.create({
      sessionId: SessionId(sessionId),
      workspaceId: workspaceOf().id,
    })
    return created.sessionId
  }

  /** The route the Client derives from the Session projection and Host default. */
  const currentOf = (sessionId: string): Promise<unknown> => {
    const session = scaffold.ctx.sessions.get(SessionId(sessionId))
    if (session === undefined) throw new Error(`session "${sessionId}" is not live`)
    return Promise.resolve(
      scaffold.ctx.sessionProjections.snapshot(session).values.modelSelection?.next
        ?? scaffold.ctx.agentDefaultModel.currentSelection(),
    )
  }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // Two routes so the picker has somewhere to start and somewhere to go.
    // Declared through the settings seam rather than the Models page: this
    // scenario is about the workspace dialog, and the declaring flow is
    // covered by models-settings.e2e.
    await scaffold.ctx.settings.update('llm-pi-ai', {
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
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
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
    // The row's action buttons are hover-revealed (Rows.module.css keeps
    // `.rowActions` hidden until the row is hovered), so the row is hovered the
    // way a user reveals them, re-hovering when a projection update replaces it.
    const title = page.getByText(workspace.title, { exact: true }).first()
    const actions = page.getByRole('button', { name: `工作区“${workspace.title}”的操作` })
    await expect.poll(async () => {
      await title.hover()
      return await actions.isVisible()
    }, { timeout: 15_000 }).toBe(true)
    await actions.click()
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

    // The override landed in this profile's own patch beside the shared default.
    await expect.poll(
      async () => readFile(patchPath(), 'utf8'),
      { timeout: 10_000 },
    ).toContain('workspaceDefaults')
    expect(await readFile(patchPath(), 'utf8')).toContain(`provider: ${ROUTE}`)
    expect(scaffold.ctx.agentDefaultModel.workspaceSelection(workspace.id))
      .toEqual({ provider: ROUTE, model: MODEL })

    // A session created in the workspace after the switch starts from it.
    expect(await currentOf(await createSession('workspace-default-after')))
      .toEqual({ provider: ROUTE, model: MODEL })
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('routes a composer switch to the workspace default instead of the shared one', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-default-model-switch'))
    const workspace = workspaceOf()
    const sharedBefore = scaffold.ctx.agentDefaultModel.currentSelection()

    const trigger = page.getByRole('button', { name: /^选择模型/ })
    await trigger.waitFor({ timeout: 15_000 })
    await trigger.click()
    await page.getByRole('menuitem', { name: /模型/ }).click()
    await page.getByRole('menuitemradio', { name: 'Origin Large' }).click()

    // The workspace override now names the switched route while the shared
    // default keeps the entry it started with.
    await expect.poll(
      async () => scaffold.ctx.agentDefaultModel.workspaceSelection(workspace.id),
      { timeout: 10_000 },
    ).toEqual({ provider: START_ROUTE, model: START_MODEL })
    expect(scaffold.ctx.agentDefaultModel.currentSelection()).toEqual(sharedBefore)
    expect(await readFile(patchPath(), 'utf8')).toContain('workspaceDefaults')

    // A session created afterwards starts from the switched workspace default.
    expect(await currentOf(await createSession('workspace-default-switched')))
      .toEqual({ provider: START_ROUTE, model: START_MODEL })
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
