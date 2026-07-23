import type { VercelRequest, VercelResponse } from '@vercel/node'
import { OAuth2Client } from 'google-auth-library'
import { sql, ensureSchema } from '../_lib/db.js'
import { signSession, sessionCookieHeader } from '../_lib/session.js'
import { toUser } from '../_lib/users.js'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  await ensureSchema()

  const credential = req.body?.credential
  if (!credential) { res.status(400).json({ error: 'Missing credential' }); return }

  let payload
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })
    payload = ticket.getPayload()
  } catch {
    res.status(401).json({ error: 'Invalid Google credential' })
    return
  }
  if (!payload?.sub || !payload.email) { res.status(401).json({ error: 'Invalid Google credential' }); return }

  const email = payload.email.toLowerCase()
  const name = payload.name ?? null
  const picture = payload.picture ?? null
  const verified = payload.email_verified ?? true

  // Look the account up by email rather than by Google's `sub` — this is the
  // same person if they already registered with a password using this
  // address, so we reuse that row instead of creating a second account with
  // the same email.
  const existing = await sql`SELECT id FROM users WHERE lower(email) = ${email}`

  let rows
  if (existing.length > 0) {
    const id = existing[0].id
    // Keep any name/photo the user already set (e.g. an uploaded profile
    // photo) rather than overwriting it with Google's every time they log in.
    rows = await sql`
      UPDATE users SET
        email = ${email},
        name = COALESCE(name, ${name}),
        picture = COALESCE(picture, ${picture}),
        email_verified = email_verified OR ${verified}
      WHERE id = ${id}
      RETURNING id, email, name, picture, default_team, first_name, last_name, role
    `
  } else {
    rows = await sql`
      INSERT INTO users (id, email, name, picture, email_verified)
      VALUES (${payload.sub}, ${email}, ${name}, ${picture}, ${verified})
      RETURNING id, email, name, picture, default_team, first_name, last_name, role
    `
  }

  const u = rows[0]
  res.setHeader('Set-Cookie', sessionCookieHeader(signSession({ id: u.id, email: u.email, name: u.name, picture: u.picture })))
  res.status(200).json({ user: toUser(u) })
}
