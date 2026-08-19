import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureSchema } from './_lib/db.js'
import { getSessionFromCookies } from './_lib/session.js'
import { isVerifiedStaffName } from './_lib/team-staff.js'

// Lets Profile's Rol dropdown check, live as someone types their name,
// whether they're eligible to pick an elevated role — the actual
// enforcement happens server-side in PUT /api/auth/me; this only exists so
// the dropdown can show/hide options instead of letting someone pick
// something the save would reject anyway.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const team = typeof req.query.team === 'string' ? req.query.team : ''
  const firstName = typeof req.query.firstName === 'string' ? req.query.firstName : ''
  const lastName = typeof req.query.lastName === 'string' ? req.query.lastName : ''
  const eligible = await isVerifiedStaffName(team, firstName, lastName)
  res.status(200).json({ eligible })
}
