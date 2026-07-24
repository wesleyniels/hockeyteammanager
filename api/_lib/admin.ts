// Hardcoded allowlist rather than a users.role column — there's exactly one
// admin today and no self-serve way to grant the role, so a DB-backed
// permission system would be pure overhead.
const ADMIN_EMAILS = new Set(['wesleyniels@gmail.com'])

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase())
}
