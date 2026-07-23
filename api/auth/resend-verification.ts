import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { newToken } from '../_lib/crypto.js'
import { sendVerificationEmail } from '../_lib/email.js'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  await ensureSchema()

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const rows = await sql`SELECT id, name, email_verified, password_hash FROM users WHERE lower(email) = ${email}`
  const row = rows[0]

  // Always respond the same way regardless of whether the account exists or
  // is already verified, so this endpoint can't be used to probe emails.
  if (row?.password_hash && !row.email_verified) {
    const token = newToken()
    const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
    await sql`UPDATE users SET verification_token = ${token}, verification_expires = ${expires} WHERE id = ${row.id}`
    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https'
    const verifyUrl = `${proto}://${req.headers.host}/api/auth/verify-email?token=${token}`
    try {
      await sendVerificationEmail(email, row.name, verifyUrl)
    } catch (err) {
      console.error('Failed to resend verification email', err)
    }
  }

  res.status(200).json({ ok: true })
}
