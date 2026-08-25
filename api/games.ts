import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'
import { ELIGIBLE_ROLES } from './_lib/messages.js'
import { isAdmin } from './_lib/admin.js'
import { canSeeFullNames, initials } from './_lib/names.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()

  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    // Own matches, anything explicitly shared with this account, plus any
    // match at all — regardless of who created it — for this account's own
    // default_team, so a Speler/Supporter sees their whole team's schedule
    // by default and doesn't depend on a coach remembering to share each
    // one individually. A coach/trainer/manager gets 'edit' on a team match
    // they don't own so they can help run it too; everyone else (player,
    // supporter, or no role at all) only gets 'view'. The viewer's effective
    // permission for each is folded into the returned data so the frontend
    // can gate editing without a second round trip.
    const me = await sql`SELECT default_team, role FROM users WHERE id = ${user.id}`
    const defaultTeam = me[0]?.default_team ?? null
    const role = me[0]?.role ?? null
    const rows = await sql`
      SELECT g.data, g.user_id AS owner_id, gs.permission AS share_permission
      FROM games g
      LEFT JOIN game_shares gs ON gs.game_id = g.id AND gs.user_id = ${user.id}
      WHERE g.user_id = ${user.id}
         OR gs.user_id = ${user.id}
         OR (${defaultTeam}::text IS NOT NULL AND g.data->>'team' = ${defaultTeam})
      ORDER BY g.created_at ASC
    `
    // A freshly-seeded Hockey-One fixture starts with an empty squad (see
    // seedTeamFixtures in db.ts) — fill it in from the team's current roster
    // here rather than at seed time, so it stays in sync as players are
    // added/removed all season instead of freezing whatever the roster
    // looked like on import day. Only applies while the squad is still
    // empty: the moment a coach saves the match (PUT), its squad becomes
    // real match data and this overlay stops applying to it.
    let roster: { id: string; name: string; photoUrl: string | null }[] = []
    if (defaultTeam && rows.some(r => r.owner_id === 'hockey-one' && (r.data.squad?.length ?? 0) === 0)) {
      const rosterRows = await sql`
        SELECT tp.id, tp.name, tp.photo_url FROM team_players tp
        JOIN teams t ON t.id = tp.team_id
        WHERE lower(t.name) = lower(${defaultTeam})
        ORDER BY tp.sort_order, tp.name
      `
      roster = rosterRows.map(r => ({ id: r.id, name: r.name, photoUrl: r.photo_url }))
    }
    // Player names in a game's squad are only for roster staff/admins — a
    // Speler, Supporter, or not-yet-verified account gets initials instead,
    // same trust boundary as the roster/staff endpoints below. This is the
    // one choke point every match-viewing surface (field, bench, timeline,
    // stats, goal scorers) reads names through, so redacting it here covers
    // all of them without any client-side changes.
    const fullNamesOk = canSeeFullNames(role, await isAdmin(user))
    res.status(200).json(rows.map(r => {
      let permission: string | undefined
      if (r.owner_id === user.id) permission = 'owner'
      else if (r.share_permission) permission = r.share_permission
      else if (defaultTeam && r.data.team === defaultTeam) permission = ELIGIBLE_ROLES.includes(role ?? '') ? 'edit' : 'view'
      const needsRoster = r.owner_id === 'hockey-one' && (r.data.squad?.length ?? 0) === 0 && roster.length > 0
      let data = needsRoster ? { ...r.data, squad: roster.map(p => ({ id: p.id, name: p.name, photoUrl: p.photoUrl ?? undefined })) } : r.data
      if (!fullNamesOk && Array.isArray(data.squad)) {
        data = { ...data, squad: data.squad.map((p: { name?: string }) => (p.name ? { ...p, name: initials(p.name) } : p)) }
      }
      return { ...data, ownerId: r.owner_id, permission }
    }))
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
    const me = await sql`SELECT default_team, role FROM users WHERE id = ${user.id}`
    const defaultTeam = me[0]?.default_team ?? null
    const eligible = ELIGIBLE_ROLES.includes(me[0]?.role ?? '')
    // Owner can always edit; a shared user needs an explicit 'edit' grant; a
    // coach/trainer/manager can also edit any other match for their own
    // team, not just Hockey-One-owned fixtures (see the matching GET branch
    // above for the read-side rule this mirrors).
    const rows = await sql`
      UPDATE games g SET data = ${JSON.stringify(game)}::jsonb, updated_at = now()
      WHERE g.id = ${game.id}
        AND (
          g.user_id = ${user.id}
          OR EXISTS (SELECT 1 FROM game_shares gs WHERE gs.game_id = g.id AND gs.user_id = ${user.id} AND gs.permission = 'edit')
          OR (${eligible} AND ${defaultTeam}::text IS NOT NULL AND g.data->>'team' = ${defaultTeam})
        )
      RETURNING data, g.user_id AS owner_id
    `
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return }
    res.status(200).json({ ...rows[0].data, ownerId: rows[0].owner_id, permission: rows[0].owner_id === user.id ? 'owner' : 'edit' })
    return
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }
    // Only the owner can delete — a shared 'edit' grant is not delete access
    // — except a beheerder, who can clean up any match regardless of owner.
    const rows = await isAdmin(user)
      ? await sql`DELETE FROM games WHERE id = ${id} RETURNING id`
      : await sql`DELETE FROM games WHERE id = ${id} AND user_id = ${user.id} RETURNING id`
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).end()
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
