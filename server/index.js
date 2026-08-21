import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { apiConfig } from './config.js'
import { findRequestUser, requireUser } from './auth.js'
import { checkDatabase, getPool } from './db.js'
import { createSessionToken, hashPassword, hashToken, verifyPassword } from './security.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(currentDirectory, '..')
const distDirectory = resolve(projectRoot, 'dist')
const app = express()

app.disable('x-powered-by')
if (apiConfig.trustProxy) app.set('trust proxy', 1)
app.use(cors({
  origin(origin, callback) {
    const localOrigin = origin === 'null' || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin || '')
    if (!origin || localOrigin) return callback(null, true)
    callback(new Error('Origin is not allowed'))
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
app.use(express.json({ limit: '100kb' }))

const authAttempts = new Map()
function authRateLimit(request, response, next) {
  const now = Date.now()
  const windowMs = 15 * 60_000
  const key = request.ip
  const recentAttempts = (authAttempts.get(key) || []).filter((time) => now - time < windowMs)
  if (recentAttempts.length >= 15) {
    response.set('Retry-After', '900')
    return response.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' })
  }
  recentAttempts.push(now)
  authAttempts.set(key, recentAttempts)
  next()
}

async function startSession(request, response, user) {
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + apiConfig.sessionDays * 86_400_000)
  await getPool().execute('DELETE FROM sessions WHERE expires_at <= NOW()')
  await getPool().execute(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [hashToken(token), user.id, expiresAt],
  )

  response.cookie('kotoba_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: apiConfig.sessionDays * 86_400_000,
  })
  response.json({
    token: request.get('origin') === 'null' ? token : undefined,
    user: { id: String(user.id), email: user.email, displayName: user.display_name },
  })
}

app.get('/api/health', async (_request, response, next) => {
  try {
    await checkDatabase()
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', authRateLimit, async (request, response, next) => {
  try {
    const email = String(request.body?.email || '').trim().toLowerCase()
    const password = String(request.body?.password || '')
    if (!email || !password) return response.status(400).json({ error: '请输入邮箱和密码' })

    const [rows] = await getPool().execute(
      `SELECT id, email, display_name, password_salt, password_hash
       FROM users WHERE email = ? LIMIT 1`,
      [email],
    )
    const user = rows[0]
    const passwordMatches = user
      ? await verifyPassword(password, user.password_salt, user.password_hash)
      : false
    if (!passwordMatches) return response.status(401).json({ error: '邮箱或密码不正确' })

    await startSession(request, response, user)
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/register', authRateLimit, async (request, response, next) => {
  try {
    if (!apiConfig.allowRegistration) {
      return response.status(403).json({ error: '当前未开放新用户注册' })
    }

    const email = String(request.body?.email || '').trim().toLowerCase()
    const displayName = String(request.body?.displayName || '').trim()
    const password = String(request.body?.password || '')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) {
      return response.status(400).json({ error: '请输入有效的邮箱地址' })
    }
    if (displayName.length < 1 || displayName.length > 40) {
      return response.status(400).json({ error: '昵称长度应为 1 至 40 个字符' })
    }
    if (password.length < 10 || password.length > 128) {
      return response.status(400).json({ error: '密码长度应为 10 至 128 个字符' })
    }

    const { salt, hash } = await hashPassword(password)
    let userId
    try {
      const [result] = await getPool().execute(
        `INSERT INTO users (email, display_name, password_salt, password_hash)
         VALUES (?, ?, ?, ?)`,
        [email, displayName, salt, hash],
      )
      userId = result.insertId
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return response.status(409).json({ error: '该邮箱已注册，请直接登录' })
      }
      throw error
    }

    await startSession(request, response, {
      id: userId,
      email,
      display_name: displayName,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', async (request, response, next) => {
  try {
    const session = await findRequestUser(request)
    response.json({
      user: session ? {
        id: String(session.user.id),
        email: session.user.email,
        displayName: session.user.display_name,
      } : null,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', requireUser, async (request, response, next) => {
  try {
    await getPool().execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(request.sessionToken)])
    response.clearCookie('kotoba_session', { path: '/' })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/state', requireUser, async (request, response, next) => {
  try {
    const [rows] = await getPool().execute(
      'SELECT state_json, updated_at FROM learning_states WHERE user_id = ? LIMIT 1',
      [request.user.id],
    )
    if (!rows.length) return response.json({ state: null, updatedAt: null })

    const rawState = rows[0].state_json
    const state = typeof rawState === 'string' ? JSON.parse(rawState) : rawState
    response.json({ state, updatedAt: rows[0].updated_at })
  } catch (error) {
    next(error)
  }
})

app.put('/api/state', requireUser, async (request, response, next) => {
  try {
    const state = request.body?.state
    if (!isLearningState(state)) return response.status(400).json({ error: '学习数据格式无效' })

    await getPool().execute(
      `INSERT INTO learning_states (user_id, state_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = CURRENT_TIMESTAMP`,
      [request.user.id, JSON.stringify(state)],
    )
    response.json({ saved: true, updatedAt: new Date().toISOString() })
  } catch (error) {
    next(error)
  }
})

if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory))
  app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(resolve(distDirectory, 'index.html')))
}

app.use((error, request, response, _next) => {
  console.error(`[api] ${request.method} ${request.path}:`, error.message)
  const databaseError = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ER_ACCESS_DENIED_ERROR'].includes(error.code)
  response.status(databaseError ? 503 : 500).json({
    error: databaseError ? '暂时无法连接云端数据库' : '服务器处理请求时发生错误',
  })
})

function isLearningState(value) {
  if (value?.version === 2) {
    return Boolean(
      ['ja', 'en', 'es'].includes(value.activeLanguage) &&
      isRecord(value.profiles) &&
      ['ja', 'en', 'es'].every((language) => isLanguageProfile(value.profiles[language])),
    )
  }
  return isLanguageProfile(value)
}

function isLanguageProfile(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(value.tasks) &&
    value.tasks.length <= 100 &&
    value.tasks.every((task) =>
      task &&
      typeof task.id === 'string' &&
      typeof task.title === 'string' &&
      typeof task.completed === 'boolean',
    ) &&
    typeof value.taskDate === 'string' &&
    value.taskDate.length <= 10 &&
    isRecord(value.studyLog) &&
    Object.keys(value.studyLog).length <= 400 &&
    Object.entries(value.studyLog).every(([date, minutes]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440,
    ) &&
    isRecord(value.cardProgress) &&
    Object.keys(value.cardProgress).length <= 500 &&
    Object.values(value.cardProgress).every((progress) =>
      progress &&
      typeof progress === 'object' &&
      Number.isFinite(progress.ease) && progress.ease >= 1 && progress.ease <= 3 &&
      Number.isFinite(progress.intervalDays) && progress.intervalDays >= 0 && progress.intervalDays <= 3650 &&
      Number.isFinite(progress.reps) && progress.reps >= 0 && progress.reps <= 100000 &&
      Number.isFinite(progress.lapses) && progress.lapses >= 0 && progress.lapses <= 100000 &&
      typeof progress.dueISO === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(progress.dueISO),
    ) &&
    isRecord(value.quizStats) &&
    Object.values(value.quizStats).every((stat) =>
      stat &&
      typeof stat === 'object' &&
      Number.isFinite(stat.correct) && stat.correct >= 0 && stat.correct <= 1e6 &&
      Number.isFinite(stat.total) && stat.total >= 0 && stat.total <= 1e6,
    ) &&
    Number.isFinite(value.lessonsCompleted) &&
    value.lessonsCompleted >= 0 &&
    value.lessonsCompleted <= 10000 &&
    Number.isFinite(value.dailyGoal),
  )
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

checkDatabase()
  .then(() => {
    app.listen(apiConfig.port, apiConfig.host, () => {
      console.log(`Kotoba API listening on http://${apiConfig.host}:${apiConfig.port}`)
    })
  })
  .catch((error) => {
    console.error('Unable to connect to MySQL:', error.message)
    process.exitCode = 1
  })
