import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { getSessionFromCookies } from '../_lib/session.js'

const sql = neon(process.env.POSTGRES_URL!)

// The session cookie only proves *who* is signed in — mutable profile fields
// like defaultTeam are read fresh from the DB on every call so a change
// shows up immediately instead of waiting for the next login.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromCookies(req.headers.cookie)
  if (!session) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    const rows = await sql`SELECT id, email, name, picture, default_team FROM users WHERE id = ${session.id}`
    if (rows.length === 0) { res.status(401).json({ error: 'Not authenticated' }); return }
    const u = rows[0]
    res.status(200).json({ user: { id: u.id, email: u.email, name: u.name, picture: u.picture, defaultTeam: u.default_team } })
    return
  }

  if (req.method === 'PUT') {
    const defaultTeam = req.body?.defaultTeam
    if (typeof defaultTeam !== 'string' && defaultTeam !== null) { res.status(400).json({ error: 'Invalid defaultTeam' }); return }
    const rows = await sql`
      UPDATE users SET default_team = ${defaultTeam} WHERE id = ${session.id}
      RETURNING id, email, name, picture, default_team
    `
    if (rows.length === 0) { res.status(401).json({ error: 'Not authenticated' }); return }
    const u = rows[0]
    res.status(200).json({ user: { id: u.id, email: u.email, name: u.name, picture: u.picture, defaultTeam: u.default_team } })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
