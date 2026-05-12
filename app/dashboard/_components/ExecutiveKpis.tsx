// ── ExecutiveKpis — vital signals column ─────────────────────────────────────
//
// Right-side vertical KPI stack in the Executive Command Center.
// Answers: "How is the company doing?"
//
// Four signals (in order):
//   1. Nakit Pozisyon   — true cash balance + distributable sub
//   2. Runway           — days until cash exhaustion
//   3. Bu Ay Net        — period net profit/loss (accrual)
//   4. Dağıtılabilir    — available for partner distribution
//
// Visual language:
//   • Compact horizontal card — label on left, value on right
//   • Tone indicator: thin left border strip (emerald / red / gray)
//   • One-line sub-text for context
//   • Tabular numerals for visual scanning

import Link from 'next/link'
import type { CfoMetrics } from '@/lib/finance/cfo-metrics'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tone = 'positive' | 'negative' | 'neutral' | 'warning'

interface KpiConfig {
  label:    string
  value:    string   // pre-formatted
  sub:      string
  tone:     Tone
  href:     string
}

// ── Formatting ────────────────────────────────────────────────────────────────

const TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmt(n: number): string {
  const abs = Math.abs(Number(n || 0))
  const s   = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${s}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${s}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${s}₺${TRY.format(abs)}`
}

function pct(v: number): string {
  return `%${(v * 100).toFixed(1).replace('.', ',')}`
}

// ── KPI card ──────────────────────────────────────────────────────────────────

const TONE_BORDER: Record<Tone, string> = {
  positive: 'border-l-emerald-400',
  negative: 'border-l-red-400',
  warning:  'border-l-amber-400',
  neutral:  'border-l-gray-200',
}
const TONE_VALUE: Record<Tone, string> = {
  positive: 'text-gray-900',
  negative: 'text-red-600',
  warning:  'text-amber-700',
  neutral:  'text-gray-600',
}

function KpiCard({ label, value, sub, tone, href }: KpiConfig) {
  return (
    <Link href={href}
      className={`
        flex items-center justify-between gap-3 px-4 py-3
        bg-white border border-l-4 border-gray-100 ${TONE_BORDER[tone]}
        rounded-xl hover:shadow-sm hover:border-gray-200 transition-all
      `}>

      {/* Label + sub */}
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-gray-400 leading-none mb-1">
          {label}
        </div>
        <div className="text-[10px] text-gray-400 leading-snug truncate">{sub}</div>
      </div>

      {/* Value */}
      <div className={`flex-shrink-0 text-xl font-black tabular-nums leading-none ${TONE_VALUE[tone]}`}>
        {value}
      </div>
    </Link>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  metrics:       CfoMetrics
  netAfterTax:   number
  grossMarginPct: number
}

export function ExecutiveKpis({ metrics, netAfterTax, grossMarginPct }: Props) {
  const cash         = metrics.cash.true_cash_position
  const distributable = metrics.cash.distributable_cash
  const runway        = metrics.burn.runway_days

  // ── KPI 1: Nakit Pozisyon ────────────────────────────────────────────────────
  const kpi1: KpiConfig = {
    label: 'Nakit Pozisyon',
    value: fmt(cash),
    sub: cash >= 0
      ? distributable > 0
        ? `${fmt(distributable)} dağıtılabilir`
        : 'Yükümlülükler düşüldü'
      : 'Negatif bakiye ⚠',
    tone: cash >= 0 ? 'positive' : 'negative',
    href: '/dashboard/cashflow',
  }

  // ── KPI 2: Runway ────────────────────────────────────────────────────────────
  const kpi2: KpiConfig = {
    label: 'Runway',
    value: runway !== null ? `${runway}g` : '∞',
    sub: runway === null
      ? 'Zarar döngüsü yok'
      : runway <= 30  ? '🔥 Kritik — acil aksiyon'
      : runway <= 90  ? '⚠ Yakın takip gerekiyor'
      : 'Sağlıklı görünüm',
    tone: runway === null ? 'positive'
        : runway <= 30   ? 'negative'
        : runway <= 90   ? 'warning'
        : 'positive',
    href: '/dashboard/simulation',
  }

  // ── KPI 3: Bu Ay Net ─────────────────────────────────────────────────────────
  const kpi3: KpiConfig = {
    label: 'Bu Ay Net',
    value: fmt(netAfterTax),
    sub: grossMarginPct > 0
      ? `Brüt marj ${pct(grossMarginPct)}`
      : 'Satış yok bu dönem',
    tone: netAfterTax > 0 ? 'positive' : netAfterTax < 0 ? 'negative' : 'neutral',
    href: '/dashboard/analytics',
  }

  // ── KPI 4: Dağıtılabilir ─────────────────────────────────────────────────────
  const kpi4: KpiConfig = {
    label: 'Dağıtılabilir',
    value: distributable > 0 ? fmt(distributable) : '—',
    sub: distributable > 0
      ? 'Dağıtıma hazır'
      : 'Henüz dağıtılamaz',
    tone: distributable > 0 ? 'positive' : 'neutral',
    href: '/dashboard/partners',
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
          Vital Sinyaller
        </span>
      </div>

      {/* KPI stack */}
      <div className="flex flex-col gap-2">
        <KpiCard {...kpi1} />
        <KpiCard {...kpi2} />
        <KpiCard {...kpi3} />
        <KpiCard {...kpi4} />
      </div>

    </div>
  )
}
