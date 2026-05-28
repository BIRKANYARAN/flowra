'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RevenueRecognitionClient
//
// Accrual vs Cash revenue recognition dashboard.
//
// Features:
//   - Period selector: last 6 months
//   - 3-column basis comparison: Tahakkuk / Nakit / Ertelenmiş
//   - Collection efficiency gauge (0–100% CSS bar) with class badge
//   - Revenue backlog card: adjusted pipeline + win rate source
//   - 6-month efficiency trend sparkline (CSS bars)
//   - Prior period accrual comparison with +/- change
//   - Efficiency trend arrow + label
// ─────────────────────────────────────────────────────────────────────────────

import { useState }  from 'react'
import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtPct, fmtDelta, fmtMonthShort } from '@/lib/format'
import type { RevenueRecognitionReport } from '@/lib/services/finance/revenue-recognition.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastNMonthKeys(n: number): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

// ── Efficiency class badge ────────────────────────────────────────────────────

type EffClass = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

function EfficiencyBadge({ cls }: { cls: EffClass }) {
  const config: Record<EffClass, { label: string; style: string }> = {
    excellent: { label: 'Mükemmel (≥90%)',  style: 'bg-green-100 text-green-800 border-green-200' },
    good:      { label: 'İyi (70–89%)',      style: 'bg-teal-100 text-teal-800 border-teal-200' },
    fair:      { label: 'Orta (50–69%)',     style: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    poor:      { label: 'Düşük (<50%)',      style: 'bg-red-100 text-red-800 border-red-200' },
    unknown:   { label: 'Veri Yok',          style: 'bg-slate-100 text-slate-600 border-slate-200' },
  }
  const c = config[cls]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.style}`}>
      {c.label}
    </span>
  )
}

// ── Efficiency trend arrow ─────────────────────────────────────────────────────

type EffTrend = 'improving' | 'stable' | 'declining' | 'insufficient_data'

function TrendArrow({ trend }: { trend: EffTrend }) {
  const config: Record<EffTrend, { icon: string; cls: string; label: string }> = {
    improving:         { icon: '↑', cls: 'text-green-600',  label: 'İyileşiyor' },
    stable:            { icon: '→', cls: 'text-slate-500',  label: 'Sabit' },
    declining:         { icon: '↓', cls: 'text-red-600',    label: 'Kötüleşiyor' },
    insufficient_data: { icon: '—', cls: 'text-slate-400',  label: 'Yetersiz Veri' },
  }
  const c = config[trend]
  return (
    <span className={`font-black text-lg ${c.cls}`} title={c.label}>
      {c.icon}
      <span className="text-[11px] font-semibold ml-1">{c.label}</span>
    </span>
  )
}

// ── Gauge bar ─────────────────────────────────────────────────────────────────

function GaugeBar({ pct, cls }: { pct: number | null; cls: EffClass }) {
  const width = pct !== null ? Math.min(100, Math.max(0, pct)) : 0
  const barColor: Record<EffClass, string> = {
    excellent: 'bg-green-500',
    good:      'bg-teal-500',
    fair:      'bg-yellow-400',
    poor:      'bg-red-500',
    unknown:   'bg-slate-300',
  }
  return (
    <div className="w-full h-3 bg-[#f1f5f9] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor[cls]}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

// ── Basis column ──────────────────────────────────────────────────────────────

function BasisColumn({
  title, subtitle, value, color, badge,
}: {
  title: string
  subtitle: string
  value: number
  color: string
  badge?: React.ReactNode
}) {
  return (
    <div className={`bg-white border border-l-4 border-[#e2e8f0] ${color} rounded px-4 py-4 shadow-sm`}>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{title}</div>
      <div className="text-[10px] text-[#94a3b8] mb-2">{subtitle}</div>
      <div className="text-xl font-black tabular-nums text-[#0f172a]">{fmtTRY(value, 0)}</div>
      {badge && <div className="mt-2">{badge}</div>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function RevenueRecognitionClient({ companyId }: Props) {
  const monthKeys = lastNMonthKeys(6)
  const [period, setPeriod] = useState<string>(monthKeys[monthKeys.length - 1])

  const { data, isLoading, isError } = useQuery<{ report: RevenueRecognitionReport }>({
    queryKey: ['revenue-recognition', companyId, period],
    queryFn:  async () => {
      const res = await fetch(`/api/finance/revenue-recognition?period=${period}`)
      if (!res.ok) throw new Error('Gelir tanıma verisi yüklenemedi')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded w-56" />
          <div className="h-20 bg-[#f1f5f9] rounded" />
          <div className="h-32 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Gelir tanıma verisi yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const report = data.report
  const cur    = report.current
  const prior  = report.prior_period

  // Prior period accrual delta
  const priorAccrual  = prior?.accrual_revenue_try ?? null
  const accrualDelta  = priorAccrual !== null ? cur.accrual_revenue_try - priorAccrual : null
  const accrualDeltaPct = accrualDelta !== null && priorAccrual !== null && priorAccrual > 0
    ? (accrualDelta / priorAccrual) * 100
    : null

  return (
    <div className="space-y-4">

      {/* ── Header + period selector ───────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Gelir Tanıma — Tahakkuk vs Nakit
          </h3>
        </div>
        <div className="flex flex-wrap gap-1 border border-[#e2e8f0] rounded overflow-hidden">
          {monthKeys.map(mk => (
            <button
              key={mk}
              onClick={() => setPeriod(mk)}
              className={`px-3 py-1 text-[11px] font-bold transition-colors ${
                period === mk
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'
              }`}
            >
              {fmtMonthShort(mk)}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3-column basis comparison ──────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <BasisColumn
          title="Tahakkuk"
          subtitle="Onaylı / bekleyen satışlar"
          value={cur.accrual_revenue_try}
          color="border-l-[#3b82f6]"
          badge={
            accrualDelta !== null ? (
              <span className={`text-[10px] font-bold ${accrualDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {accrualDelta >= 0 ? '+' : ''}{fmtTRY(accrualDelta, 0)}
                {accrualDeltaPct !== null && (
                  <span className="ml-1 text-[9px] opacity-75">
                    ({accrualDelta >= 0 ? '+' : ''}{accrualDeltaPct.toFixed(1)}%)
                  </span>
                )}
                <span className="text-[#94a3b8] font-normal ml-1">geçen aya göre</span>
              </span>
            ) : undefined
          }
        />
        <BasisColumn
          title="Nakit"
          subtitle="Tahsil edilen ödemeler"
          value={cur.cash_revenue_try}
          color="border-l-[#059669]"
        />
        <BasisColumn
          title="Ertelenmiş"
          subtitle="Proforma / taslak boru hattı"
          value={cur.deferred_revenue_try}
          color="border-l-[#d97706]"
        />
      </div>

      {/* ── A/R gap alert ──────────────────────────────────────────────────── */}
      {cur.accrual_cash_diff_try > 0 && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-1.5" />
          <div>
            <span className="text-[11px] font-bold text-blue-800">
              Tahsil edilmemiş alacak:
            </span>{' '}
            <span className="text-[11px] text-blue-700 font-semibold tabular-nums">
              {fmtTRY(cur.accrual_cash_diff_try, 0)}
            </span>
            <span className="text-[10px] text-blue-600 ml-1">
              (tahakkuk − nakit farkı)
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">

        {/* ── Left: efficiency gauge ──────────────────────────────────────── */}
        <div className="col-span-7 space-y-4">

          {/* Collection efficiency */}
          <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
              Tahsilat Verimliliği
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-black tabular-nums text-[#0f172a]">
                  {cur.collection_efficiency_pct !== null
                    ? `%${cur.collection_efficiency_pct.toFixed(1)}`
                    : '—'}
                </div>
                <EfficiencyBadge cls={cur.collection_efficiency_class} />
              </div>
              <GaugeBar pct={cur.collection_efficiency_pct} cls={cur.collection_efficiency_class} />
              <div className="flex justify-between text-[9px] text-[#94a3b8] font-semibold">
                <span>0%</span>
                <span>50%</span>
                <span>70%</span>
                <span>90%</span>
                <span>100%</span>
              </div>
              <div className="text-[10px] text-[#64748b] mt-1">
                Nakit tahsilat / tahakkuk geliri — dönemdeki gerçek tahsilat oranı
              </div>
            </div>
          </div>

          {/* Efficiency trend sparkline */}
          <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                6 Aylık Tahsilat Trendi
              </div>
              <TrendArrow trend={report.efficiency_trend} />
            </div>
            <div className="space-y-1.5">
              {report.monthly_trend.map((basis) => {
                const pct   = basis.collection_efficiency_pct
                const width = pct !== null ? Math.min(100, Math.max(0, pct)) : 0
                const isCur = basis.period_key === period

                const barColor = basis.collection_efficiency_class === 'excellent' ? 'bg-green-500'
                  : basis.collection_efficiency_class === 'good'    ? 'bg-teal-400'
                  : basis.collection_efficiency_class === 'fair'    ? 'bg-yellow-400'
                  : basis.collection_efficiency_class === 'poor'    ? 'bg-red-400'
                  : 'bg-slate-300'

                return (
                  <div key={basis.period_key} className={`flex items-center gap-2 ${isCur ? 'font-bold' : ''}`}>
                    <span className="text-[10px] text-[#94a3b8] w-12 shrink-0">
                      {fmtMonthShort(basis.period_key)}
                    </span>
                    <div className="flex-1 h-3 bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${width}%` }} />
                    </div>
                    <span className="text-[10px] tabular-nums w-12 text-right shrink-0 text-[#64748b]">
                      {pct !== null ? `%${pct.toFixed(0)}` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Right: pipeline backlog + stats ─────────────────────────────── */}
        <div className="col-span-5 space-y-3">

          {/* Revenue backlog card */}
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
              Tahmini Boru Hattı Değeri
            </div>
            <div className="text-[10px] text-[#94a3b8] mb-2">
              {report.pipeline_win_rate_pct !== null
                ? `Kazanma oranı %${report.pipeline_win_rate_pct.toFixed(0)} ile düzeltildi`
                : 'Kazanma oranı verisi yetersiz — ham değer'}
            </div>
            <div className="text-xl font-black tabular-nums text-[#0f172a]">
              {fmtTRY(report.revenue_backlog_try, 0)}
            </div>
            {report.pipeline_win_rate_pct !== null && (
              <div className="mt-2 text-[10px] text-[#64748b]">
                Ham boru hattı:{' '}
                <span className="font-semibold tabular-nums">{fmtTRY(report.raw_pipeline_try, 0)}</span>
              </div>
            )}
          </div>

          {/* Deferred ratio */}
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
              Erteleme Oranı
            </div>
            <div className="text-[10px] text-[#94a3b8] mb-1">Ertelenen / tahakkuk geliri</div>
            <div className="text-lg font-black tabular-nums text-[#0f172a]">
              {fmtPct(cur.deferred_ratio_pct)}
            </div>
          </div>

          {/* Prior period comparison */}
          {prior && (
            <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                Önceki Dönem — {prior.period_label}
              </div>
              <div className="space-y-1.5">
                {[
                  { label: 'Tahakkuk',    value: prior.accrual_revenue_try },
                  { label: 'Nakit',       value: prior.cash_revenue_try },
                  { label: 'Verimlilik',  value: null, pct: prior.collection_efficiency_pct, cls: prior.collection_efficiency_class },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[#64748b]">{row.label}</span>
                    {row.pct !== undefined ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] tabular-nums font-semibold text-[#1e293b]">
                          {row.pct !== null ? `%${row.pct.toFixed(1)}` : '—'}
                        </span>
                        {row.cls && <EfficiencyBadge cls={row.cls as EffClass} />}
                      </div>
                    ) : (
                      <span className="text-[10px] tabular-nums font-semibold text-[#1e293b]">
                        {fmtTRY(row.value ?? 0, 0)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
