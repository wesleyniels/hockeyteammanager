import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'

// Notifications are only ever created server-side (see createNotification in
// _lib/notifications.ts, called from game-shares.ts and admin/users.ts) —
// this route is read/acknowledge only, no POST-to-create.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, type, body, game_id, created_at, read_at FROM notifications
      WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50
    `
    const unread = await sql`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = ${user.id} AND read_at IS NULL`
    res.status(200).json({
      notifications: rows.map(r => ({
        id: r.id, type: r.type, body: r.body, gameId: r.game_id, createdAt: r.created_at, read: !!r.read_at,
      })),
      unreadCount: unread[0]?.count ?? 0,
    })
    return
  }

  if (req.method === 'PATCH') {
    if (req.body?.all === true) {
      await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${user.id} AND read_at IS NULL`
    } else {
      const id = req.body?.id
      if (!id) { res.status(400).json({ error: 'Missing id' }); return }
      await sql`UPDATE notifications SET read_at = now() WHERE id = ${id} AND user_id = ${user.id}`
    }
    res.status(200).json({ ok: true })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
