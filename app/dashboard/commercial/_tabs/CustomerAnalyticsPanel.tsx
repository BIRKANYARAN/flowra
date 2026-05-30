'use client'

// ── CustomerAnalyticsPanel — Segment Summary + Sortable Customer Table ────────
// Uses pure helpers from cohort-retention.service.ts:
//   computeEstimatedLTV, computeCustomerRiskScore, classifyCustomerSegment
//
// Shows:
//   • Segment summary strip: Champion / Loyal / At Risk / Lost / New
//   • Sortable customer table: revenue, order count, last purchase, retention,
//     risk score (bar), estimated LTV, segment badge
//   • 8 mock customers with diverse profiles (no DB dependency)

import { useState, useMemo } from 'react'
import {
  computeEstimatedLTV,
  computeCustomerRiskScore,
  classifyCustomerSegment,
} from '@/lib/services/commercial/cohort-retention.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type Segment = 'champion' | 'loyal' | 'at_risk' | 'lost' | 'new'
type SortKey  = 'revenue' | 'risk' | 'ltv'

interface CustomerRow {
  name:                  string
  revenueYtd:            number    // TRY
  orderCount:            number
  lastPurchaseDaysAgo:   number
  retentionRate:         number    // 0-100
  overdueAmountTry:      number
  avgPaymentDelayDays:   number
  avgOrderValue:         number
  ordersPerYear:         number
  marginPct:             number    // 0-100
}

// ── Mock customers ────────────────────────────────────────────────────────────

const MOCK_CUSTOMERS: CustomerRow[] = [
  {
    name: 'Akça Tekstil A.Ş.',
    revenueYtd: 720_000,
    orderCount: 48,
    lastPurchaseDaysAgo: 12,
    retentionRate: 92,
    overdueAmountTry: 0,
    avgPaymentDelayDays: 3,
    avgOrderValue: 15_000,
    ordersPerYear: 48,
    marginPct: 28,
  },
  {
    name: 'Demir Yapı Ltd.',
    revenueYtd: 380_000,
    orderCount: 22,
    lastPurchaseDaysAgo: 20,
    retentionRate: 75,
    overdueAmountTry: 18_000,
    avgPaymentDelayDays: 12,
    avgOrderValue: 17_272,
    ordersPerYear: 22,
    marginPct: 22,
  },
  {
    name: 'Yıldız Gıda San.',
    revenueYtd: 210_000,
    orderCount: 31,
    lastPurchaseDaysAgo: 8,
    retentionRate: 68,
    overdueAmountTry: 5_500,
    avgPaymentDelayDays: 7,
    avgOrderValue: 6_774,
    ordersPerYear: 31,
    marginPct: 18,
  },
  {
    name: 'Güneş Lojistik',
    revenueYtd: 95_000,
    orderCount: 14,
    lastPurchaseDaysAgo: 45,
    retentionRate: 42,
    overdueAmountTry: 32_000,
    avgPaymentDelayDays: 35,
    avgOrderValue: 6_785,
    ordersPerYear: 14,
    marginPct: 15,
  },
  {
    name: 'Bulut Teknoloji',
    revenueYtd: 48_000,
    orderCount: 5,
    lastPurchaseDaysAgo: 15,
    retentionRate: 55,
    overdueAmountTry: 0,
    avgPaymentDelayDays: 5,
    avgOrderValue: 9_600,
    ordersPerYear: 5,
    marginPct: 35,
  },
  {
    name: 'Kaya Madencilik',
    revenueYtd: 160_000,
    orderCount: 7,
    lastPurchaseDaysAgo: 120,
    retentionRate: 12,
    overdueAmountTry: 60_000,
    avgPaymentDelayDays: 78,
    avgOrderValue: 22_857,
    ordersPerYear: 7,
    marginPct: 20,
  },
  {
    name: 'Nova Medikal',
    revenueYtd: 22_000,
    orderCount: 2,
    lastPurchaseDaysAgo: 30,
    retentionRate: 40,
    overdueAmountTry: 0,
    avgPaymentDelayDays: 0,
    avgOrderValue: 11_000,
    ordersPerYear: 2,
    marginPct: 40,
  },
  {
    name: 'Çelik Enerji A.Ş.',
    revenueYtd: 580_000,
    orderCount: 35,
    lastPurchaseDaysAgo: 5,
    retentionRate: 85,
    overdueAmountTry: 8_000,
    avgPaymentDelayDays: 6,
    avgOrderValue: 16_571,
    ordersPerYear: 35,
    marginPct: 25,
  },
]

// ── Segment config ─────────────────────────────────────────────────────────────

const SEG_CFG: Record<Segment, { label: string; badge: string; dot: string }> = {
  champion: { label: 'Şampiyon',  badge: 'bg-[#dbeafe] text-[#1d4ed8]', dot: 'bg-[#3b82f6]' },
  loyal:    { label: 'Sadık',     badge: 'bg-[#dcfce7] text-[#15803d]', dot: 'bg-[#22c55e]' },
  at_risk:  { label: 'Risk',      badge: 'bg-warn-light text-warn-text', dot: 'bg-warn'      },
  lost:     { label: 'Kayıp',     badge: 'bg-neg-light text-neg-text',   dot: 'bg-neg'       },
  new:      { label: 'Yeni',      badge: 'bg-[#f3e8ff] text-[#7e22ce]', dot: 'bg-[#a855f7]' },
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtTRY(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M ₺`
  if (v >= 1_000)     return `${Math.round(v / 1_000)}K ₺`
  return `${Math.round(v)} ₺`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CustomerAnalyticsPanel() {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')

  // Derive computed columns once
  const enriched = useMemo(() => MOCK_CUSTOMERS.map(c => {
    const segment   = classifyCustomerSegment(c.revenueYtd, c.orderCount, c.retentionRate)
    const riskScore = computeCustomerRiskScore(c.lastPurchaseDaysAgo, c.overdueAmountTry, c.avgPaymentDelayDays)
    const ltv       = computeEstimatedLTV(c.avgOrderValue, c.ordersPerYear, c.retentionRate, c.marginPct)
    return { ...c, segment, riskScore, ltv }
  }), [])

  // Segment counts
  const segCounts = useMemo(() => {
    const map: Record<Segment, number> = { champion: 0, loyal: 0, at_risk: 0, lost: 0, new: 0 }
    for (const r of enriched) map[r.segment]++
    return map
  }, [enriched])

  // Sorted rows
  const sorted = useMemo(() => [...enriched].sort((a, b) => {
    if (sortKey === 'revenue') return b.revenueYtd  - a.revenueYtd
    if (sortKey === 'risk')    return b.riskScore   - a.riskScore
    return b.ltv - a.ltv
  }), [enriched, sortKey])

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri Analitik Paneli
        </span>
        <span className="text-[10px] text-[#94a3b8]">{enriched.length} müşteri · demo verisi</span>
      </div>

      {/* Segment summary strip */}
      <div className="grid grid-cols-5 divide-x divide-[#f1f5f9] border-b border-[#f1f5f9]">
        {(Object.keys(SEG_CFG) as Segment[]).map(seg => (
          <div key={seg} className="flex flex-col items-center py-3 px-2">
            <div className={`w-2 h-2 rounded-full ${SEG_CFG[seg].dot} mb-1`} />
            <div className="text-lg font-black tabular-nums text-[#0f172a] leading-none">
              {segCounts[seg]}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-[#94a3b8] mt-0.5">
              {SEG_CFG[seg].label}
            </div>
          </div>
        ))}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#f1f5f9] bg-[#f8fafc]">
        <span className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-wide">Sırala:</span>
        {([['revenue', 'Ciro YTD'], ['risk', 'Risk Skoru'], ['ltv', 'Tahmini LTV']] as [SortKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide transition-colors ${
              sortKey === key
                ? 'bg-[#0f172a] text-white'
                : 'text-[#64748b] hover:text-[#0f172a] hover:bg-[#e2e8f0]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Customer table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-4 py-2 w-40">Müşteri</th>
              <th className="text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2">Ciro YTD</th>
              <th className="text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2">Sipariş</th>
              <th className="text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2 hidden sm:table-cell">Son Alım</th>
              <th className="text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2 hidden sm:table-cell">Tutma %</th>
              <th className="text-left  text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2">Risk</th>
              <th className="text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2 hidden md:table-cell">LTV</th>
              <th className="text-center text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2">Segment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f8fafc]">
            {sorted.map(row => {
              const riskBarColor =
                row.riskScore > 60 ? 'bg-neg'
                : row.riskScore > 35 ? 'bg-warn'
                : 'bg-[#22c55e]'
              const riskTextColor =
                row.riskScore > 60 ? 'text-neg-text'
                : row.riskScore > 35 ? 'text-warn-text'
                : 'text-pos-text'
              return (
                <tr key={row.name} className="hover:bg-[#f8fafc]/60 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-[#1e293b] truncate max-w-[10rem]" title={row.name}>
                    {row.name}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#0f172a]">
                    {fmtTRY(row.revenueYtd)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#475569]">
                    {row.orderCount}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#94a3b8] hidden sm:table-cell">
                    {row.lastPurchaseDaysAgo}g
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#475569] hidden sm:table-cell">
                    %{row.retentionRate}
                  </td>
                  {/* Risk score bar */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${riskBarColor}`}
                          style={{ width: `${Math.round(row.riskScore)}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-bold tabular-nums w-6 text-right ${riskTextColor}`}>
                        {Math.round(row.riskScore)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#475569] hidden md:table-cell">
                    {fmtTRY(row.ltv)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${SEG_CFG[row.segment].badge}`}>
                      {SEG_CFG[row.segment].label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-[#f1f5f9] text-[9px] text-[#c4c9d0]">
        Risk skoru = gecikmeli alım (30%) + vadesi geçmiş tutar (40%) + ödeme gecikmesi (30%) · LTV = tahmini yaşam boyu değer
      </div>
    </div>
  )
}
