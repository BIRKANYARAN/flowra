// ─────────────────────────────────────────────────────────────────────────────
// lib/db/index.ts — Contract Integrity System barrel export
//
// Import from '@/lib/db' to access all contract integrity primitives:
//   - schema: canonical column names, table names, pre-built select strings
//   - mappers: typed row-to-DTO mapping functions
//   - guards: financial invariant assertions (throw on violation)
//   - mutation-audit: fire-and-forget financial mutation audit layer
// ─────────────────────────────────────────────────────────────────────────────

export * from './schema'
export * from './mappers'
export * from './guards'
export * from './mutation-audit'
