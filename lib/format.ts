// ─────────────────────────────────────────────────────────────────────────────
// lib/format.ts — Canonical UI-layer formatters (Flowra Executive OS)
//
// SINGLE source for all display formatting. Import from here, not inline.
// DO NOT use these in backend/API code or store formatted strings in DB.
// Apply ONLY in render/display paths (React components, page.tsx).
// ─────────────────────────────────────────────────────────────────────────────

// ── Intl instances (created once, reused) ─────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const TRY_FMT_0 = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

// ── Currency symbol resolver ──────────────────────────────────────────────────

export function sym(currency: string): string {
  switch (currency) {
    case 'USD': return '$'
    case 'EUR': return '€'
    case 'GBP': return '£'
    case 'CHF': return 'Fr'
    default:    return '₺'
  }
}

// ── Core TRY formatters ───────────────────────────────────────────────────────

/** "1.234.567,89" — raw number, no currency symbol */
export function fmtNum(value: number, decimals = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value) || 0)
}

/** "₺1.234.567,89" — TRY with symbol prefix */
export function fmtTRY(value: number, decimals = 2): string {
  const fmt = decimals === 0 ? TRY_FMT_0 : TRY_FMT
  return '₺' + fmt.format(Number(value) || 0)
}

/** "1.234.567,89 TL" — legacy suffix format (PDF, accountant reports) */
export function formatTRY(value: number): string {
  return TRY_FMT.format(Number(value) || 0) + ' TL'
}

/** Multi-currency: "₺1.234" | "$1.234" | "€1.234" */
export function fmtMoney(value: number, currency = 'TRY', decimals = 2): string {
  return sym(currency) + fmtNum(value, decimals)
}

/** Abbreviated KPI format: "₺1,2M" | "₺450B" | "₺12.500" */
export function fmtCompact(value: number, currency = 'TRY'): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const s = sym(currency)
  if (abs >= 1_000_000) return `${sign}${s}${PCT_FMT.format(abs / 1_000_000)}M`
  if (abs >= 1_000)     return `${sign}${s}${TRY_FMT_0.format(abs / 1_000)}B`
  return `${sign}${s}${fmtNum(abs, 0)}`
}

// ── Date formatters ───────────────────────────────────────────────────────────

/** "15.05.2025" — Turkish short date */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return String(d) }
}

/** "Mayıs 2025" — long month + year */
export function fmtMonth(d: string | Date | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  } catch { return String(d) }
}

/** "May 25" — short for charts/axes */
export function fmtMonthShort(yyyyMM: string): string {
  try {
    const [y, m] = yyyyMM.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' })
  } catch { return yyyyMM }
}

/** "15 Mayıs 2025, 14:30" — full datetime */
export function fmtDatetime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('tr-TR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return String(d) }
}

/** "3 gün önce" | "2 saat önce" — relative time */
export function fmtRelative(d: string | Date | null | undefined): string {
  if (!d) return '—'
  try {
    const ms = Date.now() - new Date(d).getTime()
    const mins  = Math.floor(ms / 60_000)
    const hours = Math.floor(ms / 3_600_000)
    const days  = Math.floor(ms / 86_400_000)
    if (mins  < 1)   return 'az önce'
    if (mins  < 60)  return `${mins} dk önce`
    if (hours < 24)  return `${hours} saat önce`
    if (days  < 30)  return `${days} gün önce`
    return fmtDate(d)
  } catch { return String(d) }
}

// ── Percentage & ratio formatters ─────────────────────────────────────────────

/** "%12,5" — percentage with sign */
export function fmtPct(value: number, decimals = 1): string {
  return '%' + new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value) || 0)
}

/** "+12,5%" | "-3,2%" — signed percentage (for deltas) */
export function fmtDelta(value: number, decimals = 1): string {
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value) || 0)
  return (value >= 0 ? '+' : '−') + formatted + '%'
}

// ── Runway / duration formatters ──────────────────────────────────────────────

/** "4 ay" | "14 gün" | "∞" — cash runway display */
export function fmtRunway(months: number | null | undefined): string {
  if (months === null || months === undefined || !isFinite(months)) return '∞'
  if (months >= 24) return `${Math.floor(months / 12)} yıl`
  if (months >= 1)  return `${Math.round(months)} ay`
  const days = Math.round(months * 30)
  return `${days} gün`
}

/** "12 ay" | "3 yıl 6 ay" — period display */
export function fmtPeriod(months: number): string {
  if (months < 12) return `${months} ay`
  const y = Math.floor(months / 12)
  const m = months % 12
  return m > 0 ? `${y} yıl ${m} ay` : `${y} yıl`
}

// ── FX rate formatter ─────────────────────────────────────────────────────────

/** "32,4500" — 4-decimal FX rate */
export function fmtRate(rate: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number(rate) || 0)
}

// ── Tone resolver (for KPI cards) ─────────────────────────────────────────────

export type Tone = 'positive' | 'negative' | 'neutral' | 'warning'

/** Derive display tone from a numeric value */
export function toneFromValue(value: number, inverse = false): Tone {
  if (value === 0) return 'neutral'
  const positive = value > 0
  return (positive !== inverse) ? 'positive' : 'negative'
}

/** Derive tone from percentage (threshold-aware) */
export function toneFromPct(pct: number, warningThreshold = 20): Tone {
  if (pct >= warningThreshold) return 'positive'
  if (pct > 0)                 return 'warning'
  return 'negative'
}
