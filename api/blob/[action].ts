import type { VercelRequest, VercelResponse } from '@vercel/node'
import { del } from '@vercel/blob'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionFromCookies } from '../_lib/session.js'

// /api/blob/upload and /api/blob/delete collapsed into one dynamic-segment
// file — see the comment in api/auth/[action].ts for why (Hobby plan's
// 12-function cap). URLs callers hit are unchanged.

// Authorizes direct-from-browser uploads to Vercel Blob so match photos/videos
// never have to pass through this function's body (which is capped around
// 4.5MB) — the client SDK calls here first for a short-lived token, then PUTs
// the file straight to Blob storage.
async function handleUploadAction(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const body = req.body as HandleUploadBody
    const jsonResponse = await handleUpload({
      body,
      // handleUpload only reads a couple of headers off this — Vercel's own
      // Node.js/Pages-Router examples pass the plain req object the same way.
      request: req as any,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'],
        maximumSizeInBytes: 200 * 1024 * 1024,
        addRandomSuffix: true,
      }),
    })
    res.status(200).json(jsonResponse)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
}

// Not scoped to game ownership — Blob URLs carry an unguessable random
// suffix, and (like users-list.ts) this is a small, closed club roster where
// "authenticated" is an acceptable bar for a basic media feature.
async function handleDeleteAction(req: VercelRequest, res: VercelResponse) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  switch (req.query.action) {
    case 'upload': return handleUploadAction(req, res)
    case 'delete': return handleDeleteAction(req, res)
    default: res.status(404).json({ error: 'Not found' })
  }
}
