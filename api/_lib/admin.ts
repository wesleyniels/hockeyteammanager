import { sql } from './db.js'
import type { SessionUser } from './session.js'

// Hardcoded allowlist for the one admin who predates the self-serve
// users.is_admin column (see api/admin/users.ts) — anyone granted the role
// later shows up via getAdminEmails() instead.
const ADMIN_EMAILS = new Set(['wesleyniels@gmail.com'])

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase())
}

// Shared by every route that lets an admin act outside their own team/data
// (api/teams/[action].ts's team & player-photo management, api/blob's
// player-photo upload/delete). Checks the hardcoded allowlist first to avoid
// a query for the one admin who predates users.is_admin.
export async function isAdmin(user: SessionUser): Promise<boolean> {
  if (isAdminEmail(user.email)) return true
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${user.id}`
  return rows[0]?.is_admin === true
}

// All beheerders who should hear about admin-relevant events (e.g. a new
// registration) — the hardcoded allowlist plus anyone granted the role via
// users.is_admin.
export async function getAdminEmails(): Promise<string[]> {
  const rows = await sql`SELECT email FROM users WHERE is_admin = true`
  const emails = new Set(ADMIN_EMAILS)
  for (const r of rows) emails.add(String(r.email).toLowerCase())
  return [...emails]
}
