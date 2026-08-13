import type { VercelRequest, VercelResponse } from '@vercel/node'
import { OAuth2Client } from 'google-auth-library'
import { sql, ensureSchema } from '../_lib/db.js'
import { hashPassword, verifyPassword, newToken, randomUUID } from '../_lib/crypto.js'
import { signSession, sessionCookieHeader, clearSessionCookieHeader, getSessionFromCookies } from '../_lib/session.js'
import { sendVerificationEmail, sendNewRegistrationEmail, sendPasswordResetEmail } from '../_lib/email.js'
import { toUser } from '../_lib/users.js'
import { getAdminEmails } from '../_lib/admin.js'
import { createNotification } from '../_lib/notifications.js'

// All /api/auth/* routes are collapsed into this single dynamic-segment file
// (dispatching on the [action] path piece below) — Vercel's Hobby plan caps
// a deployment at 12 Serverless Functions, and each file under /api used to
// count as one regardless of how small. Nothing about the URLs callers hit
// changes: /api/auth/google, /api/auth/me, etc. still resolve here exactly
// as they did as separate files.

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
// Shorter than email-verification's TTL — a password-reset link is more
// sensitive (it lets someone straight into the account), so it expires fast.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000
const MAX_PICTURE_LENGTH = 2_000_000 // ~1.5MB decoded — the client resizes photos well below this

// A regex here is the wrong tool, not just a matter of getting one right —
// two attempts at this shape ([^\s@]+\.[^\s@]+, then a repeated-label
// version) both turned out to be quadratic-time on a crafted string, on
// this unauthenticated register/login endpoint. Plain string ops can't
// backtrack: indexOf/lastIndexOf/includes/slice are all linear, and the
// only regex left (/\s/, no quantifier) has nothing to be ambiguous about.
function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false
  if (/\s/.test(email)) return false
  const at = email.indexOf('@')
  if (at <= 0 || at !== email.lastIndexOf('@') || at === email.length - 1) return false
  const domain = email.slice(at + 1)
  const dot = domain.indexOf('.')
  if (dot <= 0 || dot === domain.length - 1 || domain.includes('..')) return false
  return true
}

const PASSWORD_POLICY_ERROR = 'Wachtwoord moet minstens 8 tekens bevatten, met een hoofdletter, kleine letter, cijfer en speciaal teken'

// Plain character-class scan, same reasoning as isValidEmail above: no
// regex needed, so there's nothing to backtrack on this unauthenticated
// endpoint.
function isStrongPassword(password: string): boolean {
  if (password.length < 8) return false
  let hasUpper = false, hasLower = false, hasDigit = false, hasSpecial = false
  for (const ch of password) {
    if (ch >= 'A' && ch <= 'Z') hasUpper = true
    else if (ch >= 'a' && ch <= 'z') hasLower = true
    else if (ch >= '0' && ch <= '9') hasDigit = true
    else hasSpecial = true
  }
  return hasUpper && hasLower && hasDigit && hasSpecial
}

function originOf(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https'
  return `${proto}://${req.headers.host}`
}

// Best-effort — a failure here shouldn't affect the new user's own request.
async function notifyAdminsOfNewRegistration(email: string, name: string | null) {
  try {
    await sendNewRegistrationEmail(await getAdminEmails(), email, name)
  } catch (err) {
    console.error('Failed to notify admins of new registration', err)
  }
}

function welcomeNotificationBody(name: string | null): string {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  return `${greeting} welkom bij Hockey One! Deze app helpt je met het maken van opstellingen voor de wedstrijden van je team. De app houdt ook bij hoe lang je spelers op de bank zitten en hoe lang ze al in het veld staan. Tevens kun je verschillende tactieken opnemen voor bijvoorbeeld strafcorners. Daarnaast is het ook mogelijk om berichten te sturen naar andere coaches, trainers of managers van dezelfde club. Heb je nog vragen, opmerkingen of andere meldingen dan kun je via berichten ook je vraag aan Hockey One stellen. Succes! Groeten, Hockey One.`
}

// Best-effort, same reasoning as notifyAdminsOfNewRegistration — a brand new
// account should never fail to be created just because this notification
// couldn't be written.
async function sendWelcomeNotification(userId: string, name: string | null) {
  try {
    await createNotification(userId, 'welcome', welcomeNotificationBody(name))
  } catch (err) {
    console.error('Failed to send welcome notification', err)
  }
}

async function handleGoogle(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const credential = req.body?.credential
  if (!credential) { res.status(400).json({ error: 'Missing credential' }); return }

  let payload
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })
    payload = ticket.getPayload()
  } catch {
    res.status(401).json({ error: 'Invalid Google credential' })
    return
  }
  if (!payload?.sub || !payload.email) { res.status(401).json({ error: 'Invalid Google credential' }); return }

  const email = payload.email.toLowerCase()
  const name = payload.name ?? null
  const picture = payload.picture ?? null
  const verified = payload.email_verified ?? true

  // Look the account up by email rather than by Google's `sub` — this is the
  // same person if they already registered with a password using this
  // address, so we reuse that row instead of creating a second account with
  // the same email.
  const existing = await sql`SELECT id FROM users WHERE lower(email) = ${email}`

  let rows
  if (existing.length > 0) {
    const id = existing[0].id
    // Keep any name/photo the user already set (e.g. an uploaded profile
    // photo) rather than overwriting it with Google's every time they log in.
    rows = await sql`
      UPDATE users SET
        email = ${email},
        name = COALESCE(name, ${name}),
        picture = COALESCE(picture, ${picture}),
        email_verified = email_verified OR ${verified}
      WHERE id = ${id}
      RETURNING id, email, name, picture, default_team, default_club, first_name, last_name, role
    `
  } else {
    rows = await sql`
      INSERT INTO users (id, email, name, picture, email_verified)
      VALUES (${payload.sub}, ${email}, ${name}, ${picture}, ${verified})
      RETURNING id, email, name, picture, default_team, default_club, first_name, last_name, role
    `
    await notifyAdminsOfNewRegistration(email, name)
    await sendWelcomeNotification(payload.sub, name)
  }

  const u = rows[0]
  res.setHeader('Set-Cookie', sessionCookieHeader(signSession({ id: u.id, email: u.email, name: u.name, picture: u.picture })))
  res.status(200).json({ user: toUser(u) })
}

const LOGIN_LOCK_THRESHOLD = 5
const LOGIN_LOCK_MS = 15 * 60 * 1000

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')

  const rows = await sql`SELECT * FROM users WHERE lower(email) = ${email}`
  const row = rows[0]

  // Locked accounts are rejected before touching the password hash at all —
  // this stops a brute-force loop from continuing to burn scrypt cycles once
  // it's already tripped the limit.
  if (row?.login_locked_until && new Date(row.login_locked_until) > new Date()) {
    res.status(429).json({ error: 'Te veel mislukte inlogpogingen. Probeer het over 15 minuten opnieuw.' })
    return
  }

  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    // Only accounts that actually exist accumulate a counter — there's no
    // row to rate-limit for an email nobody registered, and the response is
    // identical either way so this can't be used to probe which emails exist.
    if (row) {
      const attempts = (row.failed_logins ?? 0) + 1
      const locked = attempts >= LOGIN_LOCK_THRESHOLD
      await sql`
        UPDATE users SET
          failed_logins = ${locked ? 0 : attempts},
          login_locked_until = ${locked ? new Date(Date.now() + LOGIN_LOCK_MS).toISOString() : null}
        WHERE id = ${row.id}
      `
    }
    res.status(401).json({ error: 'Onjuiste e-mail of wachtwoord' })
    return
  }
  if (!row.email_verified) {
    res.status(403).json({ error: 'Bevestig eerst je e-mailadres via de link die we je gestuurd hebben.', code: 'unverified' })
    return
  }

  if (row.failed_logins || row.login_locked_until) {
    await sql`UPDATE users SET failed_logins = 0, login_locked_until = NULL WHERE id = ${row.id}`
  }

  res.setHeader('Set-Cookie', sessionCookieHeader(signSession({ id: row.id, email: row.email, name: row.name, picture: row.picture })))
  res.status(200).json({ user: toUser(row) })
}

function handleLogout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  res.setHeader('Set-Cookie', clearSessionCookieHeader())
  res.status(200).json({ ok: true })
}

// The session cookie only proves *who* is signed in — mutable profile fields
// are read fresh from the DB on every call so a change shows up immediately
// instead of waiting for the next login.
async function handleMe(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromCookies(req.headers.cookie)
  if (!session) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    const rows = await sql`SELECT id, email, name, picture, default_team, default_club, first_name, last_name, role FROM users WHERE id = ${session.id}`
    if (rows.length === 0) { res.status(401).json({ error: 'Not authenticated' }); return }
    res.status(200).json({ user: toUser(rows[0]) })
    return
  }

  if (req.method === 'PUT') {
    const body = req.body ?? {}
    for (const key of ['defaultTeam', 'defaultClub', 'firstName', 'lastName', 'role', 'picture']) {
      if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') {
        res.status(400).json({ error: `Invalid ${key}` })
        return
      }
    }
    if (typeof body.picture === 'string' && body.picture.length > MAX_PICTURE_LENGTH) {
      res.status(400).json({ error: 'Foto is te groot' })
      return
    }
    const current = await sql`SELECT default_team, default_club, first_name, last_name, role, picture FROM users WHERE id = ${session.id}`
    if (current.length === 0) { res.status(401).json({ error: 'Not authenticated' }); return }
    const cur = current[0]
    // A key only changes if the caller actually sent it — this lets Setup's
    // team-select send just { defaultTeam } without touching name/role, while
    // still letting any field be explicitly cleared back to null/empty.
    const defaultTeam = 'defaultTeam' in body ? (body.defaultTeam || null) : cur.default_team
    const defaultClub = 'defaultClub' in body ? (body.defaultClub || null) : cur.default_club
    const firstName = 'firstName' in body ? (body.firstName || null) : cur.first_name
    const lastName = 'lastName' in body ? (body.lastName || null) : cur.last_name
    const role = 'role' in body ? (body.role || null) : cur.role
    const picture = 'picture' in body ? (body.picture || null) : cur.picture
    const rows = await sql`
      UPDATE users SET
        default_team = ${defaultTeam},
        default_club = ${defaultClub},
        first_name = ${firstName},
        last_name = ${lastName},
        role = ${role},
        picture = ${picture}
      WHERE id = ${session.id}
      RETURNING id, email, name, picture, default_team, default_club, first_name, last_name, role
    `
    if (rows.length === 0) { res.status(401).json({ error: 'Not authenticated' }); return }
    res.status(200).json({ user: toUser(rows[0]) })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}

async function handleRegister(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  const name = req.body?.name ? String(req.body.name).trim() : null

  if (!isValidEmail(email)) { res.status(400).json({ error: 'Ongeldig e-mailadres' }); return }
  if (!isStrongPassword(password)) { res.status(400).json({ error: PASSWORD_POLICY_ERROR }); return }

  const existing = await sql`SELECT id FROM users WHERE lower(email) = ${email}`
  if (existing.length > 0) { res.status(409).json({ error: 'Dit e-mailadres is al geregistreerd' }); return }

  const id = randomUUID()
  const token = newToken()
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  await sql`
    INSERT INTO users (id, email, name, password_hash, email_verified, verification_token, verification_expires)
    VALUES (${id}, ${email}, ${name}, ${hashPassword(password)}, false, ${token}, ${expires})
  `
  await notifyAdminsOfNewRegistration(email, name)
  await sendWelcomeNotification(id, name)

  try {
    const origin = originOf(req)
    await sendVerificationEmail(email, name, `${origin}/api/auth/verify-email?token=${token}`, origin)
  } catch (err) {
    console.error('Failed to send verification email', err)
    res.status(502).json({ error: 'Account aangemaakt, maar de verificatie-e-mail kon niet worden verzonden. Probeer opnieuw in te loggen om een nieuwe link aan te vragen.' })
    return
  }

  res.status(201).json({ ok: true })
}

async function handleResendVerification(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const rows = await sql`SELECT id, name, email_verified, password_hash FROM users WHERE lower(email) = ${email}`
  const row = rows[0]

  // Always respond the same way regardless of whether the account exists or
  // is already verified, so this endpoint can't be used to probe emails.
  if (row?.password_hash && !row.email_verified) {
    const token = newToken()
    const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
    await sql`UPDATE users SET verification_token = ${token}, verification_expires = ${expires} WHERE id = ${row.id}`
    const origin = originOf(req)
    const verifyUrl = `${origin}/api/auth/verify-email?token=${token}`
    try {
      await sendVerificationEmail(email, row.name, verifyUrl, origin)
    } catch (err) {
      console.error('Failed to resend verification email', err)
    }
  }

  res.status(200).json({ ok: true })
}

// Unlike verify-email, the link here points straight at the SPA (?reset=
// token) rather than an API route — resetting needs the user to type a new
// password first, which a GET redirect can't collect, so the token is only
// actually consumed by handleResetPassword below once they submit the form.
async function handleForgotPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const rows = await sql`SELECT id, name, password_hash FROM users WHERE lower(email) = ${email}`
  const row = rows[0]

  // Always respond the same way regardless of whether the account exists —
  // this endpoint can't be used to probe which emails are registered. Only
  // password accounts get a reset link; a Google-only account has no
  // password to reset.
  if (row?.password_hash) {
    const token = newToken()
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString()
    await sql`UPDATE users SET reset_token = ${token}, reset_expires = ${expires} WHERE id = ${row.id}`
    const origin = originOf(req)
    const resetUrl = `${origin}/?reset=${token}`
    try {
      await sendPasswordResetEmail(email, row.name, resetUrl, origin)
    } catch (err) {
      console.error('Failed to send password reset email', err)
    }
  }

  res.status(200).json({ ok: true })
}

async function handleResetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const token = String(req.body?.token ?? '')
  const password = String(req.body?.password ?? '')
  if (!token) { res.status(400).json({ error: 'Ontbrekende token' }); return }
  if (!isStrongPassword(password)) { res.status(400).json({ error: PASSWORD_POLICY_ERROR }); return }

  const rows = await sql`SELECT id, email, name, picture, reset_expires FROM users WHERE reset_token = ${token}`
  const row = rows[0]
  if (!row || new Date(row.reset_expires) < new Date()) {
    res.status(400).json({ error: 'Deze link is ongeldig of verlopen. Vraag een nieuwe aan.' })
    return
  }

  // Clicking the link proves mailbox ownership, same reasoning as
  // verify-email — also clears any brute-force lockout, since a successful
  // reset is a stronger signal than the failed attempts that caused it.
  const updated = await sql`
    UPDATE users SET
      password_hash = ${hashPassword(password)},
      reset_token = NULL,
      reset_expires = NULL,
      email_verified = true,
      failed_logins = 0,
      login_locked_until = NULL
    WHERE id = ${row.id}
    RETURNING id, email, name, picture, default_team, default_club, first_name, last_name, role
  `

  res.setHeader('Set-Cookie', sessionCookieHeader(signSession({ id: row.id, email: row.email, name: row.name, picture: row.picture })))
  res.status(200).json({ user: toUser(updated[0]) })
}

async function handleVerifyEmail(req: VercelRequest, res: VercelResponse) {
  const appUrl = originOf(req)
  const token = typeof req.query.token === 'string' ? req.query.token : ''

  if (!token) { res.redirect(302, `${appUrl}/?verify=error`); return }

  const rows = await sql`SELECT id, email, name, picture, verification_expires FROM users WHERE verification_token = ${token}`
  const row = rows[0]
  if (!row || new Date(row.verification_expires) < new Date()) {
    res.redirect(302, `${appUrl}/?verify=error`)
    return
  }

  await sql`UPDATE users SET email_verified = true, verification_token = NULL, verification_expires = NULL WHERE id = ${row.id}`

  // Verifying proves ownership of the mailbox, so sign them straight in —
  // no reason to make them re-type the password they just chose.
  res.setHeader('Set-Cookie', sessionCookieHeader(signSession({ id: row.id, email: row.email, name: row.name, picture: row.picture })))
  res.redirect(302, `${appUrl}/?verify=ok`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()

  switch (req.query.action) {
    case 'google': return handleGoogle(req, res)
    case 'login': return handleLogin(req, res)
    case 'logout': return handleLogout(req, res)
    case 'me': return handleMe(req, res)
    case 'register': return handleRegister(req, res)
    case 'resend-verification': return handleResendVerification(req, res)
    case 'verify-email': return handleVerifyEmail(req, res)
    case 'forgot-password': return handleForgotPassword(req, res)
    case 'reset-password': return handleResetPassword(req, res)
    default: res.status(404).json({ error: 'Not found' })
  }
}
