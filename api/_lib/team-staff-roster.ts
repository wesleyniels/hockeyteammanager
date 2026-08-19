// Source of truth for "who's really a trainer/coach/manager of which team,
// according to Lisa" — Lisa (SC Muiden's club administration system) has no
// public API and is otherwise only reachable through its iOS/Android app or
// its separate club-admin web portal (beheer.lisahockey.nl), so this is a
// one-time-per-season hand transcription of each team's "Ondersteuning"
// list, the same approach team-fixtures.ts uses for match schedules.
//
// Used only to gate self-selecting an elevated Rol in Profile (see
// isVerifiedStaffName in team-staff.ts and the PUT /api/auth/me check in
// api/auth/[action].ts) — a name match here is what unlocks Trainer/Coach/
// Trainer & Coach/Manager instead of leaving only Speler/Supporter
// available. Re-transcribe by hand each season as Lisa's assignments change.
export const TEAM_STAFF: Record<string, { role: 'Trainer' | 'Coach' | 'Manager'; firstName: string; lastName: string }[]> = {}
