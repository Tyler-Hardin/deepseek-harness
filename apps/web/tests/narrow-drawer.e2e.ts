// Web e2e scenario: the narrow drawer keeps the conversation in the center
// track and the details panel in its clipped 0px track. Regression pin for
// AppFrame.module.css: the drawer sidebar leaves the grid flow (absolute), so
// the in-flow columns carry explicit grid-column placement — without it they
// auto-place one track left, the chat squeezes into the 0px rail track, and
// the details panel renders across the full center. Zero model calls: the
// fixture workspace's blank session is enough.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace } from './support.ts'

describe('web e2e: narrow drawer keeps the conversation centered', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch({})
    page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('mounts the rail outside the grid with the conversation in the center track', async () => {
    const frame = page.locator('[class*="frame"]').first()
    await expect.poll(async () => frame.getAttribute('data-narrow'), { timeout: 15_000 }).toBe('true')
    expect(await frame.getAttribute('data-sidebar-collapsed')).toBe('true')
    // The rail keeps its fixed width but no longer owns a grid track; the
    // details column stays in its clipped track instead of spanning the center.
    const rail = page.locator('[class*="sidebarCol"]').first()
    expect(await rail.evaluate(element => (element as HTMLElement).style.width)).toBe('56px')
    const details = page.locator('[data-rightbar-col]')
    expect(await details.count()).toBe(1)
    expect((await details.first().boundingBox())?.width ?? 0).toBe(0)
  })

  it('keeps the conversation box the same width with the drawer in and out', async () => {
    const composer = page.locator('[data-composer-input]').first()
    await composer.waitFor({ timeout: 15_000 })
    const closed = await composer.boundingBox()
    expect(closed).not.toBeNull()
    // Open the drawer from the rail: the conversation must not reflow —
    // the drawer only covers a wider strip of the same content box.
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    await page.getByRole('button', { name: 'Collapse sidebar' }).waitFor({ timeout: 10_000 })
    const frame = page.locator('[class*="frame"]').first()
    expect(await frame.getAttribute('data-sidebar-collapsed')).toBeNull()
    expect(await page.locator('[class*="scrim"]').count()).toBe(1)
    const open = await composer.boundingBox()
    expect(open).not.toBeNull()
    expect(open!.width).toBe(closed!.width)
    expect(open!.x).toBe(closed!.x)
    // Close again via the scrim: identical box restored.
    await page.locator('[class*="scrim"]').click()
    await page.getByRole('button', { name: 'Open sidebar' }).waitFor({ timeout: 10_000 })
    const closedAgain = await composer.boundingBox()
    expect(closedAgain).not.toBeNull()
    expect(closedAgain!.width).toBe(closed!.width)
  })
})
