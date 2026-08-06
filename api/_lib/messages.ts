import { sql } from './db.js'
import { getAdminEmails } from './admin.js'

export const ELIGIBLE_ROLES = ['Coach', 'Trainer', 'Trainer & Coach']

// "Hockey One" is the app's own virtual support contact — always
// messageable by anyone (see canMessage below), including players and
// supporters who can't message anyone else. This is a standalone concept,
// independent of admin status: this account doesn't need to be (and isn't
// by default) a beheerder for the always-messageable rule to apply.
export const HOCKEY_ONE_EMAIL = 'admin@hockeyone.nl'
const HOCKEY_ONE_ID = 'hockey-one'

export interface MessagingUser {
  id: string
  email: string
  name: string | null
  first_name: string | null
  last_name: string | null
  default_club: string | null
  role: string | null
}

export function isHockeyOne(email: string): boolean {
  return email.toLowerCase() === HOCKEY_ONE_EMAIL
}

export function displayName(u: Pick<MessagingUser, 'email' | 'name' | 'first_name' | 'last_name'>): string {
  if (isHockeyOne(u.email)) return 'Hockey One'
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || u.email
}

export async function loadAdminEmailSet(): Promise<Set<string>> {
  return new Set(await getAdminEmails())
}

// "Always messageable" can't depend on someone having actually logged in
// with this address first — a fresh deployment would otherwise show no
// Hockey One contact at all until that happens. Looked up by email (not
// assumed to be HOCKEY_ONE_ID) in case a real login later creates its own
// row before this ever runs; the fixed id is only a fallback for the
// first-ever provisioning, guarded by ON CONFLICT so concurrent callers
// can't create two rows for it.
export async function ensureHockeyOneUser(): Promise<string> {
  const existing = await sql`SELECT id FROM users WHERE lower(email) = ${HOCKEY_ONE_EMAIL}`
  if (existing.length > 0) return existing[0].id
  await sql`
    INSERT INTO users (id, email, name, email_verified) VALUES (${HOCKEY_ONE_ID}, ${HOCKEY_ONE_EMAIL}, 'Hockey One', true)
    ON CONFLICT (id) DO NOTHING
  `
  return HOCKEY_ONE_ID
}

// A coach/trainer can message another coach/trainer at the same club, or
// any beheerder (who can in turn message any coach/trainer, no club bar
// either direction) — see the feature spec this implements. Players and
// supporters can neither send nor receive, admin status notwithstanding,
// except for Hockey One, which is always reachable by anyone.
export function canMessage(sender: MessagingUser, recipient: MessagingUser, adminEmails: Set<string>): boolean {
  if (isHockeyOne(recipient.email)) return true

  const senderIsAdmin = adminEmails.has(sender.email.toLowerCase())
  const recipientIsAdmin = adminEmails.has(recipient.email.toLowerCase())
  const senderEligible = senderIsAdmin || ELIGIBLE_ROLES.includes(sender.role ?? '')
  const recipientEligible = recipientIsAdmin || ELIGIBLE_ROLES.includes(recipient.role ?? '')
  if (!senderEligible || !recipientEligible) return false
  if (senderIsAdmin || recipientIsAdmin) return true
  return !!sender.default_club && !!recipient.default_club
    && sender.default_club.toLowerCase() === recipient.default_club.toLowerCase()
}
