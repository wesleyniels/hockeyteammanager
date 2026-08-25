import { ROSTER_STAFF_ROLES } from './team-access.js'

// Whether this viewer's own role entitles them to see real player/staff
// names rather than initials-only. Speler, Supporter, and no role at all
// yet (a freshly-registered, unverified account) are all low-trust for this
// purpose — only roster staff and admins see who's actually who. This is
// deliberately the same trust boundary as ROSTER_STAFF_ROLES (team-access.ts):
// if you're allowed to manage the roster, you're allowed to see it.
export function canSeeFullNames(role: string | null, isAdminFlag: boolean): boolean {
  return isAdminFlag || ROSTER_STAFF_ROLES.includes(role ?? '')
}

// Mirrors the client-side avatar-fallback initials() in src/App.tsx (kept
// separate since frontend and API code aren't shared bundles). Used here to
// redact a real name into something still visually distinct — so a bench
// list etc. doesn't just show a wall of identical placeholders — without
// revealing who's actually who.
export function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase()
}
