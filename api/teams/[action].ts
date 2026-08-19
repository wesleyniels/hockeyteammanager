import type { VercelRequest, VercelResponse } from '@vercel/node'
import { del as delBlob } from '@vercel/blob'
import { sql, ensureSchema } from '../_lib/db.js'
import { getSessionFromCookies, type SessionUser } from '../_lib/session.js'
import { isAdmin } from '../_lib/admin.js'
import { randomUUID } from '../_lib/crypto.js'
import { slugify } from '../_lib/slug.js'
import { isCoachOfTeamName, canEditPlayer, isPhotoEditorForPlayer } from '../_lib/team-access.js'

// /api/teams/list, /api/teams/roster, etc. collapsed into one dynamic-segment
// file — see the comment in api/auth/[action].ts for why (Hobby plan's
// 12-function cap).

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN
    ?? process.env.TEST_BLOB_READ_WRITE_TOKEN
    ?? process.env.PROD_BLOB_READ_WRITE_TOKEN
}

// Any authenticated user can see team names and rosters/photos — matches the
// rest of the app's "small, closed club, login is the bar" posture. Only the
// mutation actions below are further restricted to coaches/admins.
async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  const rows = await sql`SELECT id, name FROM teams ORDER BY name`
  const teams = rows.map(r => ({ id: r.id as string, name: r.name as string }))
  // M-teams before J-teams, then by age ascending, then alphabetically — same
  // ordering the old client-bundled SC_MUIDEN_TEAM_NAMES used.
  teams.sort((a, b) => {
    const ma = a.name.match(/^([MJ])O(\d+)-?(.*)$/)
    const mb = b.name.match(/^([MJ])O(\d+)-?(.*)$/)
    if (!ma || !mb) return a.name.localeCompare(b.name)
    if (ma[1] !== mb[1]) return ma[1] === 'M' ? -1 : 1
    const na = parseInt(ma[2]), nb = parseInt(mb[2])
    if (na !== nb) return na - nb
    return ma[3].localeCompare(mb[3])
  })
  res.status(200).json({ teams })
}

async function handleRoster(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  const team = typeof req.query.team === 'string' ? req.query.team : ''
  if (!team) { res.status(400).json({ error: 'Missing team' }); return }
  const rows = await sql`
    SELECT tp.id, tp.name, tp.photo_url FROM team_players tp
    JOIN teams t ON t.id = tp.team_id
    WHERE lower(t.name) = lower(${team})
    ORDER BY tp.sort_order, tp.name
  `
  res.status(200).json({ players: rows.map(r => ({ id: r.id, name: r.name, photoUrl: r.photo_url })) })
}

async function handleAddPlayer(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  const team = String(req.body?.team ?? '').trim()
  const name = String(req.body?.name ?? '').trim()
  if (!team || !name) { res.status(400).json({ error: 'Missing team or name' }); return }
  if (!(await isCoachOfTeamName(user.id, team)) && !(await isAdmin(user))) { res.status(403).json({ error: 'Forbidden' }); return }

  const teamRows = await sql`SELECT id FROM teams WHERE lower(name) = lower(${team})`
  if (teamRows.length === 0) { res.status(404).json({ error: 'Team not found' }); return }

  const id = randomUUID()
  const countRows = await sql`SELECT COUNT(*)::int AS n FROM team_players WHERE team_id = ${teamRows[0].id}`
  await sql`INSERT INTO team_players (id, team_id, name, sort_order) VALUES (${id}, ${teamRows[0].id}, ${name}, ${countRows[0].n})`
  res.status(201).json({ id, name, photoUrl: null })
}

async function handleRenamePlayer(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  const id = String(req.body?.id ?? '')
  const name = String(req.body?.name ?? '').trim()
  if (!id || !name) { res.status(400).json({ error: 'Missing id or name' }); return }
  if (!(await canEditPlayer(user, id)) && !(await isAdmin(user))) { res.status(403).json({ error: 'Forbidden' }); return }
  await sql`UPDATE team_players SET name = ${name} WHERE id = ${id}`
  res.status(200).json({ ok: true })
}

async function handleRemovePlayer(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return }
  const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id
  if (!id) { res.status(400).json({ error: 'Missing id' }); return }
  if (!(await canEditPlayer(user, id)) && !(await isAdmin(user))) { res.status(403).json({ error: 'Forbidden' }); return }

  const rows = await sql`SELECT photo_url FROM team_players WHERE id = ${id}`
  await sql`DELETE FROM team_players WHERE id = ${id}`
  if (rows[0]?.photo_url) {
    try { await delBlob(rows[0].photo_url, { token: blobToken() }) } catch { /* best-effort cleanup */ }
  }
  res.status(200).json({ ok: true })
}

async function handleSetPlayerPhoto(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  const id = String(req.body?.id ?? '')
  const url = String(req.body?.url ?? '')
  if (!id || !url) { res.status(400).json({ error: 'Missing id or url' }); return }
  if (!(await isPhotoEditorForPlayer(user, id)) && !(await isAdmin(user))) { res.status(403).json({ error: 'Forbidden' }); return }
  await sql`UPDATE team_players SET photo_url = ${url} WHERE id = ${id}`
  res.status(200).json({ ok: true })
}

async function handleRemovePlayerPhoto(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return }
  const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id
  if (!id) { res.status(400).json({ error: 'Missing id' }); return }
  if (!(await isPhotoEditorForPlayer(user, id)) && !(await isAdmin(user))) { res.status(403).json({ error: 'Forbidden' }); return }

  const rows = await sql`SELECT photo_url FROM team_players WHERE id = ${id}`
  await sql`UPDATE team_players SET photo_url = NULL WHERE id = ${id}`
  if (rows[0]?.photo_url) {
    try { await delBlob(rows[0].photo_url, { token: blobToken() }) } catch { /* best-effort cleanup */ }
  }
  res.status(200).json({ ok: true })
}

// Team-level CRUD (a whole new team each season, fixing a club/typo in a
// name) is rare and admin-only — everyday roster changes are the coach
// actions above.
async function handleCreateTeam(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  if (!(await isAdmin(user))) { res.status(403).json({ error: 'Forbidden' }); return }
  const name = String(req.body?.name ?? '').trim()
  if (!name) { res.status(400).json({ error: 'Missing name' }); return }
  const id = slugify(name)
  if (!id) { res.status(400).json({ error: 'Ongeldige teamnaam' }); return }
  const existing = await sql`SELECT 1 FROM teams WHERE id = ${id}`
  if (existing.length > 0) { res.status(409).json({ error: 'Dit team bestaat al' }); return }
  await sql`INSERT INTO teams (id, name) VALUES (${id}, ${name})`
  res.status(201).json({ id, name })
}

async function handleRenameTeam(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  if (!(await isAdmin(user))) { res.status(403).json({ error: 'Forbidden' }); return }
  const id = String(req.body?.id ?? '')
  const name = String(req.body?.name ?? '').trim()
  if (!id || !name) { res.status(400).json({ error: 'Missing id or name' }); return }
  await sql`UPDATE teams SET name = ${name} WHERE id = ${id}`
  res.status(200).json({ ok: true })
}

async function handleDeleteTeam(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return }
  if (!(await isAdmin(user))) { res.status(403).json({ error: 'Forbidden' }); return }
  const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id
  if (!id) { res.status(400).json({ error: 'Missing id' }); return }

  const photoRows = await sql`SELECT photo_url FROM team_players WHERE team_id = ${id} AND photo_url IS NOT NULL`
  await sql`DELETE FROM teams WHERE id = ${id}` // cascades team_players
  await Promise.all(photoRows.map(r => delBlob(r.photo_url, { token: blobToken() }).catch(() => {})))
  res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  switch (req.query.action) {
    case 'list': return handleList(req, res)
    case 'roster': return handleRoster(req, res)
    case 'add-player': return handleAddPlayer(req, res, user)
    case 'rename-player': return handleRenamePlayer(req, res, user)
    case 'remove-player': return handleRemovePlayer(req, res, user)
    case 'set-player-photo': return handleSetPlayerPhoto(req, res, user)
    case 'remove-player-photo': return handleRemovePlayerPhoto(req, res, user)
    case 'create-team': return handleCreateTeam(req, res, user)
    case 'rename-team': return handleRenameTeam(req, res, user)
    case 'delete-team': return handleDeleteTeam(req, res, user)
    default: res.status(404).json({ error: 'Not found' })
  }
}
