import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'

// Lets any signed-in coach pick a teammate to share a match with, without
// typing an exact email — deliberately not admin-gated like /api/admin/users,
// but scoped to id/email/name only (nothing sensitive) for a small, closed
// club roster.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const rows = await sql`SELECT id, email, name FROM users WHERE id != ${user.id} ORDER BY lower(coalesce(name, email))`
  res.status(200).json({ users: rows.map(r => ({ id: r.id, email: r.email, name: r.name })) })
}
