import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const log = []
const note = (line) => { log.push(`${new Date().toISOString()} ${line}`); writeFileSync('/tmp/gui-watch.log', log.join('\n') + '\n') }
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') note(`CONSOLE ${m.type()} ${m.text().slice(0, 240)}`) })
page.on('pageerror', e => note(`PAGEERROR ${String(e).slice(0, 240)}`))
page.on('requestfailed', r => note(`REQFAIL ${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ''}`))
page.on('response', r => { if (r.url().includes('/plugins/events')) note(`SSE ${r.status()}`) })
await page.goto('http://127.0.0.1:3081/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const session = page.getByText('Rebase fork on upstream ma', { exact: false }).first()
if (await session.count()) { await session.click(); await page.waitForTimeout(4000) }
note(`START len=${(await page.locator('body').innerText()).trim().length}`)
for (let i = 0; i < 300; i++) {
  await page.waitForTimeout(6000)
  const len = (await page.locator('body').innerText()).trim().length
  if (i % 10 === 0) note(`tick len=${len}`)
  if (len < 1200) {
    note(`COLLAPSED len=${len}`)
    await page.screenshot({ path: '/tmp/gui-collapsed.png' })
    break
  }
}
await page.screenshot({ path: '/tmp/gui-watch-end.png' })
note('END')
await browser.close()
