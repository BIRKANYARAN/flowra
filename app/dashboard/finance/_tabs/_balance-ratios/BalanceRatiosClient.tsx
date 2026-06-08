'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BalanceRatiosClient
//
// Bilanço Oran Analizi — Balance Sheet Ratio Analysis
//
// Displays liquidity, solvency, and efficiency ratios with benchmarks and
// health badges for Turkish SME CFOs. Composite score at top.
//
// TanStack Query key: ['balance-ratios', companyId]
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }           from '@tanstack/react-query'
import { fmtTRY, fmtPct }    from '@/lib/format'
import type {
  BalanceRatiosReport,
} from '@/lib/services/finance/balance-ratios.service'

// Suppress unused import warning for fmtTRY — used in input display
void fmtTRY

interface Props {
  companyId: string
}

// ── Health badge configs ──────────────────────────────────────────────────────

const LIQUIDITY_BADGE: Record<string, { label: string; cls: string }> = {
  strong:            { label: 'Güçlü',           cls: 'bg-green-100  text-green-800  border-green-200'  },
  adequate:          { label: 'Yeterli',          cls: 'bg-blue-100   text-blue-800   border-blue-200'   },
  tight:             { label: 'Sınırda',          cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  critical:          { label: 'Kritik',           cls: 'bg-red-100    text-red-800    border-red-200'    },
  insufficient_data: { label: 'Veri Yetersiz',    cls: 'bg-gray-100   text-gray-600   border-gray-200'   },
}

const SOLVENCY_BADGE: Record<string, { label: string; cls: string }> = {
  strong:            { label: 'Güçlü',           cls: 'bg-green-100  text-green-800  border-green-200'  },
  adequate:          { label: 'Yeterli',          cls: 'bg-blue-100   text-blue-800   border-blue-200'   },
  leveraged:         { label: 'Kaldıraçlı',       cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  distressed:        { label: 'Riskli',           cls: 'bg-red-100    text-red-800    border-red-200'    },
  insufficient_data: { label: 'Veri Yetersiz',    cls: 'bg-gray-100   text-gray-600   border-gray-200'   },
}

// ── Score meter ───────────────────────────────────────────────────────────────

function ScoreMeter({ score }: { score: number }) {
  const color =
    score >= 70 ? '#10b981' :
    score >= 50 ? '#3b82f6' :
    score >= 35 ? '#f59e0b' :
    '#ef4444'

  const label =
    score >= 70 ? 'Güçlü'   :
    score >= 50 ? 'Orta'    :
    score >= 35 ? 'Zayıf'   :
    'Kritik'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <circle
            cx="48" cy="48" r="40" fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 40 * score / 100} ${2 * Math.PI * 40}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black tabular-nums" style={{ color }}>{score.toFixed(1)}</span>
          <span className="text-[9px] font-bold text-[#94a3b8] uppercase tracking-wide">/100</span>
        </div>
      </div>
      <span className="text-xs font-bold" style={{ color }}>{label}</span>
    </div>
  )
}

// ── Ratio row ─────────────────────────────────────────────────────────────────

interface RatioRowProps {
  label:     string
  value:     number | null
  benchmark: string
  format?:   'ratio' | 'pct' | 'x'
}

function fmt(value: number | null, format: RatioRowProps['format'] = 'ratio'): string {
  if (value === null) return '—'
  switch (format) {
    case 'pct':   return fmtPct(value)
    case 'x':     return `${value.toFixed(2)}x`
    default:      return value.toFixed(2)
  }
}

function RatioRow({ label, value, benchmark, format = 'ratio' }: RatioRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#f1f5f9] last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-xs font-semibold text-[#334155]">{label}</span>
        <span className="ml-2 text-[10px] text-[#94a3b8]">{benchmark}</span>
      </div>
      <span className={`text-sm font-black tabular-nums ${value === null ? 'text-[#94a3b8]' : 'text-[#0f172a]'}`}>
        {fmt(value, format)}
      </span>
    </div>
  )
}

// ── Health badge ──────────────────────────────────────────────────────────────

function HealthBadge({ cfg }: { cfg: { label: string; cls: string } }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  title, badge, children,
}: {
  title:    string
  badge?:   React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">{title}</span>
        {badge}
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BalanceRatiosClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: BalanceRatiosReport }>({
    queryKey: ['balance-ratios', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/balance-ratios')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 60 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-6 py-10 text-center">
        <div className="text-sm text-[#94a3b8] font-medium">Bilanço oran analizi yükleniyor...</div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-6 py-6 text-center">
        <div className="text-sm text-[#ef4444] font-medium">Bilanço oran analizi yüklenemedi.</div>
      </div>
    )
  }

  const { report } = data
  const { liquidity, solvency, efficiency } = report

  return (
    <div className="space-y-4">

      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Bilanço Oran Analizi
        </span>
      </div>

      {/* Composite score + summary strip */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-6 py-5 flex items-center gap-8">
        <ScoreMeter score={report.composite_score} />
        <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-[#94a3b8] mb-1">Likidite</div>
            <HealthBadge cfg={LIQUIDITY_BADGE[liquidity.health] ?? LIQUIDITY_BADGE.insufficient_data} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-[#94a3b8] mb-1">Borçluluk</div>
            <HealthBadge cfg={SOLVENCY_BADGE[solvency.health] ?? SOLVENCY_BADGE.insufficient_data} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-[#94a3b8] mb-1">Cari Oran</div>
            <span className="text-base font-black tabular-nums text-[#0f172a]">
              {liquidity.current_ratio !== null ? liquidity.current_ratio.toFixed(2) : '—'}
            </span>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-[#94a3b8] mb-1">Borç/Özsermaye</div>
            <span className="text-base font-black tabular-nums text-[#0f172a]">
              {solvency.debt_to_equity !== null ? solvency.debt_to_equity.toFixed(2) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Liquidity section */}
      <SectionCard
        title="Likidite Oranları"
        badge={<HealthBadge cfg={LIQUIDITY_BADGE[liquidity.health] ?? LIQUIDITY_BADGE.insufficient_data} />}
      >
        <RatioRow
          label="Cari Oran"
          value={liquidity.current_ratio}
          benchmark="Hedef: 1.5–2.0"
        />
        <RatioRow
          label="Asit-Test Oranı (Hızlı)"
          value={liquidity.quick_ratio}
          benchmark="Hedef: ≥ 1.0"
        />
        <RatioRow
          label="Nakit Oranı"
          value={liquidity.cash_ratio}
          benchmark="Hedef: ≥ 0.2"
        />
      </SectionCard>

      {/* Solvency section */}
      <SectionCard
        title="Borçluluk / Sermaye Yapısı"
        badge={<HealthBadge cfg={SOLVENCY_BADGE[solvency.health] ?? SOLVENCY_BADGE.insufficient_data} />}
      >
        <RatioRow
          label="Borç/Özsermaye"
          value={solvency.debt_to_equity}
          benchmark="Hedef: < 1.5"
        />
        <RatioRow
          label="Borç/Varlık"
          value={solvency.debt_to_assets}
          benchmark="Hedef: < 0.5"
        />
        <RatioRow
          label="Özsermaye Çarpanı"
          value={solvency.equity_multiplier}
          benchmark="Kaldıraç ölçüsü"
          format="x"
        />
        <RatioRow
          label="Faiz Karşılama"
          value={solvency.interest_coverage}
          benchmark="Hedef: > 3.0"
          format="x"
        />
      </SectionCard>

      {/* Efficiency section */}
      <SectionCard title="Verimlilik / Kârlılık Oranları">
        <RatioRow
          label="Varlık Devir Hızı"
          value={efficiency.asset_turnover}
          benchmark="Yüksek = verimli"
          format="x"
        />
        <RatioRow
          label="Alacak Devir Hızı"
          value={efficiency.receivables_turnover}
          benchmark="Yüksek = hızlı tahsilat"
          format="x"
        />
        <RatioRow
          label="Borç Devir Hızı"
          value={efficiency.payables_turnover}
          benchmark="Tedarikçi ödeme hızı"
          format="x"
        />
        <RatioRow
          label="Net Kâr Marjı"
          value={efficiency.net_profit_margin}
          benchmark="Sektör: %5–15"
          format="pct"
        />
        <RatioRow
          label="Varlık Kârlılığı (ROA)"
          value={efficiency.return_on_assets}
          benchmark="Hedef: > %5"
          format="pct"
        />
        <RatioRow
          label="Özsermaye Kârlılığı (ROE)"
          value={efficiency.return_on_equity}
          benchmark="Hedef: > %10"
          format="pct"
        />
      </SectionCard>

    </div>
  )
}
