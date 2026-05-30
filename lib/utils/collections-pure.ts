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

// ── New helpers ───────────────────────────────────────────────────────────────

/**
 * Classify an aging bucket from days overdue.
 *   <=0  → 'current'
 *   1-30 → '1_30'
 *   31-60 → '31_60'
 *   61-90 → '61_90'
 *   >90  → '91_plus'
 */
export function classifyAgingBucket(
  daysOverdue: number,
): 'current' | '1_30' | '31_60' | '61_90' | '91_plus' {
  if (daysOverdue <= 0)  return 'current'
  if (daysOverdue <= 30) return '1_30'
  if (daysOverdue <= 60) return '31_60'
  if (daysOverdue <= 90) return '61_90'
  return '91_plus'
}

/**
 * Compute a collection priority score in [0, 100].
 * Higher score = more urgent.
 *
 * Weights:
 *   40% amount  — normalised to ₺1 000 000 cap
 *   40% days    — normalised to 180-day cap
 *   20% no-payment bonus — 20 pts when previousPayments === 0, else 0
 */
export function computeCollectionPriority(
  amountTry: number,
  daysOverdue: number,
  previousPayments: number,
): number {
  const amountScore = Math.min(amountTry / 1_000_000, 1) * 40
  const daysScore   = Math.min(Math.max(daysOverdue, 0) / 180, 1) * 40
  const paymentBonus = previousPayments === 0 ? 20 : 0
  return Math.round(Math.min(amountScore + daysScore + paymentBonus, 100))
}

/**
 * Format an aging bucket label in Turkish.
 */
export function formatAgingBucket(bucket: string): string {
  const map: Record<string, string> = {
    current:  'Vadesi Gelmemiş',
    '1_30':   '1-30 Gün',
    '31_60':  '31-60 Gün',
    '61_90':  '61-90 Gün',
    '91_plus':'90+ Gün',
  }
  return map[bucket] ?? bucket
}

/**
 * Sum receivable amounts grouped by bucket.
 * Returns a plain Record<string, number>.
 */
export function sumByBucket(
  items: Array<{ bucket: string; amount: number }>,
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.bucket] = (acc[item.bucket] ?? 0) + item.amount
    return acc
  }, {})
}
