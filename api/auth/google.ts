import type { VercelRequest, VercelResponse } from '@vercel/node'
import { OAuth2Client } from 'google-auth-library'
import { neon } from '@neondatabase/serverless'
import { signSession, sessionCookieHeader } from '../_lib/session.js'

const sql = neon(process.env.POSTGRES_URL!)
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

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

  const user = { id: payload.sub, email: payload.email, name: payload.name ?? null, picture: payload.picture ?? null }

  const rows = await sql`
    INSERT INTO users (id, email, name, picture) VALUES (${user.id}, ${user.email}, ${user.name}, ${user.picture})
    ON CONFLICT (id) DO UPDATE SET email = ${user.email}, name = ${user.name}, picture = ${user.picture}
    RETURNING id, email, name, picture, default_team
  `
  const u = rows[0]

  res.setHeader('Set-Cookie', sessionCookieHeader(signSession(user)))
  res.status(200).json({ user: { id: u.id, email: u.email, name: u.name, picture: u.picture, defaultTeam: u.default_team } })
}
