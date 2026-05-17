// ── DEPRECATED — alias for /api/fx ───────────────────────────────────────────
// Kept so external integrations (Postman collections, old bookmarks) don't 404.
// All internal code should use /api/fx directly.

export { dynamic, GET } from '../fx/route'
