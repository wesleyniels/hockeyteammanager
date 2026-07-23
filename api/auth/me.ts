import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromCookies } from '../_lib/session'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }
  res.status(200).json({ user })
}
