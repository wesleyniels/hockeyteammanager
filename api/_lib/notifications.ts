import { sql } from './db.js'
import { randomUUID } from './crypto.js'
import { sendNotificationEmail } from './email.js'

// Called directly from other routes (game-shares.ts, admin/users.ts) rather
// than exposed as its own HTTP endpoint — notifications are always triggered
// by a server-side event, never created by a client request.
//
// Also emails the user the same content (sendNotificationEmail) — best
// effort, same reasoning as sendWelcomeNotification/
// notifyAdminsOfNewRegistration in auth/[action].ts: a failed send here must
// never stop the in-app notification (the primary channel, already written
// above) from existing.
export async function createNotification(userId: string, type: string, body: string, gameId?: string) {
  const id = randomUUID()
  await sql`
    INSERT INTO notifications (id, user_id, type, body, game_id)
    VALUES (${id}, ${userId}, ${type}, ${body}, ${gameId ?? null})
  `
  try {
    const rows = await sql`SELECT email, first_name, name FROM users WHERE id = ${userId}`
    const u = rows[0]
    if (u?.email) await sendNotificationEmail(u.email, u.first_name ?? u.name ?? null, body, id)
  } catch (err) {
    console.error('Failed to email notification', err)
  }
}
