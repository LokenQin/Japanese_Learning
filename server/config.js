import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function getDatabaseConfig() {
  const sslEnabled = process.env.DB_SSL === 'true'
  const caPath = process.env.DB_SSL_CA_PATH
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  return {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
    ssl: sslEnabled ? {
      rejectUnauthorized,
      ...(caPath ? { ca: readFileSync(resolve(caPath), 'utf8') } : {}),
    } : undefined,
  }
}

export const apiConfig = {
  host: process.env.API_HOST || '127.0.0.1',
  port: Number(process.env.API_PORT || 3001),
  sessionDays: Math.max(1, Number(process.env.SESSION_DAYS || 30)),
  allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
  trustProxy: process.env.TRUST_PROXY === 'true',
  production: process.env.NODE_ENV === 'production',
  secureCookies: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
  allowedOrigins: String(process.env.APP_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  publicUrl: String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, ''),
}

if (apiConfig.production && apiConfig.allowedOrigins.length === 0) {
  throw new Error('Missing required environment variable for production: APP_ORIGINS')
}
