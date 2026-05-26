// ─────────────────────────────────────────────────────────────────────────────
// lib/admin/journal-backfill.ts
//
// Pure helper for computing journal entry backfill status.
// No DB or I/O — safe to unit test in isolation.
// ─────────────────────────────────────────────────────────────────────────────

export interface OperationalCounts {
  sales:     number
  expenses:  number
  purchases: number
}

export interface BackfillStatus {
  backfill_complete: boolean
  missing: {
    sales:     number
    expenses:  number
    purchases: number
  }
  total_missing: number
}

/**
 * Compute which operational records still lack a journal entry.
 *
 * A category is considered "missing" when journaledCount < operationalCount.
 * backfill_complete is true only when total_missing === 0.
 */
export function computeBackfillStatus(
  operationalCounts: OperationalCounts,
  journaledCounts:   OperationalCounts,
): BackfillStatus {
  const missingSales     = Math.max(0, (operationalCounts.sales     ?? 0) - (journaledCounts.sales     ?? 0))
  const missingExpenses  = Math.max(0, (operationalCounts.expenses  ?? 0) - (journaledCounts.expenses  ?? 0))
  const missingPurchases = Math.max(0, (operationalCounts.purchases ?? 0) - (journaledCounts.purchases ?? 0))
  const totalMissing     = missingSales + missingExpenses + missingPurchases

  return {
    backfill_complete: totalMissing === 0,
    missing: {
      sales:     missingSales,
      expenses:  missingExpenses,
      purchases: missingPurchases,
    },
    total_missing: totalMissing,
  }
}
