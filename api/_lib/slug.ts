// Mirrors the client-side helper that used to live in src/App.tsx — kept
// here now that both team-id generation (db.ts) and team creation
// (teams/[action].ts) need it server-side.
//
// The trailing two replaces are split rather than combined into a single
// /^-+|-+$/g, which is the textbook quadratic-time ReDoS shape (CodeQL
// flags it directly) — the shared `g`-flag scan across the whole string
// makes a long run of dashes get re-attempted once per dash. Each split
// call is anchored with nothing else to backtrack against, so it's O(n).
export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '')
