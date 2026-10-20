import 'dotenv/config'
import { getPool } from '../server/db.js'

const apiBase = process.env.SMOKE_API_BASE || 'http://127.0.0.1:3101/api'
const requestHost = process.env.SMOKE_HOST || ''
const requestOrigin = process.env.SMOKE_ORIGIN || ''
const expectSecureCookie = process.env.SMOKE_EXPECT_SECURE_COOKIE === 'true'
const expectOriginBlock = process.env.SMOKE_EXPECT_ORIGIN_BLOCK === 'true'
const email = `kotoba-reset-smoke-${Date.now()}@example.com`
const oldPassword = 'temporary-old-password'
const newPassword = 'temporary-new-password'
const recoveryKeyword = 'private recovery phrase'
const updatedRecoveryKeyword = 'updated recovery phrase'
let userId

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(requestHost ? { Host: requestHost } : {}),
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

try {
  const registration = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ displayName: 'Reset Smoke', email, password: oldPassword, recoveryKeyword }),
  })
  if (!registration.response.ok || !registration.body.user) throw new Error('Registration failed')
  userId = registration.body.user.id
  const setCookie = registration.response.headers.get('set-cookie') || ''
  if (expectSecureCookie && !/HttpOnly/i.test(setCookie)) throw new Error('Session cookie is not HttpOnly')
  if (expectSecureCookie && !/Secure/i.test(setCookie)) throw new Error('Session cookie is not Secure')
  if (expectSecureCookie && !/SameSite=Lax/i.test(setCookie)) throw new Error('Session cookie is missing SameSite=Lax')
  const sessionCookie = setCookie.split(';', 1)[0]
  const sessionHeaders = registration.body.token
    ? { Authorization: `Bearer ${registration.body.token}` }
    : { Cookie: sessionCookie }
  if (!registration.body.token && !sessionCookie) throw new Error('Registration did not create a session')

  const updateKeyword = await request('/auth/recovery-keyword', {
    method: 'PUT',
    headers: sessionHeaders,
    body: JSON.stringify({ currentPassword: oldPassword, recoveryKeyword: updatedRecoveryKeyword }),
  })
  if (!updateKeyword.response.ok) throw new Error(updateKeyword.body.error || 'Recovery keyword update failed')

  const wrongKeyword = await request('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ email, recoveryKeyword, password: newPassword }),
  })
  if (wrongKeyword.response.status !== 400) throw new Error('Wrong recovery keyword was accepted')

  const reset = await request('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ email, recoveryKeyword: updatedRecoveryKeyword, password: newPassword }),
  })
  if (!reset.response.ok) throw new Error(reset.body.error || 'Password reset failed')

  const oldSession = await request('/state', {
    headers: sessionHeaders,
  })
  if (oldSession.response.status !== 401) throw new Error('Old session was not revoked')

  const oldLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: oldPassword }),
  })
  if (oldLogin.response.status !== 401) throw new Error('Old password still works')

  const newLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: newPassword }),
  })
  if (!newLogin.response.ok || !newLogin.body.user) throw new Error('New password login failed')

  if (expectOriginBlock) {
    const blockedOrigin = await request('/health', {
      headers: { Origin: 'https://untrusted.example' },
    })
    if (blockedOrigin.response.status !== 403) throw new Error('Untrusted origin was not blocked')
  }

  console.log(JSON.stringify({
    passwordReset: 'ok',
    recoveryKeywordUpdate: 'ok',
    wrongKeywordRejected: true,
    oldSessionRevoked: true,
    oldPasswordRejected: true,
    newPasswordAccepted: true,
    secureCookie: expectSecureCookie ? 'ok' : 'not-checked',
    originRestriction: expectOriginBlock ? 'ok' : 'not-checked',
  }))
} finally {
  await getPool().execute('DELETE FROM users WHERE email = ?', [email])
  await getPool().end()
}
