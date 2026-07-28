import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionFromCookies } from '../_lib/session.js'

// Authorizes direct-from-browser uploads to Vercel Blob so match photos/videos
// never have to pass through this function's body (which is capped around
// 4.5MB) — the client SDK calls here first for a short-lived token, then PUTs
// the file straight to Blob storage.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }
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
