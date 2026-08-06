import { getAdminEmails } from './admin.js'

export const ELIGIBLE_ROLES = ['Coach', 'Trainer', 'Trainer & Coach']

// "Hockey One" is a friendly display identity for this one specific admin
// account (see ADMIN_EMAILS in admin.ts) — every other beheerder still shows
// their own real name. It doubles as the app's virtual support contact:
// always messageable by anyone (see canMessage below), even players and
// supporters who can't message anyone else.
export const HOCKEY_ONE_EMAIL = 'wesleyniels@gmail.com'

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

// A coach/trainer can message another coach/trainer at the same club, or
// any beheerder (who can in turn message any coach/trainer, no club bar
// either direction) — see the feature spec this implements. Players and
// supporters can neither send nor receive, admin status notwithstanding.
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
