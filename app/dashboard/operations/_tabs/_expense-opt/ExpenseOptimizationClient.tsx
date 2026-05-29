'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ExpenseOptimizationClient
//
// Gider Optimizasyon Tavsiyeleri (Expense Optimization Recommendations)
//
// Displays:
//   - 3 KPI cells: optimization score / total saving potential / quick win count
//   - Opportunity cards: title, saving estimate, effort badge, confidence badge
//   - Benchmark comparison bars: actual vs benchmark per category
//   - Loading / error / empty states
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY }   from '@/lib/format'
import type {
  ExpenseOptimizationReport,
  ExpenseOptimizationOpportunity,
  OptimizationCategory,
} from '@/lib/services/finance/expense-optimization.service'
import { EXPENSE_BENCHMARKS } from '@/lib/services/finance/expense-optimization.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Category labels (Turkish) ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<OptimizationCategory, string> = {
  salary:    'Personel',
  rent:      'Kira',
  software:  'Yazılım/SaaS',
  marketing: 'Pazarlama',
  logistics: 'Lojistik',
  general:   'Genel Gider',
  utilities: 'Enerji/Telekom',
}

// ── Effort badge ──────────────────────────────────────────────────────────────

type Effort = 'quick_win' | 'medium_term' | 'strategic'

function EffortBadge({ effort }: { effort: Effort }) {
  const cfg: Record<Effort, { label: string; cls: string }> = {
    quick_win:   { label: 'Hızlı Kazanım',  cls: 'bg-[#dcfce7] text-[#166534] border-[#86efac]' },
    medium_term: { label: 'Orta Vadeli',     cls: 'bg-[#fef9c3] text-[#854d0e] border-[#fde047]' },
    strategic:   { label: 'Stratejik',       cls: 'bg-[#ede9fe] text-[#5b21b6] border-[#c4b5fd]' },
  }
  const c = cfg[effort]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── Confidence badge ──────────────────────────────────────────────────────────

type Confidence = 'high' | 'medium' | 'low'

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const cfg: Record<Confidence, { label: string; cls: string }> = {
    high:   { label: 'Güven: Yüksek', cls: 'bg-[#dbeafe] text-[#1e40af] border-[#93c5fd]' },
    medium: { label: 'Güven: Orta',   cls: 'bg-[#f1f5f9] text-[#475569] border-[#cbd5e1]' },
    low:    { label: 'Güven: Düşük',  cls: 'bg-[#fff7ed] text-[#9a3412] border-[#fed7aa]' },
  }
  const c = cfg[confidence]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── Optimization potential badge ──────────────────────────────────────────────

type Potential = 'high' | 'medium' | 'low' | 'minimal' | 'no_revenue_data'

function PotentialBadge({ potential }: { potential: Potential }) {
  const cfg: Record<Potential, { label: string; cls: string }> = {
    high:           { label: 'Yüksek Potansiyel',  cls: 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]' },
    medium:         { label: 'Orta Potansiyel',    cls: 'bg-[#fef9c3] text-[#854d0e] border-[#fde047]' },
    low:            { label: 'Sınırlı Potansiyel', cls: 'bg-[#dbeafe] text-[#1e40af] border-[#93c5fd]' },
    minimal:        { label: 'Minimal Potansiyel', cls: 'bg-[#f1f5f9] text-[#475569] border-[#cbd5e1]' },
    no_revenue_data:{ label: 'Gelir Verisi Yok',   cls: 'bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]' },
  }
  const c = cfg[potential]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── KPI cell ──────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  colorCls = 'text-[#0f172a]',
}: {
  label: string
  value: string | number
  sub?: string
  colorCls?: string
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm flex-1 min-w-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${colorCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-1">{sub}</div>}
    </div>
  )
}

// ── Opportunity card ──────────────────────────────────────────────────────────

function OpportunityCard({ opp }: { opp: ExpenseOptimizationOpportunity }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[11px] font-black uppercase tracking-wider text-[#94a3b8] mb-0.5">
            {CATEGORY_LABELS[opp.category]}
          </div>
          <div className="text-[14px] font-bold text-[#0f172a] leading-snug">{opp.title}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-[#64748b] font-semibold">Yıllık Tasarruf</div>
          <div className="text-[16px] font-black text-[#16a34a] tabular-nums">
            {fmtTRY(opp.estimated_annual_saving_try, 0)}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#475569] leading-relaxed mb-3">{opp.description}</p>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <EffortBadge effort={opp.effort} />
        <ConfidenceBadge confidence={opp.confidence} />
        <span className="text-[10px] text-[#94a3b8] ml-auto">
          Aylık: {fmtTRY(opp.estimated_monthly_saving_try, 0)} · %{opp.potential_saving_pct} tasarruf
        </span>
      </div>

      <div className="border-t border-[#f1f5f9] pt-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-[#94a3b8] mb-2">
          Aksiyon Adımları
        </div>
        <ul className="space-y-1">
          {opp.action_items.slice(0, 3).map((item, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-[#0ea5e9] font-black text-[10px] mt-0.5 shrink-0">{i + 1}.</span>
              <span className="text-[11px] text-[#475569]">{item}</span>
            </li>
          ))}
          {opp.action_items.length > 3 && (
            <li className="text-[10px] text-[#94a3b8] pl-3.5">
              +{opp.action_items.length - 3} daha...
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

// ── Benchmark comparison bar ──────────────────────────────────────────────────

function BenchmarkComparisonBar({
  category,
  actual_pct,
  benchmark_pct,
  is_over,
}: {
  category: OptimizationCategory
  actual_pct: number
  benchmark_pct: number
  is_over: boolean
}) {
  const maxPct = Math.max(actual_pct, benchmark_pct, 1)
  const actualWidth = Math.min(100, (actual_pct / (maxPct * 1.2)) * 100)
  const benchWidth  = Math.min(100, (benchmark_pct / (maxPct * 1.2)) * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#0f172a]">{CATEGORY_LABELS[category]}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-black tabular-nums ${is_over ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
            %{actual_pct.toFixed(1)}
          </span>
          {is_over && (
            <span className="text-[9px] text-[#dc2626] font-semibold">
              ↑ benchmark +%{(actual_pct - benchmark_pct).toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-4 bg-[#f1f5f9] rounded-full overflow-hidden">
        {/* Benchmark line */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[#94a3b8] z-10"
          style={{ left: `${benchWidth}%` }}
          title={`Benchmark: %${benchmark_pct}`}
        />
        {/* Actual bar */}
        <div
          className={`h-full rounded-full transition-all duration-500 ${is_over ? 'bg-[#f87171]' : 'bg-[#4ade80]'}`}
          style={{ width: `${actualWidth}%` }}
        />
      </div>
      <div className="flex items-center gap-3 text-[9px] text-[#94a3b8]">
        <span>Benchmark: %{benchmark_pct}</span>
        <span>Gerçek: %{actual_pct.toFixed(1)}</span>
      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 flex-1 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="h-40 bg-[#f1f5f9] rounded" />
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ExpenseOptimizationClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: ExpenseOptimizationReport }>({
    queryKey: ['expense-optimization', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/expense-optimization')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 1800_000,
  })

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-[11px] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
          Gider Optimizasyon Tavsiyeleri
        </div>
        <LoadingSkeleton />
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="p-6 text-center">
        <div className="text-[12px] font-semibold text-[#dc2626]">
          Optimizasyon raporu yüklenemedi. Lütfen tekrar deneyin.
        </div>
      </div>
    )
  }

  const { report } = data

  // ── Empty state ────────────────────────────────────────────────────────────
  if (report.total_monthly_expenses_try === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-[13px] font-semibold text-[#475569]">
          Bu dönem için gider kaydı bulunamadı.
        </div>
        <div className="text-[11px] text-[#94a3b8] mt-1">
          Gider girişi yaptıktan sonra optimizasyon tavsiyeleri görüntülenecektir.
        </div>
      </div>
    )
  }

  const scoreColor = report.optimization_score >= 70
    ? 'text-[#16a34a]'
    : report.optimization_score >= 40
      ? 'text-[#d97706]'
      : 'text-[#dc2626]'

  const categories: OptimizationCategory[] = [
    'salary', 'rent', 'software', 'marketing', 'logistics', 'general', 'utilities',
  ]

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-[#94a3b8]">
            Gider Optimizasyon Tavsiyeleri
          </div>
          <div className="text-[13px] text-[#64748b] mt-0.5">
            Dönem: {report.period} · Toplam Gider: {fmtTRY(report.total_monthly_expenses_try, 0)}
          </div>
        </div>
        <PotentialBadge potential={report.optimization_potential} />
      </div>

      {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <KpiCell
          label="Optimizasyon Skoru"
          value={`${Math.round(report.optimization_score)}/100`}
          sub="Benchmark'a göre verimlilik"
          colorCls={scoreColor}
        />
        <KpiCell
          label="Yıllık Tasarruf Potansiyeli"
          value={fmtTRY(report.total_annual_saving_potential_try, 0)}
          sub={`${report.opportunities.length} fırsat tespit edildi`}
          colorCls="text-[#16a34a]"
        />
        <KpiCell
          label="Hızlı Kazanım"
          value={report.quick_wins.length}
          sub="1 ay içinde hayata geçirilebilir"
          colorCls={report.quick_wins.length > 0 ? 'text-[#0ea5e9]' : 'text-[#94a3b8]'}
        />
      </div>

      {/* ── Opportunities ─────────────────────────────────────────────────── */}
      {report.opportunities.length > 0 ? (
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            Optimizasyon Fırsatları
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {report.opportunities.map(opp => (
              <OpportunityCard key={opp.id} opp={opp} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-5 text-center">
          <div className="text-[13px] font-bold text-[#166534]">
            Tebrikler! Tüm gider kategorileri benchmark dahilinde.
          </div>
          <div className="text-[11px] text-[#16a34a] mt-1">
            Mevcut gider yapınız sektör ortalamasının altında veya seviyesinde.
          </div>
        </div>
      )}

      {/* ── Benchmark Comparison ──────────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
          Kategori Bazlı Benchmark Karşılaştırması
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm space-y-4">
          <div className="flex items-center gap-4 mb-2 text-[9px] text-[#94a3b8] font-semibold uppercase">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 bg-[#4ade80] rounded-sm" /> Benchmark dahilinde
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 bg-[#f87171] rounded-sm" /> Benchmark üzerinde
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-0.5 h-3 bg-[#94a3b8]" /> Benchmark sınırı
            </span>
          </div>
          {categories.map(cat => {
            const comparison = report.benchmark_comparison[cat]
            return (
              <BenchmarkComparisonBar
                key={cat}
                category={cat}
                actual_pct={comparison.actual_pct}
                benchmark_pct={comparison.benchmark_pct}
                is_over={comparison.is_over}
              />
            )
          })}
          <div className="pt-2 border-t border-[#f1f5f9] text-[10px] text-[#94a3b8]">
            Gider oranları aylık gelirin yüzdesi olarak gösterilmektedir.
            Benchmark değerleri Türkiye KOBİ ortalamaları esas alınmıştır.
          </div>
        </div>
      </div>
    </div>
  )
}
