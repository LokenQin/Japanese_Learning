import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const siteUrl = (process.env.SITE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const viewports = [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 881, height: 900 },
  { width: 960, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]
const pages = [
  ['today', '今日'],
  ['learn', '学习'],
  ['review', '复习'],
  ['insights', '数据'],
  ['settings', '设置'],
]

await mkdir('artifacts/responsive', { recursive: true })
const browser = await chromium.launch({ executablePath: chromePath, headless: true })
const failures = []

async function mockApi(page, authenticated) {
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url())
    const method = route.request().method()
    const headers = {
      'Access-Control-Allow-Origin': route.request().headers().origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    }
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    const payload = pathname === '/api/auth/me'
      ? { user: authenticated ? { id: '1', email: 'test@example.com', displayName: '明子' } : null }
      : pathname === '/api/state' && method === 'GET'
        ? { state: null, updatedAt: null }
        : pathname === '/api/state' && method === 'PUT'
          ? { saved: true, updatedAt: new Date().toISOString() }
          : { error: 'Not found' }
    await route.fulfill({
      status: 'error' in payload ? 404 : 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(payload),
    })
  })
}

async function check(page, label, width, screenshot = false) {
  await page.waitForTimeout(150)
  const layout = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth
    const visible = (element) => {
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0
    }
    const escaped = [...document.querySelectorAll('button, input, select, h1, h2, h3, .page-container, .lesson-modal')]
      .filter(visible)
      .filter((element) => !element.closest('.sidebar:not(.sidebar-open)'))
      .filter((element) => {
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const overflow = getComputedStyle(ancestor).overflowX
          if ((overflow === 'auto' || overflow === 'scroll') && ancestor.scrollWidth > ancestor.clientWidth + 1) return false
        }
        return true
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.left < -2 || rect.right > viewport + 2
      })
      .map((element) => ({ element: element.tagName.toLowerCase(), className: element.className?.baseVal ?? element.className, text: element.textContent?.trim().slice(0, 24), left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) }))
    return { viewport, documentWidth: document.documentElement.scrollWidth, escaped }
  })
  if (layout.documentWidth > width + 1 || layout.escaped.length) failures.push({ label, width, ...layout })
  if (screenshot) await page.screenshot({ path: `artifacts/responsive/${label}-${width}.png`, fullPage: true })
  console.log(`${width} ${label}: document ${layout.documentWidth}px, escaped ${layout.escaped.length}`)
}

try {
  for (const viewport of viewports) {
    const publicPage = await browser.newPage({ viewport })
    await mockApi(publicPage, false)
    await publicPage.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await publicPage.locator('.login-form-wrap').waitFor()
    await check(publicPage, 'login', viewport.width, viewport.width <= 390)
    await publicPage.getByRole('tab', { name: '注册' }).click()
    await check(publicPage, 'register', viewport.width, viewport.width <= 390)
    await publicPage.getByRole('tab', { name: '登录' }).click()
    await publicPage.getByRole('button', { name: '忘记密码？' }).click()
    await check(publicPage, 'recovery', viewport.width, viewport.width <= 390)
    await publicPage.close()

    const page = await browser.newPage({ viewport })
    await mockApi(page, true)
    if (siteUrl.startsWith('file:')) {
      await page.addInitScript(() => localStorage.setItem('kotoba-auth-token-v1', 'test-session'))
    }
    await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('.app-shell').waitFor()
    await page.getByRole('button', { name: '学习提醒' }).click()
    await page.locator('.notification-panel').waitFor()
    await check(page, 'notifications', viewport.width, viewport.width <= 390)
    await page.getByRole('button', { name: '学习提醒' }).click()
    for (const [id, name] of pages) {
      if (id !== 'today') {
        const nav = viewport.width <= 880 ? '.mobile-nav' : '.side-nav'
        await page.locator(nav).getByRole('button', { name: new RegExp(`^${name}`) }).click()
      }
      await check(page, id, viewport.width, viewport.width <= 390 || viewport.width === 768 || viewport.width === 881 || viewport.width === 1024)
      if (id === 'learn') assert.equal(await page.locator('.kana-pair-cell').count(), 46, `Expected 46 kana pairs at ${viewport.width}px`)
    }
    if (viewport.width <= 880) {
      await page.getByRole('button', { name: '打开导航' }).click()
      await page.waitForTimeout(300)
      await check(page, 'drawer', viewport.width, viewport.width <= 390)
      await page.locator('.sidebar-close').click()
    }
    await page.locator(viewport.width <= 880 ? '.mobile-nav' : '.side-nav').getByRole('button', { name: '今日', exact: true }).click()
    await page.getByRole('button', { name: '继续学习' }).click()
    await page.locator('.lesson-modal').waitFor()
    assert.equal(await page.locator('.quiz-kana-pair').isVisible(), true, `Kana comparison missing from lesson at ${viewport.width}px`)
    await check(page, 'lesson', viewport.width, viewport.width <= 390)
    await page.close()
  }
} finally {
  await browser.close()
}

assert.deepEqual(failures, [], `Responsive layout failures:\n${JSON.stringify(failures, null, 2)}`)
