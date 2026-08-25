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
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('the composer is visible and the details empty state is not', async () => {
    const composer = page.locator('textarea:enabled[placeholder="Describe what you want to build"]')
    await composer.waitFor({ timeout: 15_000 })
    // The composer lives in the center track: visible with a real box.
    const box = await composer.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    // The details panel mounts (session scope) but must stay in the 0px
    // details track — clipped out of the main area, not full-width.
    const detailsEmpty = page.getByText('Click a tool row in the message flow to view its details')
    expect(await detailsEmpty.count()).toBe(1)
    expect(await detailsEmpty.first().isVisible()).toBe(false)
  })

  it('keeps the conversation box the same width with the drawer in and out', async () => {
    const composer = page.locator('textarea:enabled[placeholder="Describe what you want to build"]')
    await composer.waitFor({ timeout: 15_000 })
    const closed = await composer.boundingBox()
    expect(closed).not.toBeNull()
    // Open the drawer from the rail: the conversation must not reflow —
    // the drawer only covers a wider strip of the same content box.
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    await page.getByRole('button', { name: 'Collapse sidebar' }).waitFor({ timeout: 10_000 })
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
