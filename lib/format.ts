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
