import { sql } from './db.js'
import type { SessionUser } from './session.js'

// Shared by api/teams/[action].ts (player CRUD) and api/blob/[action].ts
// (photo upload/delete) — a coach may only touch players on their own team.
// Role and team-assignment are both stored on the user, not derived from
// anything guessable, so this can't be bypassed by crafting a request.
export async function isCoachOfTeamName(userId: string, teamName: string): Promise<boolean> {
  const rows = await sql`SELECT role, default_team FROM users WHERE id = ${userId}`
  const u = rows[0]
  if (!u) return false
  const isCoach = u.role === 'Coach' || u.role === 'Trainer & Coach'
  return isCoach && !!u.default_team && u.default_team.toLowerCase() === teamName.toLowerCase()
}

export async function getPlayerTeamName(playerId: string): Promise<string | null> {
  const rows = await sql`
    SELECT t.name AS team_name FROM team_players tp JOIN teams t ON t.id = tp.team_id WHERE tp.id = ${playerId}
  `
  return rows[0]?.team_name ?? null
}

export async function canEditPlayer(user: SessionUser, playerId: string): Promise<boolean> {
  const teamName = await getPlayerTeamName(playerId)
  return !!teamName && isCoachOfTeamName(user.id, teamName)
}
