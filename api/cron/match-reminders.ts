import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureSchema } from '../_lib/db.js'
import { createNotification } from '../_lib/notifications.js'
import { ELIGIBLE_ROLES } from '../_lib/messages.js'

// Match dates are plain YYYY-MM-DD strings with no time-of-day (see
// SavedGame in src/App.tsx), so "48 hours before" can only ever mean
// "exactly 2 calendar days before" -- comparing date strings directly
// (rather than through JS Date arithmetic against `now`) sidesteps any
// timezone-conversion drift. The cron itself runs at 07:00 UTC (see
// vercel.json), comfortably mid-morning in the club's own timezone
// (Europe/Amsterdam), so the UTC-vs-local date boundary near midnight
// never comes into play here.
function targetDateString(): string {
  const now = new Date()
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2))
  return target.toISOString().slice(0, 10)
}

// Runs once a day (see vercel.json's cron schedule) and reminds every
// coach/trainer connected to a team that its match in 2 days still has an
// empty squad. A game only ever matches `date = targetDate` on one calendar
// day, and filling in even a single player drops it out of the
// `jsonb_array_length(...) = 0` filter for good — but a retried or
// manually-rerun cron invocation on the *same* day would otherwise
// double-send, so already-notified recipients are still explicitly
// excluded per game below.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel signs cron-triggered requests with this header; without checking
  // it, this would otherwise be a public, unauthenticated way for anyone to
  // spam every coach/trainer's Meldingen inbox on demand.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  await ensureSchema()

  const targetDate = targetDateString()
  const games = await sql`
    SELECT id, data->>'team' AS team, data->>'opponent' AS opponent, data->>'homeAway' AS home_away
    FROM games
    WHERE data->>'date' = ${targetDate}
      AND jsonb_array_length(COALESCE(data->'squad', '[]'::jsonb)) = 0
  `

  let sent = 0
  for (const game of games) {
    if (!game.team) continue
    const recipients = await sql`
      SELECT u.id FROM users u
      WHERE u.default_team = ${game.team} AND u.role = ANY(${ELIGIBLE_ROLES}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.game_id = ${game.id} AND n.type = 'match-reminder'
        )
    `
    if (recipients.length === 0) continue
    const matchLabel = game.home_away === 'Uit' ? `${game.team} @ ${game.opponent}` : `${game.team} vs ${game.opponent}`
    const body = `Over 2 dagen speelt ${matchLabel} en er is nog geen selectie ingevuld. Vul op tijd de selectie in via Wedstrijden.`
    for (const r of recipients) {
      await createNotification(r.id, 'match-reminder', body, game.id)
      sent++
    }
  }

  res.status(200).json({ ok: true, gamesChecked: games.length, notificationsSent: sent })
}
