import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { getSessionFromCookies } from '../_lib/session.js'
import { isAdminEmail } from '../_lib/admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const session = getSessionFromCookies(req.headers.cookie)
  if (!session || !isAdminEmail(session.email)) { res.status(403).json({ error: 'Forbidden' }); return }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.first_name, u.last_name, u.role, u.default_team,
             u.email_verified, u.created_at, (u.password_hash IS NOT NULL) AS has_password,
             COUNT(g.id)::int AS game_count
      FROM users u
      LEFT JOIN games g ON g.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `
    res.status(200).json({
      users: rows.map(r => ({
        id: r.id,
        email: r.email,
        name: r.name,
        firstName: r.first_name,
        lastName: r.last_name,
        role: r.role,
        defaultTeam: r.default_team,
        emailVerified: r.email_verified,
        hasPassword: r.has_password,
        gameCount: r.game_count,
        createdAt: r.created_at,
      })),
    })
    return
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }
    if (id === session.id) { res.status(400).json({ error: 'Je kunt jezelf niet verwijderen' }); return }
    // No ON DELETE CASCADE on games.user_id, so clear owned matches first.
    await sql`DELETE FROM games WHERE user_id = ${id}`
    await sql`DELETE FROM users WHERE id = ${id}`
    res.status(200).json({ ok: true })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
