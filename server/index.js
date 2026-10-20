import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { apiConfig } from './config.js'
import { findRequestUser, requireUser } from './auth.js'
import { checkDatabase, getPool } from './db.js'
import { isLearningState } from './learning-state.js'
import {
  createSessionToken,
  hashPassword,
  hashRecoveryKeyword,
  hashToken,
  normalizeRecoveryKeyword,
  verifyPassword,
  verifyRecoveryKeyword,
} from './security.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(currentDirectory, '..')
const distDirectory = resolve(projectRoot, 'dist')
const app = express()

app.disable('x-powered-by')
if (apiConfig.trustProxy) app.set('trust proxy', 1)
app.use((_request, response, next) => {
  response.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  })
  next()
})
app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = origin?.replace(/\/$/, '')
    const localOrigin = origin === 'null' || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin || '')
    const allowedOrigin = normalizedOrigin && apiConfig.allowedOrigins.includes(normalizedOrigin)
    if (!origin || allowedOrigin || (!apiConfig.production && localOrigin)) return callback(null, true)
    const error = new Error('Origin is not allowed')
    error.statusCode = 403
    callback(error)
  },
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
app.use(express.json({ limit: '100kb' }))

const authAttempts = new Map()
const recoveryAttempts = new Map()

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

function recoveryRateLimit(request, response, next) {
  const now = Date.now()
  const windowMs = 15 * 60_000
  const account = normalizeEmail(request.body?.email || request.body?.account) || 'invalid'
  const key = `${request.ip}:${account}`
  const recentAttempts = (recoveryAttempts.get(key) || []).filter((time) => now - time < windowMs)
  if (recentAttempts.length >= 5) {
    response.set('Retry-After', '900')
    return response.status(429).json({ error: '找回尝试次数过多，请 15 分钟后再试' })
  }
  recentAttempts.push(now)
  recoveryAttempts.set(key, recentAttempts)
  next()
}

function publicUser(user) {
  return {
    id: String(user.id),
    email: user.email,
    displayName: user.display_name,
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 190 ? email : null
}

function validRecoveryKeyword(value) {
  const keyword = normalizeRecoveryKeyword(value)
  const length = Array.from(keyword).length
  return length >= 6 && length <= 64 ? keyword : null
}

function clearSessionCookie(response) {
  response.clearCookie('kotoba_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: apiConfig.secureCookies,
    path: '/',
  })
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
    secure: apiConfig.secureCookies,
    path: '/',
    maxAge: apiConfig.sessionDays * 86_400_000,
  })
  response.json({
    token: request.get('origin') === 'null' ? token : undefined,
    user: publicUser(user),
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
    const email = normalizeEmail(request.body?.email || request.body?.account)
    const password = String(request.body?.password || '')
    if (!email || !password) return response.status(400).json({ error: '请输入有效的邮箱及密码' })

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

    const email = normalizeEmail(request.body?.email || request.body?.account)
    const displayName = String(request.body?.displayName || '').trim()
    const password = String(request.body?.password || '')
    const recoveryKeyword = validRecoveryKeyword(request.body?.recoveryKeyword)
    if (!email) return response.status(400).json({ error: '请输入有效的邮箱地址' })
    if (displayName.length < 1 || displayName.length > 40) {
      return response.status(400).json({ error: '昵称长度应为 1 至 40 个字符' })
    }
    if (password.length < 10 || password.length > 128) {
      return response.status(400).json({ error: '密码长度应为 10 至 128 个字符' })
    }
    if (!recoveryKeyword) {
      return response.status(400).json({ error: '找回关键字长度应为 6 至 64 个字符' })
    }
    if (normalizeRecoveryKeyword(password) === recoveryKeyword) {
      return response.status(400).json({ error: '找回关键字不能与登录密码相同' })
    }

    const [{ salt, hash }, keywordDigest] = await Promise.all([
      hashPassword(password),
      hashRecoveryKeyword(recoveryKeyword),
    ])
    let userId
    try {
      const [result] = await getPool().execute(
        `INSERT INTO users
         (email, display_name, password_salt, password_hash, recovery_keyword_salt, recovery_keyword_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [email, displayName, salt, hash, keywordDigest.salt, keywordDigest.hash],
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

app.post('/api/auth/password/reset', authRateLimit, recoveryRateLimit, async (request, response, next) => {
  let connection
  try {
    const email = normalizeEmail(request.body?.email || request.body?.account)
    const recoveryKeyword = validRecoveryKeyword(request.body?.recoveryKeyword)
    const password = String(request.body?.password || '')
    if (!email) return response.status(400).json({ error: '请输入有效的邮箱地址' })
    if (!recoveryKeyword) return response.status(400).json({ error: '请输入预留的找回关键字' })
    if (password.length < 10 || password.length > 128) {
      return response.status(400).json({ error: '密码长度应为 10 至 128 个字符' })
    }
    if (normalizeRecoveryKeyword(password) === recoveryKeyword) {
      return response.status(400).json({ error: '新密码不能与找回关键字相同' })
    }

    const { salt, hash } = await hashPassword(password)
    connection = await getPool().getConnection()
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT id, recovery_keyword_salt, recovery_keyword_hash
       FROM users WHERE email = ? LIMIT 1 FOR UPDATE`,
      [email],
    )
    const user = rows[0]
    const keywordMatches = await verifyRecoveryKeyword(
      recoveryKeyword,
      user?.recovery_keyword_salt || Buffer.alloc(16),
      user?.recovery_keyword_hash || Buffer.alloc(64),
    )
    if (!user || !user.recovery_keyword_hash || !keywordMatches) {
      await connection.rollback()
      return response.status(400).json({ error: '邮箱或找回关键字不正确' })
    }

    const userId = user.id
    await connection.execute(
      'UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?',
      [salt, hash, userId],
    )
    await connection.execute('DELETE FROM sessions WHERE user_id = ?', [userId])
    await connection.commit()
    clearSessionCookie(response)
    response.json({ message: '密码已更新，请使用新密码登录。' })
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {})
    next(error)
  } finally {
    connection?.release()
  }
})

app.put('/api/auth/recovery-keyword', authRateLimit, requireUser, async (request, response, next) => {
  try {
    const currentPassword = String(request.body?.currentPassword || '')
    const recoveryKeyword = validRecoveryKeyword(request.body?.recoveryKeyword)
    if (!currentPassword) return response.status(400).json({ error: '请输入当前登录密码' })
    if (!recoveryKeyword) {
      return response.status(400).json({ error: '找回关键字长度应为 6 至 64 个字符' })
    }
    if (normalizeRecoveryKeyword(currentPassword) === recoveryKeyword) {
      return response.status(400).json({ error: '找回关键字不能与登录密码相同' })
    }

    const [rows] = await getPool().execute(
      'SELECT password_salt, password_hash FROM users WHERE id = ? LIMIT 1',
      [request.user.id],
    )
    const user = rows[0]
    const passwordMatches = user
      ? await verifyPassword(currentPassword, user.password_salt, user.password_hash)
      : false
    if (!passwordMatches) return response.status(401).json({ error: '当前密码不正确' })

    const { salt, hash } = await hashRecoveryKeyword(recoveryKeyword)
    await getPool().execute(
      'UPDATE users SET recovery_keyword_salt = ?, recovery_keyword_hash = ? WHERE id = ?',
      [salt, hash, request.user.id],
    )
    response.json({ message: '找回关键字已更新。' })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', async (request, response, next) => {
  try {
    const session = await findRequestUser(request)
    response.json({
      user: session ? publicUser(session.user) : null,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', requireUser, async (request, response, next) => {
  try {
    await getPool().execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(request.sessionToken)])
    clearSessionCookie(response)
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
  const status = databaseError ? 503 : error.statusCode || 500
  response.status(status).json({
    error: databaseError ? '暂时无法连接云端数据库' : error.publicMessage || (status === 403 ? '当前网站来源未被允许' : '服务器处理请求时发生错误'),
  })
})

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
