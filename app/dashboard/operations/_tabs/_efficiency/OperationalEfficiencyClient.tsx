'use client'

// ─────────────────────────────────────────────────────────────────────────────
// OperationalEfficiencyClient
//
// Operasyonel Verimlilik (Operational Efficiency Metrics)
//
// Displays:
//   - Header: "Operasyonel Verimlilik"
//   - Productivity score (0-100) + efficiency class badge
//   - 4 KPI cards: Sipariş-Tahsilat / Gider Verimliliği /
//                  Teklif-Sipariş Oranı / Çalışan Başı Gelir
//   - Benchmark comparison: each metric vs target (green = above, red = below)
//   - 6-month expense efficiency trend
//   - Loading / error / empty states
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }            from '@tanstack/react-query'
import { fmtTRY, fmtPct }     from '@/lib/format'
import type { OperationalEfficiencyReport } from '@/lib/services/intelligence/operational-efficiency.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Type helpers ──────────────────────────────────────────────────────────────

type EfficiencyClass =
  | 'excellent'
  | 'good'
  | 'average'
  | 'below_average'
  | 'poor'
  | 'insufficient_data'

// ── Efficiency class badge ────────────────────────────────────────────────────

function EfficiencyBadge({ value }: { value: EfficiencyClass }) {
  const cfg: Record<EfficiencyClass, { label: string; cls: string }> = {
    excellent:         { label: 'Mükemmel',       cls: 'bg-[#dcfce7] text-[#166534] border-[#86efac]' },
    good:              { label: 'İyi',             cls: 'bg-[#d1fae5] text-[#065f46] border-[#6ee7b7]' },
    average:           { label: 'Ortalama',        cls: 'bg-[#fef9c3] text-[#854d0e] border-[#fde047]' },
    below_average:     { label: 'Ortanın Altı',    cls: 'bg-[#ffedd5] text-[#9a3412] border-[#fdba74]' },
    poor:              { label: 'Zayıf',           cls: 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]' },
    insufficient_data: { label: 'Veri Yetersiz',   cls: 'bg-[#f1f5f9] text-[#64748b] border-[#cbd5e1]' },
  }
  const c = cfg[value]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 75 ? '#22c55e'
    : score >= 50 ? '#eab308'
    : score >= 25 ? '#f97316'
    : '#ef4444'

  return (
    <div className="flex flex-col items-center justify-center w-24 h-24 rounded-full border-4" style={{ borderColor: color }}>
      <span className="text-2xl font-black" style={{ color }}>{score}</span>
      <span className="text-[10px] text-[#64748b] font-semibold">/100</span>
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:    string
  value:    string
  target:   string
  status:   'above' | 'below' | 'neutral'
  note?:    string
}

function KpiCard({ label, value, target, status, note }: KpiCardProps) {
  const statusCls =
    status === 'above' ? 'text-[#16a34a]'
    : status === 'below' ? 'text-[#dc2626]'
    : 'text-[#64748b]'

  const indicator = status === 'above' ? '▲' : status === 'below' ? '▼' : '—'

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-black text-[#0f172a]">{value}</span>
        <span className={`text-[12px] font-bold ${statusCls}`}>{indicator}</span>
      </div>
      <span className="text-[11px] text-[#94a3b8]">Hedef: {target}</span>
      {note && <span className="text-[11px] text-[#94a3b8] italic">{note}</span>}
    </div>
  )
}

// ── Trend bar chart ───────────────────────────────────────────────────────────

interface TrendBarProps {
  data: OperationalEfficiencyReport['monthly_trend']
}

function TrendBars({ data }: TrendBarProps) {
  const ratios = data.map(d => d.expense_ratio_pct)
  const maxRatio = ratios.reduce<number>((m, r) => Math.max(m, r ?? 0), 0)
  const ceiling  = Math.max(maxRatio, 100)

  return (
    <div className="mt-4">
      <span className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
        6 Aylık Gider Verimliliği Trendi
      </span>
      <div className="flex items-end gap-2 mt-2 h-24">
        {data.map(d => {
          const pct   = d.expense_ratio_pct
          const barH  = pct != null ? Math.round((pct / ceiling) * 96) : 8
          const color = pct == null ? '#e2e8f0'
            : pct <= 80 ? '#22c55e'
            : pct <= 100 ? '#eab308'
            : '#ef4444'

          return (
            <div key={d.month} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] text-[#94a3b8]">
                {pct != null ? `%${pct.toFixed(0)}` : '—'}
              </span>
              <div
                className="w-full rounded-t"
                style={{ height: `${barH}px`, backgroundColor: color }}
              />
              <span className="text-[10px] text-[#94a3b8]">
                {d.month.substring(5)}
              </span>
            </div>
          )
        })}
      </div>
      {/* 80% target line label */}
      <div className="flex items-center gap-2 mt-2">
        <div className="w-4 h-0.5 bg-[#94a3b8] border-dashed border-t border-[#94a3b8]" />
        <span className="text-[10px] text-[#94a3b8]">Hedef ≤%80 (Türk KOBİ Benchmarkı)</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function OperationalEfficiencyClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: OperationalEfficiencyReport }>({
    queryKey: ['operational-efficiency', companyId],
    queryFn:  () =>
      fetch(`/api/intelligence/operational-efficiency?companyId=${companyId}`)
        .then(r => {
          if (!r.ok) throw new Error('Fetch failed')
          return r.json()
        }),
    staleTime: 60 * 60 * 1000,
  })

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <section className="bg-white border border-[#e2e8f0] rounded-xl p-6 animate-pulse">
        <div className="h-5 w-48 bg-[#f1f5f9] rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[#f1f5f9] rounded-lg" />
          ))}
        </div>
      </section>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (isError || !data?.report) {
    return (
      <section className="bg-white border border-[#fee2e2] rounded-xl p-6">
        <p className="text-[#dc2626] text-sm font-semibold">
          Operasyonel verimlilik verileri yüklenemedi.
        </p>
      </section>
    )
  }

  const { metrics, benchmarks, productivity_score, efficiency_class, monthly_trend } = data.report

  // ── Benchmark comparisons ─────────────────────────────────────────────────

  function expenseStatus(): 'above' | 'below' | 'neutral' {
    if (metrics.expense_efficiency_ratio_pct == null) return 'neutral'
    return metrics.expense_efficiency_ratio_pct <= benchmarks.expense_ratio_target ? 'above' : 'below'
  }

  function o2cStatus(): 'above' | 'below' | 'neutral' {
    if (metrics.order_to_cash_days == null) return 'neutral'
    return metrics.order_to_cash_days <= benchmarks.o2c_target_days ? 'above' : 'below'
  }

  function quoteStatus(): 'above' | 'below' | 'neutral' {
    if (metrics.quote_to_order_rate_pct == null) return 'neutral'
    return metrics.quote_to_order_rate_pct >= benchmarks.quote_to_order_target ? 'above' : 'below'
  }

  function revPerEmpStatus(): 'above' | 'below' | 'neutral' {
    if (metrics.revenue_per_employee == null) return 'neutral'
    return metrics.revenue_per_employee >= benchmarks.revenue_per_employee_target ? 'above' : 'below'
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="bg-white border border-[#e2e8f0] rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-[#0f172a]">Operasyonel Verimlilik</h2>
          <p className="text-[12px] text-[#64748b]">Türk KOBİ Benchmarkına Göre</p>
        </div>
        <EfficiencyBadge value={efficiency_class} />
      </div>

      {/* Productivity score + summary */}
      <div className="flex items-center gap-6 p-4 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
        <ScoreRing score={productivity_score} />
        <div>
          <p className="text-[13px] font-semibold text-[#0f172a]">Operasyonel Verimlilik Skoru</p>
          <p className="text-[11px] text-[#64748b] mt-1">
            Gider verimliliği (%30) + Sipariş-Tahsilat (%30) + Teklif-Sipariş (%20) + Çalışan Başı Gelir (%20)
          </p>
          <p className="text-[11px] text-[#94a3b8] mt-1">
            75+ Mükemmel · 50–74 İyi · 25–49 Geliştirilmeli · &lt;25 Kritik
          </p>
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Sipariş–Tahsilat"
          value={metrics.order_to_cash_days != null ? `${metrics.order_to_cash_days} gün` : '—'}
          target={`≤${benchmarks.o2c_target_days} gün`}
          status={o2cStatus()}
          note="Sipariş → Ödeme"
        />
        <KpiCard
          label="Gider Verimliliği"
          value={metrics.expense_efficiency_ratio_pct != null
            ? fmtPct(metrics.expense_efficiency_ratio_pct)
            : '—'}
          target={`≤%${benchmarks.expense_ratio_target}`}
          status={expenseStatus()}
          note="OpEx / Brüt Kâr"
        />
        <KpiCard
          label="Teklif–Sipariş Oranı"
          value={metrics.quote_to_order_rate_pct != null
            ? fmtPct(metrics.quote_to_order_rate_pct)
            : '—'}
          target={`≥%${benchmarks.quote_to_order_target}`}
          status={quoteStatus()}
          note="Proforma Dönüşümü"
        />
        <KpiCard
          label="Çalışan Başı Gelir"
          value={metrics.revenue_per_employee != null
            ? fmtTRY(metrics.revenue_per_employee, 0)
            : '—'}
          target={fmtTRY(benchmarks.revenue_per_employee_target, 0)}
          status={revPerEmpStatus()}
          note={metrics.revenue_per_employee == null ? 'Personel sayısı girilmedi' : undefined}
        />
      </div>

      {/* 6-month trend */}
      {monthly_trend.length > 0 && (
        <TrendBars data={monthly_trend} />
      )}
    </section>
  )
}
