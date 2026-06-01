// ─────────────────────────────────────────────────────────────────────────────
// lib/finance/truncation.ts
//
// Zero-import pure kernel — safe to import from any client- or server-reachable
// module (no supabase, no next/headers, no server-only deps).
//
// "No silent caps" principle: many analytics queries cap their row count
// (`.limit(N)`) for safety. When the cap is HIT, any total / aging / DSO figure
// derived from those rows is SILENTLY UNDERSTATED. This helper turns that silent
// truncation into an observable log line (it never fails the request).
//
// Usage:
//   const warn = aggregateTruncationWarning('receivables-aging', [
//     { name: 'outstanding_sales', count: rows.length, cap: 5000 },
//   ])
//   if (warn) console.warn(warn)
// ─────────────────────────────────────────────────────────────────────────────

export interface TruncationStep {
  /** Human-readable name of the capped query/step. */
  name:  string
  /** Number of rows actually returned. */
  count: number
  /** The `.limit(cap)` applied to the query. */
  cap:   number
}

/**
 * Returns a warning string if ANY step's row count reached its cap (i.e. the
 * result was probably truncated and the derived aggregate is understated), or
 * null if every step is safely under its cap.
 */
export function aggregateTruncationWarning(
  label: string,
  steps: TruncationStep[],
): string | null {
  const tripped = steps.filter(s => s.count >= s.cap)
  if (tripped.length === 0) return null
  return `[${label}] aggregate likely UNDERSTATED — row cap hit: ` +
    tripped.map(s => `${s.name}=${s.count}≥${s.cap}`).join(', ') +
    `. Totals/aging/DSO derived from these rows are affected; raise the cap or narrow the window.`
}
