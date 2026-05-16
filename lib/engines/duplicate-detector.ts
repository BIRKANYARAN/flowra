// Duplicate Expense Detector — CFO anomaly suggestion (Phase A, rule-based)
//
// Detects likely duplicate expense entries by matching:
//   • Same amount_try + same expense_type + within 7 days
//   • Same amount_try + same vendor_name  + within 14 days
//
// Returns DuplicateGroup[] sorted by confidence (high first).
// CFO reviews these suggestions — no automatic action is taken.

import { round2 } from '@/lib/calc'

export type DuplicateConfidence = 'high' | 'medium'

export interface ExpenseRow {
  id:           string
  expense_date: string    // YYYY-MM-DD
  expense_type: string
  amount_try:   number
  vendor_name?: string | null
  description?: string | null
}

export interface DuplicateGroup {
  confidence:   DuplicateConfidence
  reason:       string
  amount_try:   number
  expense_type: string
  rows:         { id: string; expense_date: string; vendor_name: string | null }[]
  message:      string
}

// ── Main detector ──────────────────────────────────────────────────────────

export function detectDuplicates(expenses: ExpenseRow[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []
  const seen = new Set<string>()

  // Sort by date ascending
  const sorted = [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date))

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]

      // Break early if too far apart in time
      const daysDiff = daysBetween(a.expense_date, b.expense_date)
      if (daysDiff > 14) break

      const pairKey = [a.id, b.id].sort().join('_')
      if (seen.has(pairKey)) continue

      const amountMatch = Math.abs(a.amount_try - b.amount_try) < 0.01
      if (!amountMatch) continue

      let confidence: DuplicateConfidence | null = null
      let reason = ''

      // High confidence: same type + same amount + ≤7 days
      if (a.expense_type === b.expense_type && daysDiff <= 7) {
        confidence = 'high'
        reason     = `Aynı gider tipi (${a.expense_type}) + aynı tutar, ${daysDiff} gün arayla`
      }
      // Medium confidence: same vendor + same amount + ≤14 days
      else if (
        a.vendor_name && b.vendor_name &&
        a.vendor_name.toLowerCase().trim() === b.vendor_name.toLowerCase().trim() &&
        daysDiff <= 14
      ) {
        confidence = 'medium'
        reason     = `Aynı tedarikçi (${a.vendor_name}) + aynı tutar, ${daysDiff} gün arayla`
      }

      if (!confidence) continue

      seen.add(pairKey)

      groups.push({
        confidence,
        reason,
        amount_try:   round2(a.amount_try),
        expense_type: a.expense_type,
        rows: [
          { id: a.id, expense_date: a.expense_date, vendor_name: a.vendor_name ?? null },
          { id: b.id, expense_date: b.expense_date, vendor_name: b.vendor_name ?? null },
        ],
        message: `${confidence === 'high' ? '⚠️ Muhtemel kopya' : '🔍 Olası kopya'}: ₺${round2(a.amount_try)} — ${reason}`,
      })
    }
  }

  // Sort: high confidence first, then by amount desc
  return groups.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1
    return b.amount_try - a.amount_try
  })
}

// ── Helper ─────────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  return Math.abs(
    Math.round((new Date(dateB).getTime() - new Date(dateA).getTime()) / 86_400_000)
  )
}
