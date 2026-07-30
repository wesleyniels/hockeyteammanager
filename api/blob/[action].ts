import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Readable } from 'node:stream'
import { del, get, list } from '@vercel/blob'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionFromCookies } from '../_lib/session.js'

// /api/blob/upload, /api/blob/delete and /api/blob/view collapsed into one
// dynamic-segment file — see the comment in api/auth/[action].ts for why
// (Hobby plan's 12-function cap). URLs callers hit are unchanged.

// The store is private (deliberately — these are photos/videos of minors),
// so blob URLs aren't fetchable directly by <img>/<video> tags. Everything
// here uses 'private' access and reads are proxied through handleViewAction.

// @vercel/blob defaults to process.env.BLOB_READ_WRITE_TOKEN, but connecting
// a store with a custom name/prefix in the Vercel dashboard (e.g. a "test"
// store for this environment) prefixes ALL of its env vars, so the token
// shows up as e.g. TEST_BLOB_READ_WRITE_TOKEN instead. Falling back through
// known prefixes here means the code doesn't care which store is connected.
function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN
    ?? process.env.TEST_BLOB_READ_WRITE_TOKEN
    ?? process.env.PROD_BLOB_READ_WRITE_TOKEN
}

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
      token: blobToken(),
      // handleUpload only reads a couple of headers off this — Vercel's own
      // Node.js/Pages-Router examples pass the plain req object the same way.
      request: req as any,
      onBeforeGenerateToken: async pathname => {
        // Player photos live at a stable, predictable pathname (players/...)
        // so re-uploading one replaces it in place instead of accumulating
        // random-suffixed orphans — everything else (match media) keeps a
        // random suffix since a game can have many photos/videos.
        const isPlayerPhoto = pathname.startsWith('players/')
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'],
          maximumSizeInBytes: isPlayerPhoto ? 10 * 1024 * 1024 : 200 * 1024 * 1024,
          addRandomSuffix: !isPlayerPhoto,
          allowOverwrite: isPlayerPhoto,
        }
      },
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
    await del(url, { token: blobToken() })
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
}

// Streams a private blob back through this function — anyone already
// authenticated into the app (same bar as viewing match history at all) can
// view it. Forwards the client's Range header to the blob origin (S3-backed,
// so it supports real byte ranges) — mobile video players issue a Range
// probe before they'll play anything at all, and without this they were
// falling back to a native "open externally" view instead of inline playback.
// Also forces Content-Disposition: inline — Blob objects default to
// "attachment", which made browsers download instead of display them.
async function handleViewAction(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const url = typeof req.query.url === 'string' ? req.query.url : ''
  if (!url) { res.status(400).json({ error: 'Missing url' }); return }

  try {
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
    const result = await get(url, {
      access: 'private',
      token: blobToken(),
      headers: range ? { Range: range } : undefined,
    })
    if (!result || !result.stream) { res.status(404).end(); return }

    const contentRange = result.headers.get('content-range')
    res.setHeader('Accept-Ranges', result.headers.get('accept-ranges') ?? 'bytes')
    res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream')
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    if (result.blob.size) res.setHeader('Content-Length', String(result.blob.size))
    if (contentRange) {
      res.status(206)
      res.setHeader('Content-Range', contentRange)
    }
    Readable.fromWeb(result.stream as any).pipe(res)
  } catch {
    res.status(404).end()
  }
}

// Used to look up which players on a team already have a photo — e.g.
// list({prefix: 'players/mo11-blauw/'}) — since there's no DB row to query.
async function handleListAction(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : ''
  if (!prefix) { res.status(400).json({ error: 'Missing prefix' }); return }

  try {
    const { blobs } = await list({ prefix, token: blobToken() })
    res.status(200).json({ blobs: blobs.map(b => ({ pathname: b.pathname, url: b.url })) })
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
    case 'view': return handleViewAction(req, res)
    case 'list': return handleListAction(req, res)
    default: res.status(404).json({ error: 'Not found' })
  }
}
