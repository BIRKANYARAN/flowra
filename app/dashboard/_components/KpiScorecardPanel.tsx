'use client'

// ─────────────────────────────────────────────────────────────────────────────
// KpiScorecardPanel — KPI Scorecard Tracker: Target vs Actual
//
// Features:
//   - Period selector (last 6 months)
//   - Health score: large grade letter + numeric score
//   - 6 KPI rows: Name | Actual | Target | Achievement% | Status badge | Trend
//   - Summary counts
//   - Info banner when no targets defined
// ─────────────────────────────────────────────────────────────────────────────

import { useState }   from 'react'
import { useQuery }   from '@tanstack/react-query'
import { fmtTRY, fmtPct, fmtNum } from '@/lib/format'
import type {
  KpiScorecard,
  KpiScorecardEntry,
  KpiStatus,
  KpiTrend,
  ScorecardGrade,
} from '@/lib/services/intelligence/kpi-scorecard.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Period helpers ─────────────────────────────────────────────────────────────

function buildPeriodOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const lbl = d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    options.push({ value: val, label: lbl })
  }
  return options
}

function currentPeriodKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<KpiStatus, { badge: string; label: string }> = {
  achieved:     { badge: 'bg-pos-light text-pos-text border-pos',        label: 'Hedefte'   },
  near_target:  { badge: 'bg-[#f0fdfa] text-[#0f766e] border-[#99f6e4]', label: 'Yakın'     },
  below_target: { badge: 'bg-warn-light text-warn-text border-warn',      label: 'Geride'    },
  at_risk:      { badge: 'bg-neg-light text-neg border-neg',              label: 'Riskli'    },
  no_data:      { badge: 'bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]', label: 'Veri Yok'  },
}

// ── Grade config ──────────────────────────────────────────────────────────────

const GRADE_CFG: Record<ScorecardGrade, { color: string; bg: string }> = {
  A: { color: 'text-pos-text',     bg: 'bg-pos-light border-pos'         },
  B: { color: 'text-[#0f766e]',   bg: 'bg-[#f0fdfa] border-[#99f6e4]'  },
  C: { color: 'text-warn-text',   bg: 'bg-warn-light border-warn'        },
  D: { color: 'text-[#d97706]',   bg: 'bg-[#fffbeb] border-[#fde68a]'   },
  F: { color: 'text-neg',         bg: 'bg-neg-light border-neg'          },
}

// ── Trend display ─────────────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: KpiTrend }) {
  if (trend === 'improving') return <span className="text-pos-text font-bold">↑</span>
  if (trend === 'declining') return <span className="text-neg font-bold">↓</span>
  return <span className="text-[#94a3b8]">→</span>
}

// ── Actual value formatter ────────────────────────────────────────────────────

function formatActual(entry: KpiScorecardEntry): string {
  if (entry.actual_value === null) return '—'
  if (entry.unit === 'try')   return fmtTRY(entry.actual_value, 0)
  if (entry.unit === 'pct')   return fmtPct(entry.actual_value)
  if (entry.unit === 'days')  return `${Math.round(entry.actual_value)} gün`
  return fmtNum(entry.actual_value, 1)
}

function formatTarget(entry: KpiScorecardEntry): string {
  if (entry.target_value === null) return '—'
  if (entry.unit === 'try')  return fmtTRY(entry.target_value, 0)
  if (entry.unit === 'pct')  return fmtPct(entry.target_value)
  if (entry.unit === 'days') return `${Math.round(entry.target_value)} gün`
  return fmtNum(entry.target_value, 1)
}

// ── KPI row ───────────────────────────────────────────────────────────────────

function KpiRow({ entry }: { entry: KpiScorecardEntry }) {
  const sc = STATUS_CFG[entry.status]
  return (
    <tr className="border-b border-[#f1f5f9] last:border-0">
      <td className="py-2 pr-3 text-xs font-medium text-[#0f172a] whitespace-nowrap">
        {entry.kpi_label}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums text-[#0f172a] text-right">
        {formatActual(entry)}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums text-[#64748b] text-right">
        {formatTarget(entry)}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums text-right">
        {entry.achievement_pct !== null
          ? <span className={entry.achievement_pct >= 100 ? 'text-pos-text' : 'text-[#0f172a]'}>
              {fmtPct(entry.achievement_pct)}
            </span>
          : <span className="text-[#cbd5e1]">—</span>
        }
      </td>
      <td className="py-2 pr-3">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${sc.badge}`}>
          {sc.label}
        </span>
      </td>
      <td className="py-2 text-center text-sm">
        <TrendArrow trend={entry.trend} />
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function KpiScorecardPanel({ companyId }: Props) {
  const periods = buildPeriodOptions()
  const [period, setPeriod] = useState(currentPeriodKey())

  const { data, isLoading, error } = useQuery<KpiScorecard>({
    queryKey:  ['kpi-scorecard', companyId, period],
    queryFn:   async () => {
      const res = await fetch(`/api/intelligence/kpi-scorecard?period=${period}`)
      if (!res.ok) throw new Error('Skorkart alınamadı')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const hasTargets = data
    ? data.entries.some(e => e.target_value !== null)
    : true // optimistic while loading

  const gc = data ? GRADE_CFG[data.grade] : null

  return (
    <section className="bg-white border border-[#e2e8f0] rounded-lg shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <h2 className="text-sm font-bold text-[#0f172a]">KPI Skorkartı</h2>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Hedef vs Gerçekleşen</p>
        </div>

        {/* Period selector */}
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="text-xs border border-[#e2e8f0] rounded px-2 py-1 text-[#0f172a] bg-white focus:outline-none focus:ring-1 focus:ring-brand-light"
        >
          {periods.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Health score hero */}
      {data && (
        <div className="flex items-center gap-4 px-4 py-3 bg-[#f8fafc] border-b border-[#f1f5f9]">
          <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-lg border-2 ${gc!.bg} shrink-0`}>
            <span className={`text-3xl font-black leading-none ${gc!.color}`}>{data.grade}</span>
            <span className={`text-[10px] font-semibold ${gc!.color}`}>{Math.round(data.health_score)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#64748b]">{data.period_label} dönemi sağlık skoru</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              <span className="text-[10px] font-semibold text-pos-text">
                {data.achieved_count} hedefte
              </span>
              <span className="text-[10px] font-semibold text-neg">
                {data.at_risk_count} riskli
              </span>
              {data.no_data_count > 0 && (
                <span className="text-[10px] text-[#94a3b8]">
                  {data.no_data_count} veri yok
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No targets banner */}
      {data && !hasTargets && (
        <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-[#eff6ff] border border-[#bfdbfe] rounded text-xs text-[#1d4ed8]">
          Hedef değerleri Ayarlar&apos;dan tanımlayabilirsiniz
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand-light border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-4 text-xs text-neg">Skorkart yüklenemedi. Sayfayı yenileyin.</div>
      )}

      {/* KPI table */}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-[#f1f5f9]">
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">KPI</th>
                <th className="px-0 pr-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Gerçekleşen</th>
                <th className="px-0 pr-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Hedef</th>
                <th className="px-0 pr-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Başarı%</th>
                <th className="px-0 pr-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
                <th className="px-0 pr-3 py-2 text-center text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Trend</th>
              </tr>
            </thead>
            <tbody className="px-4">
              {data.entries.map(entry => (
                <tr key={entry.kpi_key} className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc] transition-colors">
                  <td className="px-4 py-2 text-xs font-medium text-[#0f172a] whitespace-nowrap">
                    {entry.kpi_label}
                  </td>
                  <td className="py-2 pr-3 text-xs tabular-nums text-[#0f172a] text-right">
                    {formatActual(entry)}
                  </td>
                  <td className="py-2 pr-3 text-xs tabular-nums text-[#64748b] text-right">
                    {formatTarget(entry)}
                  </td>
                  <td className="py-2 pr-3 text-xs tabular-nums text-right">
                    {entry.achievement_pct !== null
                      ? <span className={entry.achievement_pct >= 100 ? 'text-pos-text font-semibold' : 'text-[#0f172a]'}>
                          {fmtPct(entry.achievement_pct)}
                        </span>
                      : <span className="text-[#cbd5e1]">—</span>
                    }
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${STATUS_CFG[entry.status].badge}`}>
                      {STATUS_CFG[entry.status].label}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-center text-sm">
                    <TrendArrow trend={entry.trend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer summary */}
      {data && (
        <div className="px-4 py-2 bg-[#f8fafc] border-t border-[#f1f5f9] flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-[#64748b]">
            {data.achieved_count} hedefte / {data.at_risk_count} riskli
            {data.no_data_count > 0 && ` / ${data.no_data_count} veri yok`}
          </span>
          <span className="text-[10px] text-[#94a3b8]">·</span>
          <span className="text-[10px] text-[#94a3b8]">Skor: {Math.round(data.health_score)} / 100</span>
        </div>
      )}
    </section>
  )
}
