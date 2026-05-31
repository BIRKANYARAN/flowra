// ═══════════════════════════════════════════════════════════════════════════════
// DB error classification
//
// Production hardening: distinguish "schema gap" failures (a table or column that
// the code expects but the live database does not yet have — e.g. a migration not
// applied) from genuine runtime errors. Schema gaps should degrade gracefully to
// an empty/partial result rather than surfacing a hard 500 to the user, while
// still being logged loudly so ops can apply the missing migration.
//
// Postgres error codes:
//   42P01 undefined_table   · 42703 undefined_column · 42P10 invalid_column_reference
// PostgREST schema-cache codes: PGRST200, PGRST202, PGRST204, PGRST205
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEMA_GAP_CODES = new Set([
  '42P01', '42703', '42P10',
  'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205',
])

const SCHEMA_GAP_MESSAGE_RE =
  /(does not exist|could not find the .* (table|column|relationship)|schema cache|undefined (table|column)|relation ".*" does not exist|column ".*" does not exist)/i

/**
 * True when `err` indicates the live schema is missing a table/column the code
 * expects (un-applied migration), as opposed to a real query/logic error.
 */
export function isMissingSchemaError(err: unknown): boolean {
  if (err == null) return false
  // PostgREST error object shape: { code, message, details, hint }
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string' && SCHEMA_GAP_CODES.has(code)) return true
  const msg =
    err instanceof Error ? err.message :
    typeof err === 'string' ? err :
    typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message :
    ''
  return SCHEMA_GAP_MESSAGE_RE.test(msg)
}
