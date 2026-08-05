import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()

  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    // Own matches plus anything shared with this account — the viewer's
    // effective permission for each is folded into the returned data so the
    // frontend can gate editing without a second round trip.
    const rows = await sql`
      SELECT g.data, g.user_id AS owner_id, gs.permission
      FROM games g
      LEFT JOIN game_shares gs ON gs.game_id = g.id AND gs.user_id = ${user.id}
      WHERE g.user_id = ${user.id} OR gs.user_id = ${user.id}
      ORDER BY g.created_at ASC
    `
    res.status(200).json(rows.map(r => ({
      ...r.data,
      ownerId: r.owner_id,
      permission: r.owner_id === user.id ? 'owner' : r.permission,
    })))
    return
  }

  if (req.method === 'POST') {
    const game = req.body
    if (!game?.id) { res.status(400).json({ error: 'Missing id' }); return }
    const safeGame = JSON.parse(JSON.stringify(game))
    await sql`INSERT INTO games (id, data, user_id) VALUES (${safeGame.id}, ${JSON.stringify(safeGame)}::jsonb, ${user.id})`
    res.status(201).json({ ...safeGame, ownerId: user.id, permission: 'owner' })
    return
  }

  if (req.method === 'PUT') {
    const game = req.body
    if (!game?.id) { res.status(400).json({ error: 'Missing id' }); return }
    // Owner can always edit; a shared user needs an explicit 'edit' grant.
    const rows = await sql`
      UPDATE games g SET data = ${JSON.stringify(game)}::jsonb, updated_at = now()
      WHERE g.id = ${game.id}
        AND (g.user_id = ${user.id} OR EXISTS (
          SELECT 1 FROM game_shares gs WHERE gs.game_id = g.id AND gs.user_id = ${user.id} AND gs.permission = 'edit'
        ))
      RETURNING data, g.user_id AS owner_id
    `
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return }
    res.status(200).json({ ...rows[0].data, ownerId: rows[0].owner_id, permission: rows[0].owner_id === user.id ? 'owner' : 'edit' })
    return
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }
    // Only the owner can delete — a shared 'edit' grant is not delete access.
    await sql`DELETE FROM games WHERE id = ${id} AND user_id = ${user.id}`
    res.status(204).end()
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
