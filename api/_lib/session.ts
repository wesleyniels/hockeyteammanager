import jwt from 'jsonwebtoken'

const COOKIE_NAME = 'session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface SessionUser {
  id: string
  email: string
  name: string | null
  picture: string | null
}

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set')
  return s
}

// `vercel dev` serves over plain http, where a Secure cookie would silently
// never be sent back by the browser — only require it on real deployments.
function isSecureEnv(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview'
}

export function signSession(user: SessionUser): string {
  return jwt.sign(user, secret(), { expiresIn: MAX_AGE_SECONDS })
}

export function verifySession(token: string): SessionUser | null {
  try {
    return jwt.verify(token, secret()) as SessionUser
  } catch {
    return null
  }
}

export function sessionCookieHeader(token: string): string {
  const secureAttr = isSecureEnv() ? '; Secure' : ''
  return `${COOKIE_NAME}=${token}; HttpOnly${secureAttr}; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`
}

export function clearSessionCookieHeader(): string {
  const secureAttr = isSecureEnv() ? '; Secure' : ''
  return `${COOKIE_NAME}=; HttpOnly${secureAttr}; SameSite=Lax; Path=/; Max-Age=0`
}

export function getSessionFromCookies(cookieHeader: string | undefined): SessionUser | null {
  if (!cookieHeader) return null
  const match = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE_NAME}=`))
  if (!match) return null
  const token = match.slice(COOKIE_NAME.length + 1)
  return verifySession(token)
}
