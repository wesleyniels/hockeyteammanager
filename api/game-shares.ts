import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'

// Only a game's owner can view/manage who it's shared with — this file
// checks that on every method rather than trusting the caller.
async function assertOwner(gameId: string, userId: string): Promise<boolean> {
  const rows = await sql`SELECT user_id FROM games WHERE id = ${gameId}`
  return rows.length > 0 && rows[0].user_id === userId
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : ''
    if (!gameId) { res.status(400).json({ error: 'Missing gameId' }); return }
    if (!(await assertOwner(gameId, user.id))) { res.status(403).json({ error: 'Forbidden' }); return }
    const rows = await sql`
      SELECT u.id AS user_id, u.email, u.name, gs.permission
      FROM game_shares gs
      JOIN users u ON u.id = gs.user_id
      WHERE gs.game_id = ${gameId}
      ORDER BY u.email
    `
    res.status(200).json({ shares: rows.map(r => ({ userId: r.user_id, email: r.email, name: r.name, permission: r.permission })) })
    return
  }

  if (req.method === 'POST') {
    const gameId = req.body?.gameId
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const permission = req.body?.permission
    if (!gameId || !email || (permission !== 'view' && permission !== 'edit')) {
      res.status(400).json({ error: 'Ongeldige invoer' })
      return
    }
    if (!(await assertOwner(gameId, user.id))) { res.status(403).json({ error: 'Forbidden' }); return }
    const target = await sql`SELECT id FROM users WHERE lower(email) = ${email}`
    if (target.length === 0) { res.status(404).json({ error: 'Geen account gevonden met dit e-mailadres' }); return }
    if (target[0].id === user.id) { res.status(400).json({ error: 'Je kunt niet met jezelf delen' }); return }
    await sql`
      INSERT INTO game_shares (game_id, user_id, permission) VALUES (${gameId}, ${target[0].id}, ${permission})
      ON CONFLICT (game_id, user_id) DO UPDATE SET permission = ${permission}
    `
    res.status(200).json({ ok: true })
    return
  }

  if (req.method === 'DELETE') {
    const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : req.body?.gameId
    const targetUserId = typeof req.query.userId === 'string' ? req.query.userId : req.body?.userId
    if (!gameId || !targetUserId) { res.status(400).json({ error: 'Missing gameId or userId' }); return }
    if (!(await assertOwner(gameId, user.id))) { res.status(403).json({ error: 'Forbidden' }); return }
    await sql`DELETE FROM game_shares WHERE game_id = ${gameId} AND user_id = ${targetUserId}`
    res.status(200).json({ ok: true })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
