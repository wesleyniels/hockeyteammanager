import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { getSessionFromCookies, type SessionUser } from '../_lib/session.js'
import { randomUUID } from '../_lib/crypto.js'
import { ELIGIBLE_ROLES, HOCKEY_ONE_EMAIL, canMessage, displayName, ensureHockeyOneUser, isHockeyOne, loadAdminEmailSet, type MessagingUser } from '../_lib/messages.js'

// /api/messages/contacts, /api/messages/send, etc. collapsed into one
// dynamic-segment file — see the comment in api/auth/[action].ts for why
// (Hobby plan's 12-function cap).

async function loadUser(id: string): Promise<MessagingUser | null> {
  const rows = await sql`SELECT id, email, name, first_name, last_name, default_club, role FROM users WHERE id = ${id}`
  return rows[0] ?? null
}

// Who the caller is allowed to start a conversation with: coaches/trainers
// at their own club, plus every beheerder (Hockey One included) — or, if the
// caller is themselves a beheerder, every coach/trainer regardless of club.
// Players/supporters get just Hockey One (this app's virtual support
// contact, always messageable by anyone — see canMessage) rather than the
// broader list, instead of a 403, since viewing a contact list isn't itself
// forbidden — they just have nobody else eligible to message.
async function handleContacts(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  const me = await loadUser(user.id)
  if (!me) { res.status(401).json({ error: 'Not authenticated' }); return }

  // "Always available" can't wait for that address to have logged in first
  // — provision it (once, ever) before either branch below queries for it.
  await ensureHockeyOneUser()

  const adminEmails = await loadAdminEmailSet()
  const meIsAdmin = adminEmails.has(me.email.toLowerCase())
  const meEligible = meIsAdmin || ELIGIBLE_ROLES.includes(me.role ?? '')
  if (!meEligible) {
    const hockeyOne = await sql`
      SELECT id, email, name, first_name, last_name, default_club, role FROM users
      WHERE lower(email) = ${HOCKEY_ONE_EMAIL} AND id != ${user.id}
    `
    const contacts = hockeyOne.map(r => ({ id: r.id, name: displayName(r), defaultClub: r.default_club, role: r.role, isHockeyOne: true }))
    res.status(200).json({ contacts, canSend: contacts.length > 0 })
    return
  }

  // Hockey One is matched by its own email explicitly here — it's a
  // standalone concept, not something that piggybacks on admin status (it
  // isn't necessarily in adminEmailList at all).
  const adminEmailList = [...adminEmails]
  const rows = meIsAdmin
    ? await sql`
        SELECT id, email, name, first_name, last_name, default_club, role FROM users
        WHERE id != ${user.id} AND (lower(email) = ${HOCKEY_ONE_EMAIL} OR lower(email) = ANY(${adminEmailList}::text[]) OR role = ANY(${ELIGIBLE_ROLES}::text[]))
        ORDER BY first_name, last_name, email
      `
    : await sql`
        SELECT id, email, name, first_name, last_name, default_club, role FROM users
        WHERE id != ${user.id} AND (
          lower(email) = ${HOCKEY_ONE_EMAIL}
          OR lower(email) = ANY(${adminEmailList}::text[])
          OR (role = ANY(${ELIGIBLE_ROLES}::text[]) AND lower(default_club) = lower(${me.default_club ?? ''}))
        )
        ORDER BY first_name, last_name, email
      `
  res.status(200).json({
    canSend: true,
    contacts: rows.map(r => ({
      id: r.id,
      name: displayName(r),
      defaultClub: r.default_club,
      role: r.role,
      isHockeyOne: isHockeyOne(r.email),
    })),
  })
}

// One row per counterparty, most-recently-active first, with an unread
// count per thread — the message center's own "inbox" list.
async function handleConversations(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  const latest = await sql`
    SELECT DISTINCT ON (other_id) other_id, body AS last_body, created_at AS last_at, sender_id
    FROM (
      SELECT CASE WHEN sender_id = ${user.id} THEN recipient_id ELSE sender_id END AS other_id, body, created_at, sender_id
      FROM messages WHERE sender_id = ${user.id} OR recipient_id = ${user.id}
    ) t
    ORDER BY other_id, created_at DESC
  `
  if (latest.length === 0) { res.status(200).json({ conversations: [] }); return }

  const unread = await sql`
    SELECT sender_id AS other_id, COUNT(*)::int AS unread_count
    FROM messages WHERE recipient_id = ${user.id} AND read_at IS NULL
    GROUP BY sender_id
  `
  const unreadMap = new Map(unread.map(r => [r.other_id as string, r.unread_count as number]))
  const otherIds = latest.map(r => r.other_id as string)
  const others = await sql`SELECT id, email, name, first_name, last_name, default_club, role FROM users WHERE id = ANY(${otherIds}::text[])`
  const othersMap = new Map(others.map(o => [o.id as string, o]))

  const conversations = latest.map(r => {
    const other = othersMap.get(r.other_id as string)
    return {
      userId: r.other_id as string,
      name: other ? displayName(other) : 'Onbekend',
      isHockeyOne: other ? isHockeyOne(other.email) : false,
      lastMessage: r.last_body as string,
      lastAt: r.last_at as string,
      mine: r.sender_id === user.id,
      unreadCount: unreadMap.get(r.other_id as string) ?? 0,
    }
  })
  conversations.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
  res.status(200).json({ conversations })
}

// Full history with one counterparty, oldest first — opening it also marks
// their messages to us as read, same "viewing counts as reading" model as
// everywhere else read state shows up in this app.
async function handleThread(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  const otherId = typeof req.query.userId === 'string' ? req.query.userId : ''
  if (!otherId) { res.status(400).json({ error: 'Missing userId' }); return }

  const rows = await sql`
    SELECT id, sender_id, body, created_at FROM messages
    WHERE (sender_id = ${user.id} AND recipient_id = ${otherId}) OR (sender_id = ${otherId} AND recipient_id = ${user.id})
    ORDER BY created_at ASC
  `
  await sql`UPDATE messages SET read_at = now() WHERE recipient_id = ${user.id} AND sender_id = ${otherId} AND read_at IS NULL`
  res.status(200).json({
    messages: rows.map(r => ({ id: r.id, senderId: r.sender_id, body: r.body, createdAt: r.created_at, mine: r.sender_id === user.id })),
  })
}

async function handleSend(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  const recipientId = String(req.body?.recipientId ?? '')
  const body = String(req.body?.body ?? '').trim()
  if (!recipientId || !body) { res.status(400).json({ error: 'Missing recipientId or body' }); return }
  if (body.length > 2000) { res.status(400).json({ error: 'Bericht is te lang (max. 2000 tekens)' }); return }
  if (recipientId === user.id) { res.status(400).json({ error: 'Je kunt geen bericht aan jezelf sturen' }); return }

  const me = await loadUser(user.id)
  const recipient = await loadUser(recipientId)
  if (!me) { res.status(401).json({ error: 'Not authenticated' }); return }
  if (!recipient) { res.status(404).json({ error: 'Gebruiker niet gevonden' }); return }

  // The contacts list is a UI convenience — this is the actual authorization
  // check, and it's re-derived from the DB on every send, not trusted from
  // the client (a coach could otherwise just recipientId their way to
  // anyone by editing the request).
  const adminEmails = await loadAdminEmailSet()
  if (!canMessage(me, recipient, adminEmails)) { res.status(403).json({ error: 'Je kunt geen bericht sturen naar deze gebruiker' }); return }

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  await sql`INSERT INTO messages (id, sender_id, recipient_id, body, created_at) VALUES (${id}, ${user.id}, ${recipientId}, ${body}, ${createdAt})`
  res.status(201).json({ id, senderId: user.id, body, createdAt, mine: true })
}

// Cheap, poll-friendly count for the bottom bar's badge — deliberately
// separate from the heavier conversations list.
async function handleUnreadCount(req: VercelRequest, res: VercelResponse, user: SessionUser) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  const rows = await sql`SELECT COUNT(*)::int AS count FROM messages WHERE recipient_id = ${user.id} AND read_at IS NULL`
  res.status(200).json({ count: rows[0]?.count ?? 0 })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  switch (req.query.action) {
    case 'contacts': return handleContacts(req, res, user)
    case 'conversations': return handleConversations(req, res, user)
    case 'thread': return handleThread(req, res, user)
    case 'send': return handleSend(req, res, user)
    case 'unread-count': return handleUnreadCount(req, res, user)
    default: res.status(404).json({ error: 'Not found' })
  }
}
