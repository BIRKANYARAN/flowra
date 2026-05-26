// ── Collections pure utilities ─────────────────────────────────────────────
// Pure functions extracted from /api/collections/route.ts so they can be
// unit-tested and reused without importing the Next.js route module.

/**
 * Sanitize an incoming `amount_paid` value from the request body.
 * - null/undefined → null (caller should leave the existing DB value intact)
 * - NaN/non-numeric string/negative → 0 (safe floor)
 * - Valid positive number → the number itself
 */
export function sanitizePaidAmount(v: number | string | null | undefined): number | null {
  if (v == null) return null
  return Math.max(0, Number(v) || 0)
}

/**
 * Compute the risk sort score for a collection row.
 *   score = days_since_due × 0.6 + (amount_try / 10 000) × 0.4
 *
 * Higher score → more urgent (shown first in risk-sorted list).
 */
export function computeCollectionRiskScore(
  row: { due_date?: string | null; sale_date?: string | null; total_try?: number | null },
  today: string,
): number {
  const refDate = row.due_date ?? row.sale_date ?? ''
  const days = refDate
    ? Math.max(0, Math.round(
        (new Date(today).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000
      ))
    : 0
  const amtTry = Number(row.total_try ?? 0)
  return days * 0.6 + (amtTry / 10_000) * 0.4
}
