'use client'
// ── CustomerConcentrationClient — HHI-based revenue concentration analysis ────
// Client island: fetches /api/commercial/customer-concentration via TanStack Query.
// Shows HHI gauge, risk metrics, 6-month trend sparkline, and customer tier table.

import { useQuery } from '@tanstack/react-query'
import type {
  CustomerConcentrationReport,
  CustomerConcentrationEntry,
  MonthlyHhi,
  ConcentrationLevel,
  CustomerTier,
} from '@/lib/services/commercial/customer-concentration.service'

// ── Format helpers ─────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

// ── Level config ───────────────────────────────────────────────────────────────

const LEVEL_CFG: Record<ConcentrationLevel, { label: string; badge: string; color: string }> = {
  unconcentrated:    { label: 'Düşük Yoğunlaşma',  badge: 'bg-pos-light text-pos-text',    color: 'text-pos-text' },
  moderate:          { label: 'Orta Yoğunlaşma',   badge: 'bg-warn-light text-warn-text',  color: 'text-warn-text' },
  concentrated:      { label: 'Yüksek Yoğunlaşma', badge: 'bg-orange-100 text-orange-700', color: 'text-orange-700' },
  highly_concentrated: { label: 'Çok Yüksek',      badge: 'bg-neg-light text-neg-text',    color: 'text-neg' },
}

const HHI_BAR_COLOR: Record<ConcentrationLevel, string> = {
  unconcentrated:      'bg-pos',
  moderate:            'bg-warn',
  concentrated:        'bg-orange-400',
  highly_concentrated: 'bg-neg',
}

// ── Tier config ────────────────────────────────────────────────────────────────

const TIER_CFG: Record<CustomerTier, { label: string; badge: string }> = {
  tier1: { label: 'Stratejik',  badge: 'bg-neg-light text-neg-text' },
  tier2: { label: 'Önemli',    badge: 'bg-warn-light text-warn-text' },
  tier3: { label: 'Standart',  badge: 'bg-[#f1f5f9] text-[#64748b]' },
  tier4: { label: 'Küçük',     badge: 'bg-[#f8fafc] text-[#94a3b8]' },
}

// ── Trend config ───────────────────────────────────────────────────────────────

const TREND_CFG = {
  improving:    { label: 'İyileşiyor', color: 'text-pos-text',    icon: '↓' },
  worsening:    { label: 'Kötüleşiyor', color: 'text-neg',        icon: '↑' },
  stable:       { label: 'Stabil',     color: 'text-[#64748b]',   icon: '→' },
  insufficient: { label: 'Veri Yetersiz', color: 'text-[#94a3b8]', icon: '?' },
}

// ── HHI Sparkline ──────────────────────────────────────────────────────────────

function HhiSparkline({ data }: { data: MonthlyHhi[] }) {
  if (data.length === 0) return null
  const maxHhi = Math.max(...data.map(d => d.hhi), 1)

  return (
    <div className="flex items-end gap-1 h-12">
      {data.map(d => {
        const heightPct = (d.hhi / maxHhi) * 100
        const barColor = HHI_BAR_COLOR[d.level]
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex items-end justify-center" style={{ height: '40px' }}>
              <div
                className={`w-full rounded-t ${barColor}`}
                style={{ height: `${Math.max(heightPct, 4)}%` }}
                title={`${d.label}: HHI ${Math.round(d.hhi)}`}
              />
            </div>
            <div className="text-[8px] text-[#94a3b8] text-center whitespace-nowrap leading-none">
              {d.label.slice(0, 3)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Customer Tier Table ────────────────────────────────────────────────────────

function CustomerTierTable({ customers }: { customers: CustomerConcentrationEntry[] }) {
  if (customers.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Müşteri</th>
            <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-20">Seviye</th>
            <th className="text-right px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-24">Gelir</th>
            <th className="text-right px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-16">Pay</th>
            <th className="text-right px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-20">Kümülatif</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {customers.slice(0, 15).map(c => {
            const tierCfg = TIER_CFG[c.tier]
            const isPareto = c.in_pareto_80
            return (
              <tr key={c.customer_name} className={`hover:bg-[#f8fafc]/60 ${isPareto ? '' : 'opacity-60'}`}>
                <td className="px-3 py-2 text-[11px] font-bold text-[#334155] max-w-[160px] truncate" title={c.customer_name}>
                  {c.customer_name}
                </td>
                <td className="px-2 py-2 text-center">
                  <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${tierCfg.badge}`}>
                    {tierCfg.label}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-[11px] font-bold text-[#334155]">
                  {fmtTRY(c.revenue_try)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-[11px] font-semibold text-[#64748b]">
                  %{c.revenue_share_pct.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-[11px] text-[#94a3b8]">
                  %{c.cumulative_share_pct.toFixed(1)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {customers.length > 15 && (
        <div className="px-3 py-2 text-[10px] text-[#94a3b8] border-t border-[#f8fafc]">
          +{customers.length - 15} müşteri daha
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CustomerConcentrationClient() {
  const { data, isLoading, isError } = useQuery<{ report: CustomerConcentrationReport }>({
    queryKey: ['customer-concentration'],
    queryFn: () => fetch('/api/commercial/customer-concentration').then(r => r.json()),
    staleTime: 1000 * 60 * 30,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-6 animate-pulse">
        <div className="h-3 w-40 bg-[#f1f5f9] rounded mb-4" />
        <div className="h-16 bg-[#f8fafc] rounded" />
      </div>
    )
  }

  if (isError || !data?.report) return null

  const report = data.report
  if (report.total_customers === 0) return null

  const levelCfg = LEVEL_CFG[report.level]
  const trendCfg = TREND_CFG[report.hhi_trend]

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri Yoğunlaşma Analizi
        </span>
        <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${levelCfg.badge}`}>
          {levelCfg.label}
        </span>
      </div>

      {/* HHI Gauge + Metrics */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        {/* HHI score */}
        <div className="flex items-start gap-4 mb-3">
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
              HHI Skoru
            </div>
            <div className={`text-4xl font-black tabular-nums leading-none ${levelCfg.color}`}>
              {Math.round(report.hhi).toLocaleString('tr-TR')}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1">
              Maks: 10.000 (tekel)
            </div>
          </div>
          <div className="flex-1">
            {/* HHI scale bar */}
            <div className="mt-4">
              <div className="flex h-2 rounded overflow-hidden gap-0.5">
                <div className="bg-pos" style={{ width: '15%' }} />
                <div className="bg-warn" style={{ width: '10%' }} />
                <div className="bg-orange-400" style={{ width: '15%' }} />
                <div className="bg-neg flex-1" />
              </div>
              <div className="relative h-2 mt-0.5">
                <div
                  className="absolute w-0.5 h-3 bg-[#1e293b] -top-1 rounded"
                  style={{ left: `${Math.min((report.hhi / 10000) * 100, 99)}%` }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-[#94a3b8] mt-1">
                <span>0</span>
                <span>1.500</span>
                <span>2.500</span>
                <span>10.000</span>
              </div>
            </div>
          </div>
        </div>

        {/* Risk statement */}
        <p className="text-xs text-[#64748b] mb-3">
          Üst{' '}
          <strong className="text-[#1e293b]">{Math.min(report.pareto_customer_count, report.total_customers)}</strong>{' '}
          müşteri toplam gelirin{' '}
          <strong className="text-[#1e293b]">%{report.top1_share_pct > 0 ? '80' : '0'}&apos;ini</strong>{' '}
          oluşturuyor
          {' '}·{' '}
          {report.total_customers} aktif müşteri
        </p>

        {/* Concentration metrics row */}
        <div className="grid grid-cols-4 gap-0 border border-[#f1f5f9] rounded overflow-hidden">
          {[
            { label: 'Top 1',     value: `%${report.top1_share_pct.toFixed(1)}` },
            { label: 'Top 3',     value: `%${report.top3_share_pct.toFixed(1)}` },
            { label: 'Top 5',     value: `%${report.top5_share_pct.toFixed(1)}` },
            { label: 'Pareto 80%', value: `${report.pareto_customer_count} müş.` },
          ].map((m, i) => (
            <div key={m.label} className={`px-2 py-2 ${i < 3 ? 'border-r border-[#f1f5f9]' : ''}`}>
              <div className="text-[0.55rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                {m.label}
              </div>
              <div className="text-sm font-black tabular-nums text-[#1e293b] leading-none">
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* At-risk warning */}
        {report.top1_share_pct > 30 && (
          <div className="mt-3 bg-neg-light border border-neg-light rounded px-3 py-2">
            <div className="text-[11px] font-black uppercase tracking-wide text-neg-text">
              Yoğunlaşma Riski
            </div>
            <div className="text-xs text-neg-text mt-0.5">
              En büyük müşteri gelirin %{report.top1_share_pct.toFixed(0)}&apos;i — ayrılma riski{' '}
              <strong>{fmtTRY(report.at_risk_try)}</strong>
            </div>
          </div>
        )}
      </div>

      {/* 6-month HHI trend */}
      {report.monthly_hhi.length > 0 && (
        <div className="px-4 py-3 border-b border-[#f1f5f9]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              6 Aylık HHI Trendi
            </span>
            <span className={`text-[10px] font-bold ${trendCfg.color}`}>
              {trendCfg.icon} {trendCfg.label}
            </span>
          </div>
          <HhiSparkline data={report.monthly_hhi} />
        </div>
      )}

      {/* Customer tier table */}
      <div>
        <div className="px-4 py-2 border-b border-[#f1f5f9]">
          <div className="flex items-center justify-between">
            <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Müşteri Kademeleri
            </span>
            <div className="flex gap-2 text-[9px] text-[#94a3b8]">
              {report.tier1_count > 0 && (
                <span className="bg-neg-light text-neg-text px-1.5 py-0.5 rounded font-bold">
                  {report.tier1_count} Stratejik
                </span>
              )}
              {report.tier2_count > 0 && (
                <span className="bg-warn-light text-warn-text px-1.5 py-0.5 rounded font-bold">
                  {report.tier2_count} Önemli
                </span>
              )}
            </div>
          </div>
        </div>
        <CustomerTierTable customers={report.customers} />
      </div>

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Son 12 ay · HHI: 0 (rekabet) → 10.000 (tekel) · Gri satırlar: Pareto %80 dışı
      </div>
    </div>
  )
}
