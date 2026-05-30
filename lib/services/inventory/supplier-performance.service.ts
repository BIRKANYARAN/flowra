// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/inventory/supplier-performance.service.ts
//
// Supplier Performance — on-time rate, performance grading, and overdue detection.
//
// Pure helper exports allow deterministic unit testing without DB access.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Compute on-time delivery rate as a percentage.
 * Returns 0 if totalDeliveries is 0.
 */
export function computeOnTimeRate(
  onTimeDeliveries: number,
  totalDeliveries: number,
): number {
  if (totalDeliveries === 0) return 0
  return (onTimeDeliveries / totalDeliveries) * 100
}

export type SupplierGrade = 'A' | 'B' | 'C' | 'D' | 'F'

/**
 * Grade supplier performance based on fulfillment rate and on-time rate.
 *   A : fulfillmentRate >= 95 AND onTimeRate >= 90
 *   B : fulfillmentRate >= 85 AND onTimeRate >= 75
 *   C : fulfillmentRate >= 75 AND onTimeRate >= 60
 *   D : fulfillmentRate >= 60 AND onTimeRate >= 40
 *   F : else
 */
export function gradeSupplierPerformance(
  fulfillmentRate: number,
  onTimeRate: number,
): SupplierGrade {
  if (fulfillmentRate >= 95 && onTimeRate >= 90) return 'A'
  if (fulfillmentRate >= 85 && onTimeRate >= 75) return 'B'
  if (fulfillmentRate >= 75 && onTimeRate >= 60) return 'C'
  if (fulfillmentRate >= 60 && onTimeRate >= 40) return 'D'
  return 'F'
}

/**
 * Detect if a purchase order is overdue.
 * Returns true if status is 'ordered' or 'pending' AND expectedDate < today.
 * Both dates should be ISO date strings (YYYY-MM-DD or full ISO).
 */
export function isOverdue(
  expectedDate: string,
  today: string,
  status: string,
): boolean {
  const pendingStatuses = new Set(['ordered', 'pending'])
  if (!pendingStatuses.has(status)) return false
  return expectedDate.slice(0, 10) < today.slice(0, 10)
}
