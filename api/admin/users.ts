import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { getSessionFromCookies } from '../_lib/session.js'
import { isAdminEmail } from '../_lib/admin.js'
import { createNotification } from '../_lib/notifications.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const session = getSessionFromCookies(req.headers.cookie)
  if (!session) { res.status(403).json({ error: 'Forbidden' }); return }

  // The hardcoded email is a permanent fallback admin (so the account can
  // never be locked out); everyone else's access comes from the DB flag,
  // which admins grant/revoke on each other through this same endpoint.
  const requester = await sql`SELECT is_admin FROM users WHERE id = ${session.id}`
  const requesterIsAdmin = isAdminEmail(session.email) || requester[0]?.is_admin === true
  if (!requesterIsAdmin) { res.status(403).json({ error: 'Forbidden' }); return }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.first_name, u.last_name, u.role, u.default_team,
             u.email_verified, u.created_at, u.is_admin, (u.password_hash IS NOT NULL) AS has_password,
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
        isAdmin: r.is_admin === true || isAdminEmail(r.email),
      })),
    })
    return
  }

  if (req.method === 'PATCH') {
    const id = req.body?.id
    const isAdmin = req.body?.isAdmin
    if (!id || typeof isAdmin !== 'boolean') { res.status(400).json({ error: 'Missing id or isAdmin' }); return }
    if (id === session.id) { res.status(400).json({ error: 'Je kunt je eigen beheerdersrechten niet aanpassen' }); return }
    await sql`UPDATE users SET is_admin = ${isAdmin} WHERE id = ${id}`
    // Only on grant, not revoke — losing a permission isn't the kind of
    // thing this notification type is for (see the feature's own spec).
    if (isAdmin) await createNotification(id, 'admin-granted', 'Je hebt beheerdersrechten gekregen.')
    res.status(200).json({ ok: true })
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
