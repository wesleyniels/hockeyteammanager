import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'
import { ELIGIBLE_ROLES } from './_lib/messages.js'
import { isAdmin } from './_lib/admin.js'
import { canSeeFullNames, initials } from './_lib/names.js'
import { effectiveRoleForTeam, type FollowedTeam } from './_lib/team-roles.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()

  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    // Own matches, anything explicitly shared with this account, plus any
    // match at all — regardless of who created it — for this account's own
    // default_team or any team they've chosen to follow, so a Speler/
    // Supporter sees their whole team's schedule by default and doesn't
    // depend on a coach remembering to share each one individually. A
    // coach/trainer/manager gets 'edit' on a team match they hold that role
    // for — their own default_team, or a followed team where they picked an
    // elevated role too (effectiveRoleForTeam resolves which). The viewer's
    // effective permission for each is folded into the returned data so the
    // frontend can gate editing without a second round trip.
    const me = await sql`SELECT default_team, followed_teams, role FROM users WHERE id = ${user.id}`
    const defaultTeam = me[0]?.default_team ?? null
    const followedTeams = (me[0]?.followed_teams ?? []) as FollowedTeam[]
    const primaryRole = me[0]?.role ?? null
    const visibleTeams = [...new Set([defaultTeam, ...followedTeams.map(f => f.team)].filter((t): t is string => !!t))]
    const rows = await sql`
      SELECT g.data, g.user_id AS owner_id, g.updated_at, gs.permission AS share_permission
      FROM games g
      LEFT JOIN game_shares gs ON gs.game_id = g.id AND gs.user_id = ${user.id}
      WHERE g.user_id = ${user.id}
         OR gs.user_id = ${user.id}
         OR g.data->>'team' = ANY(${visibleTeams}::text[])
      ORDER BY g.created_at ASC
    `
    // A freshly-seeded Hockey-One fixture starts with an empty squad (see
    // seedTeamFixtures in db.ts) — fill it in from the team's current roster
    // here rather than at seed time, so it stays in sync as players are
    // added/removed all season instead of freezing whatever the roster
    // looked like on import day. Only applies while the squad is still
    // empty: the moment a coach saves the match (PUT), its squad becomes
    // real match data and this overlay stops applying to it. Covers every
    // visible team (default + followed), not just default_team, so a
    // followed team's fixtures show its real roster too.
    const teamsNeedingRoster = [...new Set(
      rows.filter(r => r.owner_id === 'hockey-one' && (r.data.squad?.length ?? 0) === 0).map(r => r.data.team as string)
    )]
    const rosterByTeam = new Map<string, { id: string; name: string; photoUrl: string | null }[]>()
    for (const t of teamsNeedingRoster) {
      const rosterRows = await sql`
        SELECT tp.id, tp.name, tp.photo_url FROM team_players tp
        JOIN teams t ON t.id = tp.team_id
        WHERE lower(t.name) = lower(${t})
        ORDER BY tp.sort_order, tp.name
      `
      rosterByTeam.set(t, rosterRows.map(r => ({ id: r.id, name: r.name, photoUrl: r.photo_url })))
    }
    // Player names in a game's squad are only for roster staff/admins — a
    // Speler, Supporter, or not-yet-verified account gets initials instead,
    // same trust boundary as the roster/staff endpoints below. This is the
    // one choke point every match-viewing surface (field, bench, timeline,
    // stats, goal scorers) reads names through, so redacting it here covers
    // all of them without any client-side changes. Checked per-team (via
    // effectiveRoleForTeam), not off a single global role, so an elevated
    // role on one team doesn't leak full names on a team the viewer only has
    // Supporter-level (or no) access to.
    const adminFlag = await isAdmin(user)
    res.status(200).json(rows.map(r => {
      const teamRole = effectiveRoleForTeam(defaultTeam, primaryRole, followedTeams, r.data.team)
      let permission: string | undefined
      if (r.owner_id === user.id) permission = 'owner'
      else if (r.share_permission) permission = r.share_permission
      else if (teamRole && ELIGIBLE_ROLES.includes(teamRole)) permission = 'edit'
      else if (visibleTeams.includes(r.data.team)) permission = 'view'
      const roster = rosterByTeam.get(r.data.team) ?? []
      const needsRoster = r.owner_id === 'hockey-one' && (r.data.squad?.length ?? 0) === 0 && roster.length > 0
      let data = needsRoster ? { ...r.data, squad: roster.map(p => ({ id: p.id, name: p.name, photoUrl: p.photoUrl ?? undefined })) } : r.data
      if (!canSeeFullNames(teamRole, adminFlag) && Array.isArray(data.squad)) {
        data = { ...data, squad: data.squad.map((p: { name?: string }) => (p.name ? { ...p, name: initials(p.name) } : p)) }
      }
      return { ...data, ownerId: r.owner_id, permission, updatedAt: new Date(r.updated_at).toISOString() }
    }))
    return
  }

  if (req.method === 'POST') {
    const game = req.body
    if (!game?.id) { res.status(400).json({ error: 'Missing id' }); return }
    const safeGame = JSON.parse(JSON.stringify(game))
    // Explicit millisecond truncation, here and on the PUT below — Postgres
    // `now()` carries microsecond precision, but a JS Date (and the
    // updatedAt string round-tripped through it) only ever has millisecond
    // precision, so the untruncated column default would never exactly
    // match what a client sends back, and the optimistic-concurrency guard
    // on PUT would treat every save as a conflict with itself.
    const rows = await sql`
      INSERT INTO games (id, data, user_id, updated_at) VALUES (${safeGame.id}, ${JSON.stringify(safeGame)}::jsonb, ${user.id}, date_trunc('milliseconds', now()))
      RETURNING updated_at
    `
    res.status(201).json({ ...safeGame, ownerId: user.id, permission: 'owner', updatedAt: new Date(rows[0].updated_at).toISOString() })
    return
  }

  if (req.method === 'PUT') {
    const game = req.body
    if (!game?.id) { res.status(400).json({ error: 'Missing id' }); return }
    const me = await sql`SELECT default_team, role, followed_teams FROM users WHERE id = ${user.id}`
    const teamRole = effectiveRoleForTeam(me[0]?.default_team ?? null, me[0]?.role ?? null, (me[0]?.followed_teams ?? []) as FollowedTeam[], game.team)
    const eligible = !!teamRole && ELIGIBLE_ROLES.includes(teamRole)
    // Owner can always edit; a shared user needs an explicit 'edit' grant; a
    // coach/trainer/manager can also edit any other match for a team they
    // hold that role for — their own default_team, or a followed team with
    // an elevated role — not just Hockey-One-owned fixtures (see the
    // matching GET branch above for the read-side rule this mirrors).
    //
    // `expectedUpdatedAt` guards against two sessions editing the same match
    // at once — e.g. a phone left open on a match from before kickoff,
    // still sitting there hours later while someone else has been recording
    // the real score/played time on another device. Without this, the
    // UPDATE below is a blind overwrite: whichever save lands last wins
    // completely, silently erasing everything the other session wrote —
    // this is how a whole match's score and played time can come back
    // reset after the game. A client that sends its last-known updatedAt
    // only succeeds if nobody else has saved in between; otherwise the row
    // is left untouched and the client gets the current server data back
    // with a 409 instead of clobbering it. Null (an older client, or a
    // brand-new match's very first save) skips the guard.
    const expectedUpdatedAt = typeof game.updatedAt === 'string' ? game.updatedAt : null
    const rows = await sql`
      UPDATE games g SET data = ${JSON.stringify(game)}::jsonb, updated_at = date_trunc('milliseconds', now())
      WHERE g.id = ${game.id}
        -- Compared at millisecond precision: rows last written before the
        -- date_trunc above still carry microseconds, which the client can
        -- never echo back exactly, so a plain equality would make every
        -- save to an older match a spurious conflict.
        AND (${expectedUpdatedAt}::timestamptz IS NULL OR date_trunc('milliseconds', g.updated_at) = ${expectedUpdatedAt}::timestamptz)
        AND (
          g.user_id = ${user.id}
          OR EXISTS (SELECT 1 FROM game_shares gs WHERE gs.game_id = g.id AND gs.user_id = ${user.id} AND gs.permission = 'edit')
          OR (${eligible} AND g.data->>'team' = ${game.team})
        )
      RETURNING data, g.user_id AS owner_id, g.updated_at
    `
    if (rows.length === 0) {
      // Either genuinely not found/not permitted, or it exists but
      // updated_at moved on since this client last read it — tell those
      // two apart by re-running the same permission check without the
      // guard, so a real 404 doesn't get reported as a conflict.
      const check = await sql`
        SELECT data, g.user_id AS owner_id, g.updated_at FROM games g
        WHERE g.id = ${game.id}
          AND (
            g.user_id = ${user.id}
            OR EXISTS (SELECT 1 FROM game_shares gs WHERE gs.game_id = g.id AND gs.user_id = ${user.id} AND gs.permission = 'edit')
            OR (${eligible} AND g.data->>'team' = ${game.team})
          )
      `
      if (check.length === 0) { res.status(404).json({ error: 'Not found' }); return }
      res.status(409).json({
        error: 'Conflict',
        ...check[0].data,
        ownerId: check[0].owner_id,
        permission: check[0].owner_id === user.id ? 'owner' : 'edit',
        updatedAt: new Date(check[0].updated_at).toISOString(),
      })
      return
    }
    res.status(200).json({ ...rows[0].data, ownerId: rows[0].owner_id, permission: rows[0].owner_id === user.id ? 'owner' : 'edit', updatedAt: new Date(rows[0].updated_at).toISOString() })
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
