import { sql } from './db.js'

// Hardcoded allowlist for the one admin who predates the self-serve
// users.is_admin column (see api/admin/users.ts) — anyone granted the role
// later shows up via getAdminEmails() instead.
const ADMIN_EMAILS = new Set(['wesleyniels@gmail.com'])

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase())
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
