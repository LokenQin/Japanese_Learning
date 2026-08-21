import { getPool } from './db.js'
import { hashToken } from './security.js'

function readBearerToken(request) {
  const authorization = request.get('authorization')
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim()
  const cookies = Object.fromEntries(
    String(request.get('cookie') || '')
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([name, value]) => name && value)
      .map(([name, value]) => [name, decodeURIComponent(value)]),
  )
  return cookies.kotoba_session || null
}

export async function findRequestUser(request) {
  const token = readBearerToken(request)
  if (!token) return null
  const [rows] = await getPool().execute(
    `SELECT users.id, users.email, users.display_name
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > NOW()
     LIMIT 1`,
    [hashToken(token)],
  )
  return rows.length ? { user: rows[0], token } : null
}

export async function requireUser(request, response, next) {
  try {
    const session = await findRequestUser(request)
    if (!session) return response.status(401).json({ error: '登录已过期，请重新登录' })
    request.user = session.user
    request.sessionToken = session.token
    next()
  } catch (error) {
    next(error)
  }
}
