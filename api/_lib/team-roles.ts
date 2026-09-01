export interface FollowedTeam { team: string; role: string }

// The single place that resolves "what role does this user hold for team X"
// — their own primary role if X is their default_team, whatever they picked
// for it if X is one of their followed teams (see followed_teams in
// db.ts), or null if they have no association with X at all. Every
// edit/roster/full-name permission check should go through this rather than
// reading default_team/role directly, so a followed team's role can't drift
// out of sync with how the primary team is treated.
export function effectiveRoleForTeam(
  defaultTeam: string | null,
  primaryRole: string | null,
  followedTeams: FollowedTeam[],
  team: string,
): string | null {
  if (defaultTeam && defaultTeam.toLowerCase() === team.toLowerCase()) return primaryRole
  const f = followedTeams.find(f => f.team.toLowerCase() === team.toLowerCase())
  return f ? f.role : null
}
