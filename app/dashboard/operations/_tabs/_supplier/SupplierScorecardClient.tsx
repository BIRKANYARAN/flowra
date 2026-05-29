'use client'
// ── SupplierScorecardClient — Supplier Performance Scorecard ──────────────────
// Fetches /api/commercial/supplier-scorecard via TanStack Query.
// Features:
//   • 4 KPI cells: total suppliers / strategic count / critical dependencies / diversification
//   • Diversification badge
//   • Supplier table sorted by composite score with tier badges
//   • Empty and loading states

import { useQuery } from '@tanstack/react-query'
import type {
  SupplierScorecardReport,
  SupplierMetrics,
  SupplierScore,
} from '@/lib/services/commercial/supplier-scorecard.service'
import { fmtTRY } from '@/lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

type MergedSupplier = SupplierMetrics & SupplierScore

interface ApiResponse {
  report: SupplierScorecardReport
}

// ── Config maps ───────────────────────────────────────────────────────────────

const TIER_CFG: Record<
  SupplierScore['supplier_tier'],
  { label: string; bg: string; text: string }
> = {
  strategic:  { label: 'Stratejik',    bg: 'bg-purple-100', text: 'text-purple-800' },
  preferred:  { label: 'Tercihli',     bg: 'bg-green-100',  text: 'text-green-800'  },
  standard:   { label: 'Standart',     bg: 'bg-blue-100',   text: 'text-blue-800'   },
  occasional: { label: 'Dönemsel',     bg: 'bg-[#f1f5f9]',  text: 'text-[#64748b]'  },
  at_risk:    { label: 'Risk Altında', bg: 'bg-red-100',    text: 'text-red-800'    },
}

const DEPENDENCY_CFG: Record<
  SupplierScore['dependency_level'],
  { label: string; color: string }
> = {
  critical: { label: 'Kritik',    color: 'text-red-700 font-bold'     },
  high:     { label: 'Yüksek',    color: 'text-orange-700 font-semibold' },
  moderate: { label: 'Orta',      color: 'text-yellow-700'            },
  low:      { label: 'Düşük',     color: 'text-green-700'             },
}

const DIVERSIFICATION_CFG = {
  concentrated: { label: 'Konsantre',    bg: 'bg-red-100',    text: 'text-red-800'    },
  moderate:     { label: 'Orta Çeşitli', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  diversified:  { label: 'Çeşitlenmiş',  bg: 'bg-green-100',  text: 'text-green-800'  },
} as const

// ── Sub-components ────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: SupplierScore['supplier_tier'] }) {
  const cfg = TIER_CFG[tier]
  return (
    <span
      className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  )
}

function DiversificationBadge({
  level,
}: {
  level: 'concentrated' | 'moderate' | 'diversified'
}) {
  const cfg = DIVERSIFICATION_CFG[level]
  return (
    <span
      className={`inline-block text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  )
}

function KpiCell({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <div className="p-3 border-r border-[#f1f5f9] last:border-r-0">
      <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
        {label}
      </div>
      <div className="text-lg font-black tabular-nums leading-none text-[#0f172a]">{value}</div>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  )
}

function SkeletonBlock() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-48 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-0 border border-[#f1f5f9] rounded divide-x divide-[#f1f5f9]">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="p-3 h-16 bg-[#f8fafc]" />
        ))}
      </div>
      <div className="h-48 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct   = Math.min(100, Math.max(0, score))
  const color =
    pct >= 75 ? 'bg-green-400' :
    pct >= 55 ? 'bg-yellow-400' :
    pct >= 35 ? 'bg-orange-400' :
                'bg-red-400'

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-[#f1f5f9] rounded overflow-hidden">
        <div className={`h-1.5 rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-[#334155]">{Math.round(pct)}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export default function SupplierScorecardClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['supplier-scorecard', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/supplier-scorecard')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour — matches revalidate=3600
  })

  if (isLoading) return <SkeletonBlock />

  if (error || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Tedarikçi karnesi yüklenemedi.</p>
      </div>
    )
  }

  const { report } = data
  const { portfolio_summary, diversification, suppliers } = report

  const criticalCount = portfolio_summary.critical_dependency_count

  return (
    <div className="bg-white border border-[#e2e8f0] rounded space-y-0">
      {/* Header */}
      <div className="px-4 py-2 border-b border-[#f1f5f9] flex items-center justify-between">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Tedarikçi Karnesi
        </div>
        <DiversificationBadge level={diversification} />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 divide-x divide-[#f1f5f9] border-b border-[#f1f5f9]">
        <KpiCell
          label="Toplam Tedarikçi"
          value={portfolio_summary.total_suppliers}
        />
        <KpiCell
          label="Stratejik"
          value={portfolio_summary.strategic_count}
          sub={
            <span className="text-[0.6rem] text-[#94a3b8]">
              {portfolio_summary.preferred_count} tercihli
            </span>
          }
        />
        <KpiCell
          label="Kritik Bağımlılık"
          value={
            <span className={criticalCount > 0 ? 'text-red-600' : 'text-[#0f172a]'}>
              {criticalCount}
            </span>
          }
          sub={
            <span className="text-[0.6rem] text-[#94a3b8]">
              {portfolio_summary.at_risk_count} risk altında
            </span>
          }
        />
        <KpiCell
          label="Toplam Alım"
          value={fmtTRY(report.total_purchases_try)}
          sub={
            <span className="text-[0.6rem] text-[#94a3b8]">
              Son {report.analysis_window_months} ay
            </span>
          }
        />
      </div>

      {/* Supplier table */}
      {suppliers.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[#94a3b8]">
          Bu dönemde tedarikçi verisi bulunamadı.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                <th className="px-3 py-2 text-left font-bold text-[#64748b]">Tedarikçi</th>
                <th className="px-3 py-2 text-left font-bold text-[#64748b]">Katman</th>
                <th className="px-3 py-2 text-right font-bold text-[#64748b]">Puan</th>
                <th className="px-3 py-2 text-right font-bold text-[#64748b]">Pay %</th>
                <th className="px-3 py-2 text-left font-bold text-[#64748b]">Bağımlılık</th>
                <th className="px-3 py-2 text-right font-bold text-[#64748b]">Alım Tutarı</th>
                <th className="px-3 py-2 text-right font-bold text-[#64748b]">Aktif Ay</th>
              </tr>
            </thead>
            <tbody>
              {(suppliers as MergedSupplier[]).map((s, idx) => {
                const depCfg = DEPENDENCY_CFG[s.dependency_level]
                return (
                  <tr
                    key={s.supplier_key}
                    className={`border-b border-[#f8fafc] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}
                  >
                    <td className="px-3 py-2 font-medium text-[#0f172a] max-w-[160px] truncate">
                      {s.supplier_name}
                    </td>
                    <td className="px-3 py-2">
                      <TierBadge tier={s.supplier_tier} />
                    </td>
                    <td className="px-3 py-2">
                      <ScoreBar score={s.composite_score} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#334155]">
                      {s.purchase_concentration_pct.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2 text-left text-[11px] ${depCfg.color}`}>
                      {depCfg.label}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#334155]">
                      {fmtTRY(s.total_purchases_try)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                      {s.months_active}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
