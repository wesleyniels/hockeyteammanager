import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { getSessionFromCookies } from './_lib/session'

const sql = neon(process.env.POSTGRES_URL!)

let schemaReady: Promise<unknown> | null = null
function ensureSchema() {
  schemaReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`
  })()
  return schemaReady
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema()

  const user = getSessionFromCookies(req.headers.cookie)
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }

  if (req.method === 'GET') {
    const rows = await sql`SELECT data FROM games WHERE user_id = ${user.id} ORDER BY created_at ASC`
    res.status(200).json(rows.map(r => r.data))
    return
  }

  if (req.method === 'POST') {
    const game = req.body
    if (!game?.id) { res.status(400).json({ error: 'Missing id' }); return }
    await sql`INSERT INTO games (id, data, user_id) VALUES (${game.id}, ${JSON.stringify(game)}::jsonb, ${user.id})`
    res.status(201).json(game)
    return
  }

  if (req.method === 'PUT') {
    const game = req.body
    if (!game?.id) { res.status(400).json({ error: 'Missing id' }); return }
    const rows = await sql`
      UPDATE games SET data = ${JSON.stringify(game)}::jsonb, updated_at = now()
      WHERE id = ${game.id} AND user_id = ${user.id}
      RETURNING data
    `
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return }
    res.status(200).json(rows[0].data)
    return
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : req.body?.id
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }
    await sql`DELETE FROM games WHERE id = ${id} AND user_id = ${user.id}`
    res.status(204).end()
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
