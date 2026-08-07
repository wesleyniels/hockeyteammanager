import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'
import { isAdminEmail } from './_lib/admin.js'
import { createNotification } from './_lib/notifications.js'

const ANNOUNCEMENT_MAX_LENGTH = 500

// Notifications are otherwise only ever created server-side as a side
// effect of some other event (see createNotification in _lib/notifications.ts,
// called from game-shares.ts and admin/users.ts) — POST here is the one
// exception, letting a beheerder broadcast a one-off announcement to every
// other account from their profile page.
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

  if (req.method === 'POST') {
    const requester = await sql`SELECT is_admin FROM users WHERE id = ${user.id}`
    const requesterIsAdmin = isAdminEmail(user.email) || requester[0]?.is_admin === true
    if (!requesterIsAdmin) { res.status(403).json({ error: 'Forbidden' }); return }

    const body = String(req.body?.body ?? '').trim()
    if (!body) { res.status(400).json({ error: 'Bericht mag niet leeg zijn' }); return }
    if (body.length > ANNOUNCEMENT_MAX_LENGTH) { res.status(400).json({ error: `Bericht is te lang (max. ${ANNOUNCEMENT_MAX_LENGTH} tekens)` }); return }

    const recipients = await sql`SELECT id FROM users WHERE id != ${user.id}`
    await Promise.all(recipients.map(r => createNotification(r.id, 'announcement', body)))
    res.status(201).json({ ok: true, count: recipients.length })
    return
  }

  if (req.method === 'PATCH') {
    if (req.body?.all === true) {
      await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${user.id} AND read_at IS NULL`
      res.status(200).json({ ok: true })
      return
    }
    const id = req.body?.id
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }
    // `read` defaults to true so existing "mark as read" callers (which only
    // ever send { id }) keep working; explicitly passing false is what lets a
    // user flip an already-read notification back to unread.
    const readAt = req.body?.read === false ? null : new Date().toISOString()
    await sql`UPDATE notifications SET read_at = ${readAt} WHERE id = ${id} AND user_id = ${user.id}`
    res.status(200).json({ ok: true })
    return
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }
    await sql`DELETE FROM notifications WHERE id = ${id} AND user_id = ${user.id}`
    res.status(200).json({ ok: true })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
