import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { chromium } from 'playwright-core'

const siteUrl = (process.env.SITE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})

await mkdir('artifacts', { recursive: true })
const results = []
const mockApi = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*')
  response.setHeader('Access-Control-Allow-Credentials', 'true')
  response.setHeader('Content-Type', 'application/json')
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    return response.end()
  }
  if (request.url === '/api/auth/me') return response.end(JSON.stringify({ user: null }))
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'Not found' }))
})

await new Promise((resolveListen) => mockApi.listen(3001, '127.0.0.1', resolveListen))

try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(siteUrl, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '忘记密码？' }).click()
    await page.getByRole('heading', { name: '找回登录密码' }).waitFor()
    await page.getByLabel('邮箱').fill('learner@example.com')
    await page.getByLabel('预留关键字').fill('private recovery phrase')
    await page.getByLabel('新密码').fill('temporary-password')
    await page.getByLabel('确认密码').fill('temporary-password')
    await page.screenshot({ path: `artifacts/password-recovery-${viewport.name}.png`, fullPage: true })

    if (pageErrors.length) throw new Error(pageErrors.join('\n'))
    results.push({ viewport: viewport.name, recovery: 'ok' })
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise((resolveClose, rejectClose) => mockApi.close((error) => error ? rejectClose(error) : resolveClose()))
}

console.log(JSON.stringify(results))
