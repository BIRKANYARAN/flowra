'use client'

// ── AnomalyBadge — shows anomaly warning on expense category rows ──────────────
// Sprint 4: displayed inline on categories that exceed 2× trailing average

interface AnomalyBadgeProps {
  /** The multiplier vs trailing 6-month average, e.g. 4.2 */
  ratio: number
  /** Trailing average amount in TRY */
  avgTry: number
}

function fmtTRY(n: number) {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₺${Math.round(n / 1_000)}K`
  return `₺${Math.round(n)}`
}

export function AnomalyBadge({ ratio, avgTry }: AnomalyBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-warn-light text-warn-text border border-warn/30"
      title={`Mevcut ay, ${ratio.toFixed(1)}× ortalamayı (${fmtTRY(avgTry)}) aşıyor`}
    >
      ⚠ ANOMALİ {ratio.toFixed(1)}×
    </span>
  )
}
