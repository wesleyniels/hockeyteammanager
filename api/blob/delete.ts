import type { VercelRequest, VercelResponse } from '@vercel/node'
import { del } from '@vercel/blob'
import { getSessionFromCookies } from '../_lib/session.js'

// Not scoped to game ownership — Blob URLs carry an unguessable random
// suffix, and (like users-list.ts) this is a small, closed club roster where
// "authenticated" is an acceptable bar for a basic media feature.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const url = req.body?.url
  if (!url || typeof url !== 'string') { res.status(400).json({ error: 'Missing url' }); return }

  try {
    await del(url)
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
}
