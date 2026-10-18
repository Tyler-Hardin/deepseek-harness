// Web e2e scenario: the deployment-wide default model, set from the Models
// settings page's own row. The pick writes the shared `agent-default-model`
// entry, a Session created afterwards starts from it, and the write leaves the
// per-workspace overrides beside it alone — a Workspace that carries its own
// default keeps starting its Sessions from that, which is the tier order the
// gateway resolves on every read.
// Zero model calls: the pick is settings/llm-domain traffic only, so there is
// no fixture and a stray stream would fail loud because the adapter registry is
// empty. Every route is declared host-side (not through the UI, which has its
// own scenario) through the pi-ai adapter the shipped tree already mounts: a
// fixture-less scaffold registers no adapter at all, so the routes the picker
// offers — and the one it must start on — have to come from somewhere, and
// settings profiles are the product's own way to add them.
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
import { connectFreshWorkspaceZh, openSettings, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

/** Points the shipped shared Agent default at this scenario's own route. */
const OVERLAY = fileURLToPath(new URL('./default-model.overlay.yml', import.meta.url))

/** The route the deployment default starts on (the shipped entry's own). */
const START_ROUTE = 'origin-gateway'
const START_MODEL = 'origin-large'
/** The route the first pick stores as the deployment default. */
const PICKED_ROUTE = 'acme-gateway'
const PICKED_MODEL = 'acme-large'
/** The route the second pick stores, so the moved default is never the override. */
const MOVED_ROUTE = 'beta-gateway'
const MOVED_MODEL = 'beta-large'

/** One declared pi-ai route, as the settings profile holds it. */
function route(provider: string, displayName: string, model: string, name: string) {
  return {
    displayName,
    api: 'openai-completions',
    baseURL: `https://gateway.${provider}.example/v1`,
    models: [{ id: model, name }],
  }
}

describe('web e2e: the Models page sets the deployment default model', () => {
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

  /** Create one Session inside the connected workspace through the wire face. */
  const createInWorkspace = async (sessionId: string): Promise<string> => {
    const created = await scaffold.ctx.sessionController.create({
      sessionId: SessionId(sessionId),
      workspaceId: workspaceOf().id,
    })
    return created.sessionId
  }

  /** Create one Session outside every workspace account through the wire face. */
  const createOutside = async (sessionId: string): Promise<string> => {
    const created = await scaffold.ctx.sessionController.create({
      sessionId: SessionId(sessionId),
      cwd: scaffold.workspaceCwd,
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

  /** The Default model picker's trigger, once the Models page is showing. */
  const defaultModelTrigger = () => page.getByRole('button', { name: '选择默认模型' })

  /** Open Settings on the Models page the way a user reaches it. */
  const openModelsPage = async (): Promise<void> => {
    await openSettings(page, 'zh')
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: '模型', exact: true }).click()
    await dialog.getByText('新会话从此模型开始；若工作区设有自己的默认模型，则以该工作区为准。')
      .waitFor({ timeout: 10_000 })
  }

  /** Pick one model in the Default model menu and wait for it to be showing. */
  const pickDefaultModel = async (name: string): Promise<void> => {
    await defaultModelTrigger().click()
    await page.getByRole('menuitem', { name }).click()
    await expect.poll(async () => defaultModelTrigger().textContent(), { timeout: 10_000 })
      .toContain(name)
  }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // Three routes: somewhere to start, somewhere to go, and a second move that
    // is never the workspace override the later case keeps.
    await scaffold.ctx.settings.update('llm-pi-ai', {
      providers: {
        [START_ROUTE]: route(START_ROUTE, 'Origin Gateway', START_MODEL, 'Origin Large'),
        [PICKED_ROUTE]: route(PICKED_ROUTE, 'Acme Gateway', PICKED_MODEL, 'Acme Large'),
        [MOVED_ROUTE]: route(MOVED_ROUTE, 'Beta Gateway', MOVED_MODEL, 'Beta Large'),
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

  it('writes the picked model as the deployment default for later sessions', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-default-model'))
    await openModelsPage()
    // The row opens on the entry this deployment already resolves.
    await expect.poll(async () => defaultModelTrigger().textContent(), { timeout: 15_000 })
      .toContain('Origin Large')

    await pickDefaultModel('Acme Large')

    // The pick writes the shared entry this deployment's profile holds.
    await expect.poll(
      async () => readFile(patchPath(), 'utf8'),
      { timeout: 10_000 },
    ).toContain('id: agent-default-model')
    const document = await readFile(patchPath(), 'utf8')
    expect(document).toContain(`provider: ${PICKED_ROUTE}`)
    expect(document).toContain(`model: ${PICKED_MODEL}`)

    // A Session created after the pick starts from it, inside the connected
    // Workspace (which carries no override of its own) and outside one alike.
    expect(await currentOf(await createInWorkspace('models-default-in-workspace')))
      .toEqual({ provider: PICKED_ROUTE, model: PICKED_MODEL })
    expect(await currentOf(await createOutside('models-default-outside')))
      .toEqual({ provider: PICKED_ROUTE, model: PICKED_MODEL })
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('leaves a workspace override standing when the deployment default moves', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-default-model-workspace'))
    // The settings dialog stays open between cases; reopen it when a failure or
    // an interaction closed it.
    if (await defaultModelTrigger().count() === 0) await openModelsPage()
    const workspace = workspaceOf()
    // The Workspace takes a default of its own, as its row-menu dialog writes it.
    await scaffold.ctx.workspaceController.setDefaultModel({
      workspaceId: workspace.id,
      selection: { provider: START_ROUTE, model: START_MODEL },
    })
    expect(scaffold.ctx.agentDefaultModel.workspaceSelection(workspace.id))
      .toEqual({ provider: START_ROUTE, model: START_MODEL })

    await pickDefaultModel('Beta Large')
    await expect.poll(
      async () => scaffold.ctx.agentDefaultModel.currentSelection(),
      { timeout: 10_000 },
    ).toMatchObject({ provider: MOVED_ROUTE, model: MOVED_MODEL })

    // The override beside it is untouched: the shared write names only its own
    // fields, so the Workspace keeps handing its Sessions its own default...
    expect(scaffold.ctx.agentDefaultModel.workspaceSelection(workspace.id))
      .toEqual({ provider: START_ROUTE, model: START_MODEL })
    expect(await currentOf(await createInWorkspace('models-default-override-kept')))
      .toEqual({ provider: START_ROUTE, model: START_MODEL })
    // ...while a Session outside every Workspace follows the deployment default.
    expect(await currentOf(await createOutside('models-default-follows-shared')))
      .toEqual({ provider: MOVED_ROUTE, model: MOVED_MODEL })
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
