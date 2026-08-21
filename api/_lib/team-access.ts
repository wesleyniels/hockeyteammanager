import { sql } from './db.js'
import type { SessionUser } from './session.js'

// Adding a player and editing their photo are the full extent of what any
// non-admin can do to a roster — renaming or removing a player entirely is
// beheerder-only (checked via isAdmin(user) directly at the call site, not
// through anything here). Role and team-assignment are both stored on the
// user, not derived from anything guessable, so this can't be bypassed by
// crafting a request.
export const ROSTER_STAFF_ROLES = ['Coach', 'Trainer', 'Trainer & Coach', 'Manager']

export async function isRosterStaffOfTeamName(userId: string, teamName: string): Promise<boolean> {
  const rows = await sql`SELECT role, default_team FROM users WHERE id = ${userId}`
  const u = rows[0]
  if (!u) return false
  return ROSTER_STAFF_ROLES.includes(u.role) && !!u.default_team && u.default_team.toLowerCase() === teamName.toLowerCase()
}

export async function getPlayerTeamName(playerId: string): Promise<string | null> {
  const rows = await sql`
    SELECT t.name AS team_name FROM team_players tp JOIN teams t ON t.id = tp.team_id WHERE tp.id = ${playerId}
  `
  return rows[0]?.team_name ?? null
}

export async function isPhotoEditorForPlayer(user: SessionUser, playerId: string): Promise<boolean> {
  const teamName = await getPlayerTeamName(playerId)
  return !!teamName && isRosterStaffOfTeamName(user.id, teamName)
}
