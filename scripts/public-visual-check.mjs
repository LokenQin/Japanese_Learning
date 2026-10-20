import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const siteUrl = (process.env.SITE_URL || 'https://loken-loki.cn').replace(/\/$/, '')
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})

await mkdir('artifacts', { recursive: true })
const results = []

try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport })
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByRole('heading', { name: '继续今天的学习' }).waitFor()
    await page.waitForFunction(
      () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      undefined,
      { timeout: 60_000 },
    )
    await page.screenshot({ path: `artifacts/public-login-${viewport.name}.png`, fullPage: true })

    const loginLayout = await page.evaluate(() => ({
      protocol: window.location.protocol,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      imagesLoaded: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      title: document.title,
      icpNumber: document.querySelector('.site-footer a')?.textContent?.trim(),
      icpLink: document.querySelector('.site-footer a')?.getAttribute('href'),
    }))

    await page.getByRole('button', { name: '忘记密码？' }).click()
    await page.getByRole('heading', { name: '找回登录密码' }).waitFor()
    await page.screenshot({ path: `artifacts/public-recovery-${viewport.name}.png`, fullPage: true })

    results.push({
      viewport: viewport.name,
      ...loginLayout,
      noHorizontalOverflow: loginLayout.documentWidth <= loginLayout.viewportWidth,
      errors,
    })
    await page.close()
  }
} finally {
  await browser.close()
}

const failed = results.some((result) => (
  result.protocol !== 'https:'
  || result.title !== 'kotoba个人学习网站'
  || result.icpNumber !== '豫ICP备2026044575号-1'
  || result.icpLink !== 'https://beian.miit.gov.cn/'
  || !result.imagesLoaded
  || !result.noHorizontalOverflow
  || result.errors.length > 0
))

console.log(JSON.stringify(results, null, 2))
if (failed) process.exitCode = 1
