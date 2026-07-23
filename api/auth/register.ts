import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { hashPassword, newToken, randomUUID } from '../_lib/crypto.js'
import { sendVerificationEmail } from '../_lib/email.js'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function originOf(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https'
  return `${proto}://${req.headers.host}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  await ensureSchema()

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  const name = req.body?.name ? String(req.body.name).trim() : null

  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Ongeldig e-mailadres' }); return }
  if (password.length < 8) { res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens zijn' }); return }

  const existing = await sql`SELECT id FROM users WHERE lower(email) = ${email}`
  if (existing.length > 0) { res.status(409).json({ error: 'Dit e-mailadres is al geregistreerd' }); return }

  const id = randomUUID()
  const token = newToken()
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  await sql`
    INSERT INTO users (id, email, name, password_hash, email_verified, verification_token, verification_expires)
    VALUES (${id}, ${email}, ${name}, ${hashPassword(password)}, false, ${token}, ${expires})
  `

  try {
    await sendVerificationEmail(email, name, `${originOf(req)}/api/auth/verify-email?token=${token}`)
  } catch (err) {
    console.error('Failed to send verification email', err)
    res.status(502).json({ error: 'Account aangemaakt, maar de verificatie-e-mail kon niet worden verzonden. Probeer opnieuw in te loggen om een nieuwe link aan te vragen.' })
    return
  }

  res.status(201).json({ ok: true })
}
