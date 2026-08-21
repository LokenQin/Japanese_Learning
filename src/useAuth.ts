import { useEffect, useState } from 'react'
import { clearToken, getCurrentUser, login as loginRequest, logout as logoutRequest, register as registerRequest } from './api'
import type { AuthUser } from './api'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable'

async function getCurrentUserWithRetry(attempts = 4) {
  let lastError: Error & { status?: number } = new Error('无法连接学习服务')
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getCurrentUser()
    } catch (requestError) {
      lastError = requestError as Error & { status?: number }
      if (lastError.status === 401 || attempt === attempts - 1) throw lastError
      await new Promise((resolve) => window.setTimeout(resolve, 800 * (attempt + 1)))
    }
  }
  throw lastError
}

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getCurrentUserWithRetry()
      .then((currentUser) => {
        setUser(currentUser)
        setStatus(currentUser ? 'authenticated' : 'unauthenticated')
      })
      .catch((requestError: Error & { status?: number }) => {
        if (requestError.status === 401) {
          clearToken()
          setStatus('unauthenticated')
          return
        }
        setError(requestError.message)
        setStatus('unavailable')
      })
  }, [])

  const login = async (email: string, password: string) => {
    const currentUser = await loginRequest(email, password)
    setUser(currentUser)
    setStatus('authenticated')
    setError('')
  }

  const register = async (displayName: string, email: string, password: string) => {
    const currentUser = await registerRequest(displayName, email, password)
    setUser(currentUser)
    setStatus('authenticated')
    setError('')
  }

  const logout = async () => {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
      setStatus('unauthenticated')
    }
  }

  const retry = () => {
    setStatus('loading')
    setError('')
    getCurrentUserWithRetry()
      .then((currentUser) => {
        setUser(currentUser)
        setStatus(currentUser ? 'authenticated' : 'unauthenticated')
      })
      .catch((requestError: Error & { status?: number }) => {
        if (requestError.status === 401) {
          clearToken()
          setStatus('unauthenticated')
          return
        }
        setError(requestError.message)
        setStatus('unavailable')
      })
  }

  return { status, user, error, login, register, logout, retry }
}
