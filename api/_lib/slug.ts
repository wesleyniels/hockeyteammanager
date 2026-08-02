// Mirrors the client-side helper that used to live in src/App.tsx — kept
// here now that both team-id generation (db.ts) and team creation
// (teams/[action].ts) need it server-side.
export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
