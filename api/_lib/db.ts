import { neon } from '@neondatabase/serverless'

export const sql = neon(process.env.POSTGRES_URL!)

// Every serverless invocation is a cold-start candidate, so this runs on
// (almost) every request; `??=` memoizes it per warm instance rather than
// re-running the ALTERs every time. Intentionally no unique index on
// lower(email) here — unverified test data from earlier development could
// collide and break this for every route, so uniqueness is enforced at the
// application layer (register.ts) instead.
let schemaReady: Promise<unknown> | null = null
export function ensureSchema() {
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
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_team TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ`
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
