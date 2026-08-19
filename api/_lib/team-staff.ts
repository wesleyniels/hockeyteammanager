import { sql } from './db.js'

// Roles that require a name match against team_staff (see
// team-staff-roster.ts) before a user can self-select them in Profile —
// distinct from messages.ts' ELIGIBLE_ROLES (which governs messaging/match
// permissions for already-set roles, and doesn't include Manager).
export const ELEVATED_ROLES = ['Trainer', 'Coach', 'Trainer & Coach', 'Manager']

export async function isVerifiedStaffName(teamName: string, firstName: string, lastName: string): Promise<boolean> {
  const fn = firstName.trim()
  const ln = lastName.trim()
  if (!teamName || !fn || !ln) return false
  const rows = await sql`
    SELECT 1 FROM team_staff ts JOIN teams t ON t.id = ts.team_id
    WHERE lower(t.name) = lower(${teamName})
      AND lower(ts.first_name) = lower(${fn})
      AND lower(ts.last_name) = lower(${ln})
    LIMIT 1
  `
  return rows.length > 0
}
