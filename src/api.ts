import type { LearningStateEnvelope } from './types'

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

const TOKEN_KEY = 'kotoba-auth-token-v1'
const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:3001/api' : '/api'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || '网络请求失败') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return body as T
}

export async function login(email: string, password: string) {
  const result = await request<{ token?: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (result.token) localStorage.setItem(TOKEN_KEY, result.token)
  else clearToken()
  return result.user
}

export async function register(displayName: string, email: string, password: string, recoveryKeyword: string) {
  const result = await request<{ token?: string; user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ displayName, email, password, recoveryKeyword }),
  })
  if (result.token) localStorage.setItem(TOKEN_KEY, result.token)
  else clearToken()
  return result.user
}

export async function resetPassword(email: string, recoveryKeyword: string, password: string) {
  return request<{ message: string }>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ email, recoveryKeyword, password }),
  })
}

export async function updateRecoveryKeyword(currentPassword: string, recoveryKeyword: string) {
  return request<{ message: string }>('/auth/recovery-keyword', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, recoveryKeyword }),
  })
}

export async function getCurrentUser() {
  if (window.location.protocol === 'file:' && !getToken()) return null
  try {
    const result = await request<{ user: AuthUser | null }>('/auth/me')
    return result.user
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) clearToken()
    throw error
  }
}

export async function logout() {
  try {
    if (window.location.protocol !== 'file:' || getToken()) {
      await request<void>('/auth/logout', { method: 'POST' })
    }
  } finally {
    clearToken()
  }
}

export async function loadLearningState() {
  return request<{ state: unknown; updatedAt: string | null }>('/state')
}

export async function saveLearningState(state: LearningStateEnvelope) {
  return request<{ saved: boolean; updatedAt: string }>('/state', {
    method: 'PUT',
    body: JSON.stringify({ state }),
  })
}
