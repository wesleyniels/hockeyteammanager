import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { verifyPassword } from '../_lib/crypto.js'
import { signSession, sessionCookieHeader } from '../_lib/session.js'
import { toUser } from '../_lib/users.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  await ensureSchema()

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')

  const rows = await sql`SELECT * FROM users WHERE lower(email) = ${email}`
  const row = rows[0]
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Onjuiste e-mail of wachtwoord' })
    return
  }
  if (!row.email_verified) {
    res.status(403).json({ error: 'Bevestig eerst je e-mailadres via de link die we je gestuurd hebben.', code: 'unverified' })
    return
  }

  res.setHeader('Set-Cookie', sessionCookieHeader(signSession({ id: row.id, email: row.email, name: row.name, picture: row.picture })))
  res.status(200).json({ user: toUser(row) })
}
