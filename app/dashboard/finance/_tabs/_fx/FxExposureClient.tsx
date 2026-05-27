'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FxExposureClient
//
// Multi-Currency FX Exposure dashboard panel.
//
// Features:
//   - Period selector: 3 / 6 / 12 months
//   - Summary cards: Total FX Exposure % / Largest Currency / Net Exposure TRY / Unrealized G/L
//   - Hedging recommendation card (colored by risk level)
//   - Currency exposure cards with natural hedge CSS gauge
//   - TRY-only empty state
// ─────────────────────────────────────────────────────────────────────────────

import { useState }      from 'react'
import { useQuery }      from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { FxExposureReport, CurrencyExposure } from '@/lib/services/finance/fx-exposure.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  OTHER: '🌍',
}

const RISK_COLORS: Record<string, string> = {
  minimal:  'text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]',
  moderate: 'text-[#d97706] bg-[#fffbeb] border-[#fde68a]',
  elevated: 'text-[#ea580c] bg-[#fff7ed] border-[#fed7aa]',
  high:     'text-[#dc2626] bg-[#fef2f2] border-[#fecaca]',
}

const RISK_LABELS: Record<string, string> = {
  minimal:  'Düşük',
  moderate: 'Orta',
  elevated: 'Yüksek',
  high:     'Kritik',
}

const PERIOD_OPTIONS = [
  { label: '3 Ay',  value: 3  },
  { label: '6 Ay',  value: 6  },
  { label: '12 Ay', value: 12 },
]

function fmtForeign(amount: number, currency: string): string {
  if (amount === 0) return '—'
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }
  const sym = symbols[currency] ?? ''
  return `${sym}${amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtRate(rate: number | null): string {
  if (rate === null || rate === 0) return '—'
  return `₺${rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'neutral' | 'warning'
}) {
  const valueColor = {
    positive: 'text-[#16a34a]',
    negative: 'text-[#dc2626]',
    warning:  'text-[#d97706]',
    neutral:  'text-[#0f172a]',
  }[tone]

  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
        {label}
      </div>
      <div className={`text-xl font-black tabular-nums leading-none ${valueColor}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[#94a3b8] mt-1 leading-tight">{sub}</div>
      )}
    </div>
  )
}

function NaturalHedgeBar({ ratio }: { ratio: number | null }) {
  if (ratio === null) {
    return <div className="text-[11px] text-[#94a3b8]">Yalnızca Gelir</div>
  }
  // Cap at 100 for display
  const pct    = Math.min(100, Math.max(0, ratio))
  const color  = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
  const label  = pct >= 80 ? 'İyi Hedge' : pct >= 50 ? 'Kısmi' : 'Zayıf'

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[#64748b] font-semibold">Doğal Hedge</span>
        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
          {fmtPct(pct)} · {label}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function CurrencyCard({ exp }: { exp: CurrencyExposure }) {
  const flag      = CURRENCY_FLAGS[exp.currency] ?? '🌍'
  const riskCls   = RISK_COLORS[exp.risk_level] ?? RISK_COLORS.minimal
  const riskLabel = RISK_LABELS[exp.risk_level] ?? exp.risk_level
  const gl        = exp.unrealized_gain_loss_try
  const glColor   = gl === null ? 'text-[#94a3b8]' : gl > 0 ? 'text-[#16a34a]' : gl < 0 ? 'text-[#dc2626]' : 'text-[#0f172a]'
  const glText    = gl === null
    ? '—'
    : gl > 0
      ? `+${fmtTRY(gl)}`
      : fmtTRY(gl)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{flag}</span>
          <div>
            <div className="text-sm font-black text-[#0f172a] leading-none">{exp.currency}</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Kur Maruziyeti</div>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${riskCls}`}>
          {riskLabel}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        <div>
          <div className="text-[#94a3b8] font-semibold mb-0.5">Gelir (FX)</div>
          <div className="font-bold text-[#0f172a] tabular-nums">
            {fmtForeign(exp.revenue_foreign, exp.currency)}
          </div>
          <div className="text-[#64748b] tabular-nums">{fmtTRY(exp.revenue_try)}</div>
        </div>
        <div>
          <div className="text-[#94a3b8] font-semibold mb-0.5">Gider (FX)</div>
          <div className="font-bold text-[#0f172a] tabular-nums">
            {exp.expenses_foreign > 0 ? fmtForeign(exp.expenses_foreign, exp.currency) : '—'}
          </div>
          <div className="text-[#64748b] tabular-nums">
            {exp.expenses_try > 0 ? fmtTRY(exp.expenses_try) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[#94a3b8] font-semibold mb-0.5">Ort. Giriş Kuru</div>
          <div className="font-bold text-[#0f172a] tabular-nums">{fmtRate(exp.avg_entry_rate)}</div>
        </div>
        <div>
          <div className="text-[#94a3b8] font-semibold mb-0.5">Net Maruziyet</div>
          <div className="font-bold text-[#0f172a] tabular-nums">{fmtTRY(exp.net_exposure_try)}</div>
        </div>
      </div>

      {/* Natural hedge bar */}
      <NaturalHedgeBar ratio={exp.natural_hedge_ratio_pct} />

      {/* Unrealized G/L */}
      <div className="flex items-center justify-between border-t border-[#f1f5f9] pt-2">
        <span className="text-[10px] text-[#94a3b8] font-semibold">Gerçekleşmemiş K/Z</span>
        <span className={`text-sm font-black tabular-nums ${glColor}`}>{glText}</span>
      </div>
    </div>
  )
}

function RecommendationCard({ text, riskLevel }: { text: string; riskLevel: string }) {
  const colorMap: Record<string, { bar: string; bg: string; border: string; icon: string }> = {
    minimal:  { bar: 'bg-[#16a34a]', bg: 'bg-[#f0fdf4]', border: 'border-[#bbf7d0]', icon: '✓' },
    moderate: { bar: 'bg-[#d97706]', bg: 'bg-[#fffbeb]', border: 'border-[#fde68a]', icon: '!' },
    elevated: { bar: 'bg-[#ea580c]', bg: 'bg-[#fff7ed]', border: 'border-[#fed7aa]', icon: '⚠' },
    high:     { bar: 'bg-[#dc2626]', bg: 'bg-[#fef2f2]', border: 'border-[#fecaca]', icon: '⚠' },
  }
  const c = colorMap[riskLevel] ?? colorMap.minimal

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-4 flex gap-3`}>
      <div className={`w-1 rounded-full flex-shrink-0 ${c.bar}`} />
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
          Hedging Önerisi
        </div>
        <div className="text-sm font-semibold text-[#0f172a] leading-snug">
          {c.icon} {text}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FxExposureClient({ companyId }: Props) {
  const [months, setMonths] = useState(6)

  const { data, isLoading, isError } = useQuery<FxExposureReport>({
    queryKey: ['fx-exposure', companyId, months],
    queryFn: async () => {
      const res = await fetch(`/api/finance/fx-exposure?months=${months}`)
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-6 bg-[#f1f5f9] rounded w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-[#f1f5f9] rounded" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="text-[11px] text-[#94a3b8] py-3">
        FX maruziyet verileri yüklenemedi.
      </div>
    )
  }

  // ── TRY-only empty state ─────────────────────────────────────────────────────
  if (data.currencies.length === 0) {
    return (
      <div className="space-y-3">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#64748b]">
            Kur Riski Analizi
          </h3>
          {/* Period selector still shown for UX consistency */}
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setMonths(opt.value)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                  months === opt.value
                    ? 'bg-brand text-white'
                    : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-lg p-4 text-sm text-[#0369a1] font-semibold">
          ℹ Şirketiniz TL bazlı faaliyet gösteriyor. Döviz maruziyeti yok.
        </div>
      </div>
    )
  }

  // ── Derive risk level for recommendation ─────────────────────────────────────
  const overallRisk: string = (() => {
    const p = data.total_exposure_ratio_pct
    if (p < 10)  return 'minimal'
    if (p < 30)  return 'moderate'
    if (p <= 60) return 'elevated'
    return 'high'
  })()

  const glTone = data.total_unrealized_gl_try === null
    ? 'neutral'
    : data.total_unrealized_gl_try > 0
      ? 'positive'
      : data.total_unrealized_gl_try < 0
        ? 'negative'
        : 'neutral'

  const glDisplay = data.total_unrealized_gl_try === null
    ? '—'
    : data.total_unrealized_gl_try > 0
      ? `+${fmtTRY(data.total_unrealized_gl_try)}`
      : fmtTRY(data.total_unrealized_gl_try)

  return (
    <div className="space-y-4">
      {/* Header + period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-[#64748b]">
          Kur Riski Analizi
        </h3>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMonths(opt.value)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                months === opt.value
                  ? 'bg-brand text-white'
                  : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Toplam FX Maruziyeti"
          value={fmtPct(data.total_exposure_ratio_pct)}
          sub={`${data.period_months} aylık gelirin döviz payı`}
          tone={overallRisk === 'minimal' ? 'positive' : overallRisk === 'moderate' ? 'warning' : 'negative'}
        />
        <SummaryCard
          label="En Büyük Para Birimi"
          value={
            data.largest_exposure_currency
              ? `${CURRENCY_FLAGS[data.largest_exposure_currency] ?? ''} ${data.largest_exposure_currency}`
              : '—'
          }
          sub="En yüksek TRY geliri"
        />
        <SummaryCard
          label="Net FX Pozisyon"
          value={fmtTRY(data.total_net_exposure_try)}
          sub="Döviz geliri - gideri (TRY)"
          tone={data.total_net_exposure_try > 0 ? 'positive' : data.total_net_exposure_try < 0 ? 'negative' : 'neutral'}
        />
        <SummaryCard
          label="Gerçekleşmemiş K/Z"
          value={glDisplay}
          sub="Kur hareketleri etkisi"
          tone={glTone}
        />
      </div>

      {/* Hedging recommendation */}
      <RecommendationCard text={data.hedging_recommendation} riskLevel={overallRisk} />

      {/* Currency exposure cards */}
      {data.currencies.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.currencies.map(exp => (
            <CurrencyCard key={exp.currency} exp={exp} />
          ))}
        </div>
      )}
    </div>
  )
}
