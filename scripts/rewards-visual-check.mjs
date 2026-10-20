import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const siteUrl = (process.env.SITE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})
let savedState = {
  version: 3,
  activeLanguage: 'ja',
  profiles: { ja: {}, en: null, es: null },
  rewards: {
    points: 60,
    checkInDates: ['2026-09-18', '2026-09-19'],
    unlockedThemes: ['classic'],
    activeTheme: 'classic',
  },
}

await mkdir('artifacts', { recursive: true })

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    let body
    if (pathname === '/api/auth/me') body = { user: { id: '1', email: 'test@example.com', displayName: '明子' } }
    else if (pathname === '/api/state' && request.method() === 'GET') body = { state: savedState, updatedAt: null }
    else if (pathname === '/api/state' && request.method() === 'PUT') {
      savedState = request.postDataJSON().state
      body = { saved: true, updatedAt: new Date().toISOString() }
    } else body = { error: 'Not found' }
    await route.fulfill({ status: 'error' in body ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.goto(siteUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('.app-shell').waitFor()
  for (const button of await page.locator('.task-check').all()) await button.click()

  const claimButton = page.getByRole('button', { name: '领取 +30' })
  await assert.doesNotReject(() => claimButton.click())
  await page.getByText('今日打卡完成').waitFor()
  assert.equal(await page.locator('.points-chip strong').textContent(), '90')

  await page.locator('.side-nav').getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '兑换 90' }).click()
  await page.getByRole('button', { name: '使用中' }).waitFor()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sakura')
  assert.equal(await page.locator('.theme-balance strong').textContent(), '0')
  assert.equal(await page.getByRole('button', { name: '兑换 180' }).isDisabled(), true)
  await page.screenshot({ path: 'artifacts/rewards-theme-desktop.png', fullPage: true })

  await page.waitForTimeout(900)
  assert.equal(savedState.rewards.points, 0)
  assert.equal(savedState.rewards.activeTheme, 'sakura')
  assert.deepEqual(savedState.rewards.unlockedThemes, ['classic', 'sakura'])
  assert.equal(savedState.rewards.checkInDates.length, 3)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.app-shell').waitFor()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sakura')
  await page.locator('.side-nav').getByRole('button', { name: '今日', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '今日已领取' }).isDisabled(), true)

  await page.waitForTimeout(900)
  savedState = { ...savedState, rewards: { ...savedState.rewards, points: 300 } }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.app-shell').waitFor()
  await page.locator('.side-nav').getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '兑换 300' }).click()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'midnight')
  await page.screenshot({ path: 'artifacts/rewards-midnight-desktop.png', fullPage: true })
  await page.waitForTimeout(900)
  assert.equal(savedState.rewards.points, 0)
  assert.equal(savedState.rewards.activeTheme, 'midnight')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.mobile-nav').getByRole('button', { name: '今日', exact: true }).click()
  await page.screenshot({ path: 'artifacts/rewards-theme-mobile.png', fullPage: true })
  const layout = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }))
  assert.equal(layout.documentWidth, layout.width)
  assert.deepEqual(errors, [])

  console.log(JSON.stringify({ points: savedState.rewards.points, activeTheme: savedState.rewards.activeTheme, checkIns: savedState.rewards.checkInDates.length, noHorizontalOverflow: true }, null, 2))
} finally {
  await browser.close()
}
