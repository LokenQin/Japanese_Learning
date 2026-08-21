import 'dotenv/config'
import { getPool } from '../server/db.js'

const apiBase = `http://${process.env.API_HOST || '127.0.0.1'}:${process.env.API_PORT || 3001}/api`

const loginResponse = await fetch(`${apiBase}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'null' },
  body: JSON.stringify({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  }),
})
const loginBody = await loginResponse.json()
if (!loginResponse.ok || !loginBody.token) {
  throw new Error(loginBody.error || 'Login smoke test failed')
}

const authorization = { Authorization: `Bearer ${loginBody.token}` }
const stateResponse = await fetch(`${apiBase}/state`, { headers: authorization })
const stateBody = await stateResponse.json()
if (!stateResponse.ok) throw new Error(stateBody.error || 'State read smoke test failed')

await fetch(`${apiBase}/auth/logout`, { method: 'POST', headers: authorization })

const smokeEmail = `kotoba-smoke-${Date.now()}@example.com`
let registration = 'not-run'
try {
  const registerResponse = await fetch(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'null' },
    body: JSON.stringify({
      displayName: 'Smoke Test',
      email: smokeEmail,
      password: 'temporary-test-password',
    }),
  })
  const registerBody = await registerResponse.json()
  if (!registerResponse.ok || !registerBody.token) {
    throw new Error(registerBody.error || 'Registration smoke test failed')
  }
  const newUserState = await fetch(`${apiBase}/state`, {
    headers: { Authorization: `Bearer ${registerBody.token}` },
  })
  if (!newUserState.ok) throw new Error('New user state read failed')
  registration = 'ok'
} finally {
  await getPool().execute("DELETE FROM users WHERE email LIKE 'kotoba-smoke-%@example.com'")
  await getPool().end()
}

console.log(JSON.stringify({
  login: 'ok',
  stateRead: 'ok',
  initialState: stateBody.state === null,
  registration,
  cleanup: 'ok',
}))
