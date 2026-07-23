import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { getSessionFromCookies } from '../_lib/session.js'
import { toUser } from '../_lib/users.js'

const MAX_PICTURE_LENGTH = 2_000_000 // ~1.5MB decoded — the client resizes photos well below this

// The session cookie only proves *who* is signed in — mutable profile fields
// are read fresh from the DB on every call so a change shows up immediately
// instead of waiting for the next login.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const session = getSessionFromCookies(req.headers.cookie)
  if (!session) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    const rows = await sql`SELECT id, email, name, picture, default_team, first_name, last_name, role FROM users WHERE id = ${session.id}`
    if (rows.length === 0) { res.status(401).json({ error: 'Not authenticated' }); return }
    res.status(200).json({ user: toUser(rows[0]) })
    return
  }

  if (req.method === 'PUT') {
    const body = req.body ?? {}
    for (const key of ['defaultTeam', 'firstName', 'lastName', 'role', 'picture']) {
      if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') {
        res.status(400).json({ error: `Invalid ${key}` })
        return
      }
    }
    if (typeof body.picture === 'string' && body.picture.length > MAX_PICTURE_LENGTH) {
      res.status(400).json({ error: 'Foto is te groot' })
      return
    }
    const current = await sql`SELECT default_team, first_name, last_name, role, picture FROM users WHERE id = ${session.id}`
    if (current.length === 0) { res.status(401).json({ error: 'Not authenticated' }); return }
    const cur = current[0]
    // A key only changes if the caller actually sent it — this lets Setup's
    // team-select send just { defaultTeam } without touching name/role, while
    // still letting any field be explicitly cleared back to null/empty.
    const defaultTeam = 'defaultTeam' in body ? (body.defaultTeam || null) : cur.default_team
    const firstName = 'firstName' in body ? (body.firstName || null) : cur.first_name
    const lastName = 'lastName' in body ? (body.lastName || null) : cur.last_name
    const role = 'role' in body ? (body.role || null) : cur.role
    const picture = 'picture' in body ? (body.picture || null) : cur.picture
    const rows = await sql`
      UPDATE users SET
        default_team = ${defaultTeam},
        first_name = ${firstName},
        last_name = ${lastName},
        role = ${role},
        picture = ${picture}
      WHERE id = ${session.id}
      RETURNING id, email, name, picture, default_team, first_name, last_name, role
    `
    if (rows.length === 0) { res.status(401).json({ error: 'Not authenticated' }); return }
    res.status(200).json({ user: toUser(rows[0]) })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
