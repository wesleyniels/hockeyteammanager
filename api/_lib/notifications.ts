import { sql } from './db.js'
import { randomUUID } from './crypto.js'

// Called directly from other routes (game-shares.ts, admin/users.ts) rather
// than exposed as its own HTTP endpoint — notifications are always triggered
// by a server-side event, never created by a client request.
export async function createNotification(userId: string, type: string, body: string, gameId?: string) {
  await sql`
    INSERT INTO notifications (id, user_id, type, body, game_id)
    VALUES (${randomUUID()}, ${userId}, ${type}, ${body}, ${gameId ?? null})
  `
}
