import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export async function hashPassword(password, salt = randomBytes(16)) {
  const hash = await scrypt(password, salt, 64)
  return { salt, hash }
}

export async function verifyPassword(password, salt, expectedHash) {
  const actualHash = await scrypt(password, salt, 64)
  return timingSafeEqual(actualHash, expectedHash)
}

export function createSessionToken() {
  return randomBytes(32).toString('hex')
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}
