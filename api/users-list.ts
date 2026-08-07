import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'
import { ELIGIBLE_ROLES } from './_lib/messages.js'

// Lets a signed-in coach/trainer pick a teammate to share a match with,
// without typing an exact email — deliberately not admin-gated like
// /api/admin/users, but scoped to id/email/name only (nothing sensitive)
// for a small, closed club roster. Matches game-shares.ts's own eligibility
// check exactly (coach/trainer, same club) — that route re-verifies
// regardless, this just keeps the picker from offering targets that would
// only get rejected anyway.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const me = await sql`SELECT role, default_club FROM users WHERE id = ${user.id}`
  const role = me[0]?.role
  const club = me[0]?.default_club
  if (!role || !club || !ELIGIBLE_ROLES.includes(role)) { res.status(200).json({ users: [] }); return }

  const rows = await sql`
    SELECT id, email, name FROM users
    WHERE id != ${user.id} AND role = ANY(${ELIGIBLE_ROLES}::text[]) AND lower(default_club) = lower(${club})
    ORDER BY lower(coalesce(name, email))
  `
  res.status(200).json({ users: rows.map(r => ({ id: r.id, email: r.email, name: r.name })) })
}
