import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export function normalizeRecoveryKeyword(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

export async function hashPassword(password, salt = randomBytes(16)) {
  const hash = await scrypt(password, salt, 64)
  return { salt, hash }
}

export async function verifyPassword(password, salt, expectedHash) {
  const actualHash = await scrypt(password, salt, 64)
  return timingSafeEqual(actualHash, expectedHash)
}

export async function hashRecoveryKeyword(keyword, salt = randomBytes(16)) {
  const normalizedKeyword = normalizeRecoveryKeyword(keyword)
  const hash = await scrypt(`recovery-keyword\0${normalizedKeyword}`, salt, 64)
  return { salt, hash }
}

export async function verifyRecoveryKeyword(keyword, salt, expectedHash) {
  const { hash } = await hashRecoveryKeyword(keyword, salt)
  return timingSafeEqual(hash, expectedHash)
}

export function createSessionToken() {
  return randomBytes(32).toString('hex')
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}
