import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { signSession, sessionCookieHeader } from '../_lib/session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()

  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https'
  const appUrl = `${proto}://${req.headers.host}`
  const token = typeof req.query.token === 'string' ? req.query.token : ''

  if (!token) { res.redirect(302, `${appUrl}/?verify=error`); return }

  const rows = await sql`SELECT id, email, name, picture, verification_expires FROM users WHERE verification_token = ${token}`
  const row = rows[0]
  if (!row || new Date(row.verification_expires) < new Date()) {
    res.redirect(302, `${appUrl}/?verify=error`)
    return
  }

  await sql`UPDATE users SET email_verified = true, verification_token = NULL, verification_expires = NULL WHERE id = ${row.id}`

  // Verifying proves ownership of the mailbox, so sign them straight in —
  // no reason to make them re-type the password they just chose.
  res.setHeader('Set-Cookie', sessionCookieHeader(signSession({ id: row.id, email: row.email, name: row.name, picture: row.picture })))
  res.redirect(302, `${appUrl}/?verify=ok`)
}
