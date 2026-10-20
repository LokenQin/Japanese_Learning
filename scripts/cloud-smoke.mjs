import 'dotenv/config'
import { getPool } from '../server/db.js'

const apiBase = `http://${process.env.API_HOST || '127.0.0.1'}:${process.env.API_PORT || 3001}/api`
const smokeEmail = `kotoba-smoke-${Date.now()}@example.com`
const today = new Date().toISOString().slice(0, 10)

function profile(language) {
  return {
    tasks: [{
      id: `${language}-smoke-task`,
      title: 'Smoke task',
      description: 'Cloud state contract test',
      duration: 10,
      kind: language === 'ja' ? 'kana' : 'vocabulary',
      completed: false,
    }],
    taskDate: today,
    studyLog: {},
    quizStats: {},
    cardProgress: {},
    lessonsCompleted: 0,
    dailyGoal: 30,
    reminderEnabled: false,
    soundEnabled: true,
    strictMode: false,
    reminderTime: '20:00',
  }
}

const state = {
  version: 3,
  activeLanguage: 'ja',
  profiles: { ja: profile('ja'), en: profile('en'), es: profile('es') },
  rewards: {
    points: 30,
    checkInDates: [today],
    unlockedThemes: ['classic'],
    activeTheme: 'classic',
  },
}

try {
  const registerResponse = await fetch(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://loken-loki.cn' },
    body: JSON.stringify({
      displayName: 'Smoke Test',
      email: smokeEmail,
      password: 'temporary-test-password',
      recoveryKeyword: 'temporary recovery phrase',
    }),
  })
  const registerBody = await registerResponse.json()
  const sessionCookie = registerResponse.headers.get('set-cookie')?.split(';', 1)[0]
  if (!registerResponse.ok || !registerBody.user || !sessionCookie) {
    throw new Error(registerBody.error || 'Registration smoke test failed')
  }
  const sessionHeaders = { Cookie: sessionCookie }

  const initialResponse = await fetch(`${apiBase}/state`, { headers: sessionHeaders })
  const initialBody = await initialResponse.json()
  if (!initialResponse.ok || initialBody.state !== null) throw new Error('Initial state read failed')

  const saveResponse = await fetch(`${apiBase}/state`, {
    method: 'PUT',
    headers: { ...sessionHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  const saveBody = await saveResponse.json()
  if (!saveResponse.ok || !saveBody.saved) {
    throw new Error(saveBody.error || 'Version 3 state save failed')
  }

  const savedResponse = await fetch(`${apiBase}/state`, { headers: sessionHeaders })
  const savedBody = await savedResponse.json()
  if (!savedResponse.ok || savedBody.state?.version !== 3 || savedBody.state?.rewards?.points !== 30) {
    throw new Error('Saved state read-back failed')
  }

  const logoutResponse = await fetch(`${apiBase}/auth/logout`, { method: 'POST', headers: sessionHeaders })
  if (!logoutResponse.ok) throw new Error('Logout smoke test failed')

  console.log(JSON.stringify({
    registration: 'ok',
    initialStateRead: 'ok',
    versionThreeSave: 'ok',
    savedStateRead: 'ok',
    logout: 'ok',
    cleanup: 'ok',
  }))
} finally {
  await getPool().execute("DELETE FROM users WHERE email LIKE 'kotoba-smoke-%@example.com'")
  await getPool().end()
}
