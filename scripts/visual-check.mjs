import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

await mkdir('artifacts', { recursive: true })

let savedState = null
const mockApi = createServer(async (request, response) => {
  const origin = request.headers.origin
  response.setHeader('Access-Control-Allow-Origin', origin || '*')
  response.setHeader('Access-Control-Allow-Credentials', 'true')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Content-Type', 'application/json')
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    return response.end()
  }

  const authenticated = request.headers.cookie?.includes('kotoba_session=test-session') || request.headers.authorization === 'Bearer test-session'
  if (request.url === '/api/auth/login' && request.method === 'POST') {
    response.setHeader('Set-Cookie', 'kotoba_session=test-session; Path=/; HttpOnly; SameSite=Lax')
    return response.end(JSON.stringify({
      token: origin === 'null' ? 'test-session' : undefined,
      user: { id: '1', email: 'test@example.com', displayName: '明子' },
    }))
  }
  if (request.url === '/api/auth/register' && request.method === 'POST') {
    response.setHeader('Set-Cookie', 'kotoba_session=test-session; Path=/; HttpOnly; SameSite=Lax')
    return response.end(JSON.stringify({
      token: origin === 'null' ? 'test-session' : undefined,
      user: { id: '2', email: 'new@example.com', displayName: '新同学' },
    }))
  }
  if (request.url === '/api/auth/me') {
    return response.end(JSON.stringify(authenticated
      ? { user: { id: '1', email: 'test@example.com', displayName: '明子' } }
      : { user: null }))
  }
  if (request.url === '/api/state' && request.method === 'GET' && authenticated) {
    return response.end(JSON.stringify({ state: savedState, updatedAt: null }))
  }
  if (request.url === '/api/state' && request.method === 'PUT' && authenticated) {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    savedState = JSON.parse(Buffer.concat(chunks).toString()).state
    return response.end(JSON.stringify({ saved: true, updatedAt: new Date().toISOString() }))
  }
  response.statusCode = authenticated ? 404 : 401
  response.end(JSON.stringify({ error: authenticated ? 'Not found' : '请先登录' }))
})

await new Promise((resolveListen) => mockApi.listen(3001, '127.0.0.1', resolveListen))

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})
const results = []
const profile = (language = savedState?.activeLanguage) => savedState?.profiles?.[language]

async function login(page) {
  await page.getByLabel('邮箱').fill('test@example.com')
  await page.getByLabel('密码').fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: 'おはよう，明子。' }).waitFor()
}

async function register(page) {
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByLabel('昵称').fill('新同学')
  await page.getByLabel('邮箱').fill('new@example.com')
  await page.getByLabel('密码', { exact: true }).fill('test-password-123')
  await page.getByLabel('确认密码').fill('test-password-123')
  await page.getByRole('button', { name: '创建账户', exact: true }).click()
  await page.getByRole('heading', { name: 'おはよう，新同学。' }).waitFor()
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  savedState = null
  const page = await browser.newPage({ viewport })
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  await page.screenshot({ path: `artifacts/login-${viewport.name}.png`, fullPage: true })
  await login(page)
  await page.screenshot({ path: `artifacts/today-${viewport.name}.png`, fullPage: true })
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    imageLoaded: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    heading: document.querySelector('h1')?.textContent,
  }))
  results.push({ viewport: viewport.name, ...layout, errors })
  if (viewport.name === 'mobile') await page.getByRole('button', { name: '打开导航' }).click()
  await page.locator('.language-switcher select').selectOption('en')
  if (viewport.name === 'mobile') {
    await page.locator('.sidebar-close').click()
    await page.waitForTimeout(300)
  }
  await page.getByRole('heading', { name: 'Good morning，明子。' }).waitFor()
  await page.screenshot({ path: `artifacts/today-english-${viewport.name}.png`, fullPage: true })
  results.push({
    viewport: `english-${viewport.name}`,
    documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
    errors,
  })
  await page.close()
}

savedState = null
const interactionPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const interactionErrors = []
interactionPage.on('console', (message) => {
  if (message.type() === 'error') interactionErrors.push(message.text())
})
interactionPage.on('pageerror', (error) => interactionErrors.push(error.message))
await interactionPage.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
await login(interactionPage)

// 完成一次完整的假名课程（未学内容按顺序出题：あいうえお）
await interactionPage.getByRole('button', { name: '继续学习' }).click()
await interactionPage.getByText('平假名 · 认读', { exact: true }).waitFor()
const readings = ['a', 'i', 'u', 'e', 'o']
for (const [index, reading] of readings.entries()) {
  await interactionPage.getByRole('button', { name: reading, exact: true }).click()
  await interactionPage.getByRole('button', { name: '检查答案' }).click()
  await interactionPage.getByText('回答正确', { exact: true }).waitFor()
  if (index < readings.length - 1) {
    await interactionPage.getByRole('button', { name: '下一题' }).click()
  } else {
    await interactionPage.getByRole('button', { name: '查看结果' }).click()
  }
}
const lessonSummaryVisible = await interactionPage.getByText('课程完成').isVisible()
await interactionPage.getByRole('button', { name: '完成课程' }).click()
await interactionPage.waitForTimeout(900)
const todayKey = new Date().toLocaleDateString('sv-SE')
const lessonState = {
  taskCompleted: profile('ja')?.tasks?.[0]?.completed === true,
  quizRecorded: profile('ja')?.quizStats?.kana?.total === 5 && profile('ja')?.quizStats?.kana?.correct === 5,
  minutesLogged: profile('ja')?.studyLog?.[todayKey] === 8,
  lessonCounted: profile('ja')?.lessonsCompleted === 1,
}
results.push({ interaction: 'lesson-completion', lessonSummaryVisible, ...lessonState })

// 复习流程：评分一张卡片后队列缩短，卡片进度写入状态
await interactionPage.locator('.side-nav button', { hasText: '复习' }).click()
await interactionPage.getByText('记忆复习').waitFor()
const queueCountBefore = await interactionPage.locator('.queue-title strong').textContent()
await interactionPage.locator('.flashcard').click()
await interactionPage.getByRole('button', { name: '记得' }).click()
const queueCountAfter = await interactionPage.locator('.queue-title strong').textContent()
await interactionPage.waitForTimeout(900)
results.push({
  interaction: 'spaced-review',
  queueCountBefore: Number(queueCountBefore),
  queueCountAfter: Number(queueCountAfter),
  cardScheduled: profile('ja')?.cardProgress?.['ja-kana-あ']?.reps === 1,
  reviewTaskStillOpen: profile('ja')?.tasks?.find((task) => task.kind === 'review')?.completed === false,
})

await interactionPage.getByRole('button', { name: '设置', exact: true }).click()
await interactionPage.getByRole('button', { name: '45 分钟' }).click()
await interactionPage.waitForTimeout(900)
results.push({ interaction: 'cloud-settings', persistedGoal: profile('ja')?.dailyGoal, errors: interactionErrors })

// 切换语言后使用独立档案，并将选择保存到云端。
await interactionPage.locator('.language-switcher select').selectOption('en')
await interactionPage.locator('.side-nav button', { hasText: '今日' }).click()
await interactionPage.getByRole('heading', { name: 'Good morning，明子。' }).waitFor()
await interactionPage.waitForTimeout(900)
results.push({
  interaction: 'language-switch',
  activeLanguage: savedState?.activeLanguage,
  englishTasks: profile('en')?.tasks?.length,
  japaneseLessonPreserved: profile('ja')?.lessonsCompleted === 1,
  englishProgressIndependent: profile('en')?.lessonsCompleted === 0,
})
await interactionPage.close()

const registrationPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
savedState = null
await registrationPage.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
await registrationPage.getByRole('tab', { name: '注册' }).click()
await registrationPage.screenshot({ path: 'artifacts/register-desktop.png', fullPage: true })
await register(registrationPage)
results.push({ interaction: 'registration', registeredDisplayName: '新同学' })
await registrationPage.close()

const filePage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const fileErrors = []
filePage.on('console', (message) => {
  if (message.type() === 'error') fileErrors.push(message.text())
})
filePage.on('pageerror', (error) => fileErrors.push(error.message))
await filePage.goto(pathToFileURL(resolve('index.html')).href, { waitUntil: 'load' })
await filePage.getByRole('heading', { name: '继续今天的学习' }).waitFor()
await login(filePage)
const fileLayout = await filePage.evaluate(() => ({
  protocol: window.location.protocol,
  viewportWidth: window.innerWidth,
  documentWidth: document.documentElement.scrollWidth,
  imageLoaded: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
}))
await filePage.screenshot({ path: 'artifacts/direct-file-desktop.png', fullPage: true })
results.push({ opening: 'direct-index-html', ...fileLayout, errors: fileErrors })
await filePage.close()

await browser.close()
await new Promise((resolveClose) => mockApi.close(resolveClose))
console.log(JSON.stringify(results, null, 2))
