'use client'

// ── VendorConcentrationClient — Vendor Spend Concentration Risk Analysis ───────
// Client component — fetches /api/commercial/vendor-concentration on mount.
// Shows HHI score, Pareto insight, single-source risk alerts, vendor table,
// top-3 chip, and 6-month HHI trend.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtDate } from '@/lib/format'
import type {
  VendorConcentrationReport,
  VendorProfile,
  VendorTier,
  VendorConcentrationLevel,
} from '@/lib/services/commercial/vendor-concentration.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const LEVEL_BADGE: Record<VendorConcentrationLevel, string> = {
  diversified:        'bg-[#dcfce7] text-[#15803d]',
  moderate:           'bg-[#fef9c3] text-[#854d0e]',
  concentrated:       'bg-[#fed7aa] text-[#9a3412]',
  highly_concentrated: 'bg-[#fee2e2] text-[#991b1b]',
}

const LEVEL_LABEL: Record<VendorConcentrationLevel, string> = {
  diversified:        'Çeşitlendirilmiş',
  moderate:           'Orta Konsantrasyon',
  concentrated:       'Yoğun',
  highly_concentrated: 'Çok Yoğun',
}

const TIER_BADGE: Record<VendorTier, string> = {
  tier1: 'bg-[#fee2e2] text-[#991b1b]',
  tier2: 'bg-[#fed7aa] text-[#9a3412]',
  tier3: 'bg-[#fef9c3] text-[#854d0e]',
  tier4: 'bg-[#f1f5f9] text-[#64748b]',
}

const TIER_LABEL: Record<VendorTier, string> = {
  tier1: 'T1',
  tier2: 'T2',
  tier3: 'T3',
  tier4: 'T4',
}

function hhiBgColor(level: VendorConcentrationLevel): string {
  switch (level) {
    case 'diversified':        return 'bg-[#22c55e]'
    case 'moderate':           return 'bg-[#eab308]'
    case 'concentrated':       return 'bg-[#f97316]'
    case 'highly_concentrated': return 'bg-[#ef4444]'
  }
}

function hhiTextColor(level: VendorConcentrationLevel): string {
  switch (level) {
    case 'diversified':        return 'text-[#15803d]'
    case 'moderate':           return 'text-[#854d0e]'
    case 'concentrated':       return 'text-[#9a3412]'
    case 'highly_concentrated': return 'text-[#991b1b]'
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 animate-pulse space-y-3">
      <div className="h-4 w-48 bg-[#f1f5f9] rounded" />
      <div className="h-16 bg-[#f1f5f9] rounded" />
      <div className="h-32 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function VendorConcentrationClient({ companyId }: Props) {
  const [months, setMonths] = useState<3 | 6 | 12>(6)

  const { data, isLoading, isError } = useQuery<{ report: VendorConcentrationReport }>({
    queryKey:  ['vendor-concentration', companyId, months],
    queryFn:   async () => {
      const res = await fetch(`/api/commercial/vendor-concentration?months=${months}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 1000 * 60 * 10,
  })

  if (isLoading) return <Skeleton />

  if (isError) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 text-xs text-[#94a3b8]">
        Tedarikçi konsantrasyon verisi yüklenemedi.
      </div>
    )
  }

  const report = data?.report

  if (!report || report.total_vendors === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
          Tedarikçi Konsantrasyon Riski
        </div>
        <p className="text-xs text-[#94a3b8]">Tedarikçi verisi bulunamadı.</p>
      </div>
    )
  }

  const topVendors = report.vendors.slice(0, 10)
  const maxShare = report.vendors[0]?.spend_share_pct ?? 1

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Tedarikçi Konsantrasyon Riski
        </span>
        <div className="flex items-center gap-1">
          {([3, 6, 12] as const).map(m => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                months === m
                  ? 'bg-[#0f172a] text-white'
                  : 'text-[#64748b] hover:bg-[#f1f5f9]'
              }`}
            >
              {m}A
            </button>
          ))}
        </div>
      </div>

      {/* ── Single-source risk alert ─────────────────────────────────────────── */}
      {report.single_source_vendors.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#fee2e2] border-b border-[#fecaca]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#991b1b]">
            ⚠ Tek Tedarikçi Bağımlılığı Riski
          </span>
          <span className="text-[10px] text-[#991b1b]">
            {report.single_source_vendors.map(v => `${v.vendor_name} (%${v.spend_share_pct.toFixed(0)})`).join(' · ')}
          </span>
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-[#f1f5f9]">
        {/* HHI score */}
        <div className="p-3 border-b sm:border-b-0 sm:border-r border-[#e8eaef]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">HHI Skoru</div>
          <div className={`text-xl font-black tabular-nums leading-none ${hhiTextColor(report.concentration_level)}`}>
            {report.hhi.toLocaleString('tr-TR')}
          </div>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide mt-1 ${LEVEL_BADGE[report.concentration_level]}`}>
            {LEVEL_LABEL[report.concentration_level]}
          </span>
        </div>

        {/* Total spend */}
        <div className="p-3 border-b sm:border-b-0 sm:border-r border-[#e8eaef]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Toplam Alım</div>
          <div className="text-xl font-black tabular-nums leading-none text-[#0f172a]">
            {fmtTRY(report.total_spend_try)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1">{report.total_vendors} tedarikçi</div>
        </div>

        {/* Pareto-80 */}
        <div className="p-3 border-b sm:border-b-0 sm:border-r border-[#e8eaef]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Pareto 80</div>
          <div className="text-xl font-black tabular-nums leading-none text-[#0f172a]">
            {report.pareto_80_count}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1">
            tedarikçi → alımların %80&apos;i
          </div>
        </div>

        {/* Top-3 share */}
        <div className="p-3">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">İlk 3 Pay</div>
          <div className={`text-xl font-black tabular-nums leading-none ${report.top_3_spend_pct > 60 ? 'text-[#991b1b]' : 'text-[#0f172a]'}`}>
            %{report.top_3_spend_pct.toFixed(0)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1">en büyük 3 tedarikçi</div>
        </div>
      </div>

      {/* ── Pareto insight ───────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
        <p className="text-[10px] text-[#64748b]">
          En büyük{' '}
          <span className="font-bold text-[#0f172a]">{report.pareto_80_count}</span>{' '}
          tedarikçi, toplam alımların{' '}
          <span className="font-bold text-[#0f172a]">%80</span>&apos;ini oluşturuyor.
          {report.single_source_vendors.length > 0 && (
            <span className="text-[#991b1b] font-semibold ml-1">
              {report.single_source_vendors.length} tedarikçi tek kaynak riski taşıyor.
            </span>
          )}
        </p>
      </div>

      {/* ── Vendor table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#e8eaef]">
              <th className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-4 py-2">Tedarikçi</th>
              <th className="text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">Tutar</th>
              <th className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2 min-w-[120px]">Pay %</th>
              <th className="text-center text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">Katman</th>
              <th className="text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">İşlem</th>
              <th className="text-center text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f8fafc]">
            {topVendors.map(vendor => {
              const barWidth = maxShare > 0 ? (vendor.spend_share_pct / maxShare) * 100 : 0
              return (
                <tr key={vendor.vendor_name} className="hover:bg-[#f8fafc]/60">
                  {/* Vendor name */}
                  <td className="px-4 py-2 font-medium text-[#334155] max-w-[160px] truncate">
                    <div className="truncate">{vendor.vendor_name}</div>
                    {vendor.categories.length > 0 && (
                      <div className="text-[9px] text-[#94a3b8] truncate">
                        {vendor.categories.slice(0, 2).join(', ')}
                      </div>
                    )}
                  </td>
                  {/* Amount */}
                  <td className="px-2 py-2 text-right tabular-nums text-[#1e293b] font-semibold">
                    {fmtTRY(vendor.total_spend_try)}
                  </td>
                  {/* Share bar */}
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-4 bg-[#f1f5f9] rounded overflow-hidden">
                        <div
                          className={`h-4 rounded ${vendor.is_single_source_risk ? 'bg-[#ef4444]' : vendor.tier === 'tier1' ? 'bg-[#f97316]' : 'bg-[#3b82f6]'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-[#64748b] w-10 text-right">
                        %{vendor.spend_share_pct.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  {/* Tier */}
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${TIER_BADGE[vendor.tier]}`}>
                      {TIER_LABEL[vendor.tier]}
                    </span>
                  </td>
                  {/* Transaction count */}
                  <td className="px-2 py-2 text-right tabular-nums text-[#64748b]">
                    {vendor.transaction_count}
                  </td>
                  {/* Risk badge */}
                  <td className="px-2 py-2 text-center">
                    {vendor.is_single_source_risk ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#fee2e2] text-[#991b1b]">
                        Tek Kaynak
                      </span>
                    ) : vendor.tier === 'tier1' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#fed7aa] text-[#9a3412]">
                        Yüksek Pay
                      </span>
                    ) : (
                      <span className="text-[#94a3b8] text-[9px]">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {report.vendors.length > 10 && (
          <div className="px-4 py-2 text-[10px] text-[#94a3b8] border-t border-[#f1f5f9]">
            +{report.vendors.length - 10} daha tedarikçi
          </div>
        )}
      </div>

      {/* ── Monthly HHI trend ────────────────────────────────────────────────── */}
      {report.monthly_hhi_trend.length > 0 && (
        <div className="border-t border-[#f1f5f9] px-4 py-3">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
            Aylık HHI Trendi
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e8eaef]">
                  <th className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] pb-1.5 pr-4">Ay</th>
                  <th className="text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] pb-1.5 px-2">HHI</th>
                  <th className="text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] pb-1.5 px-2">Tedarikçi</th>
                  <th className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] pb-1.5 pl-2">Seviye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {report.monthly_hhi_trend.map(row => {
                  const level = row.hhi < 1500
                    ? 'diversified'
                    : row.hhi < 2500
                      ? 'moderate'
                      : row.hhi < 4000
                        ? 'concentrated'
                        : 'highly_concentrated' as VendorConcentrationLevel
                  return (
                    <tr key={row.month} className="hover:bg-[#f8fafc]/60">
                      <td className="py-1.5 pr-4 text-[#64748b]">{row.month}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${hhiTextColor(level)}`}>
                        {row.hhi.toLocaleString('tr-TR')}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-[#64748b]">
                        {row.vendor_count}
                      </td>
                      <td className="py-1.5 pl-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${LEVEL_BADGE[level]}`}>
                          {LEVEL_LABEL[level]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-[#f1f5f9] bg-[#f8fafc]">
        <p className="text-[9px] text-[#cbd5e1]">
          HHI: Herfindahl-Hirschman Index — 0–10.000 · &gt;4000 çok yoğun · &lt;1500 çeşitlendirilmiş · Tek kaynak riski: %60+ pay
        </p>
      </div>
    </div>
  )
}
