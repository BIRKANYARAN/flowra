// ─────────────────────────────────────────────────────────────────────────────
// lib/format.ts — UI-layer currency formatters
//
// DO NOT use these in backend/API code or store formatted values in DB.
// Apply ONLY in render/display paths (React components, page.tsx).
// ─────────────────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format a TRY amount for display: 1000000 → "1.000.000,00 TL"
 * Thousands separator: "."  Decimal separator: ","  Suffix: " TL"
 */
export function formatTRY(value: number): string {
  return TRY_FMT.format(Number(value) || 0) + ' TL'
}

export function sym(c: string): string {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '₺'
}

export function fmtMoney(n: number, currency = 'TRY'): string {
  const v = Number(n) || 0
  return sym(currency) + v.toFixed(2)
}

export function fmtDate(d: string): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
