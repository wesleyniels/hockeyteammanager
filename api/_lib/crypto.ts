import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64

// scrypt is built into Node, so password hashing needs no extra dependency
// (this project's serverless deploy has bitten us before on missing/ESM
// packages — see the git history around "ERR_MODULE_NOT_FOUND").
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, KEY_LEN).toString('hex')
  return `${salt}:${derived}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = scryptSync(password, salt, KEY_LEN)
  const storedBuf = Buffer.from(hash, 'hex')
  if (derived.length !== storedBuf.length) return false
  return timingSafeEqual(derived, storedBuf)
}

export function newToken(): string {
  return randomBytes(32).toString('hex')
}

export { randomUUID }
