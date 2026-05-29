'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PartnerCapitalStatementTab — Ortak Sermaye Tablosu
//
// Shows per-partner capital statement with:
//   - Summary KPIs: total equity, total loans, fulfillment %
//   - Per-partner table rows with capital line details
//   - Health badge and Turkish narrative footer
//
// Data: GET /api/partners/partner-capital-statement
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import {
  FlowraCard,
  FlowraKpiCard,
  FlowraStatusBadge,
} from '@/components/ds'
import type {
  PartnerCapitalStatementReport,
  PartnerCapitalLine,
} from '@/lib/services/pcle/partner-capital-statement.service'
import {
  classifyCapitalFulfillment,
  classifyLoanBurden,
} from '@/lib/services/pcle/partner-capital-statement.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: PartnerCapitalStatementReport
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchCapitalStatement(): Promise<ApiResponse> {
  const res = await fetch('/api/partners/partner-capital-statement')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<ApiResponse>
}

// ── Health badge helpers ──────────────────────────────────────────────────────

type HealthLevel = PartnerCapitalStatementReport['company_capital_health']

function healthStatusKey(health: HealthLevel): string {
  switch (health) {
    case 'excellent': return 'Mükemmel'
    case 'good':      return 'İyi'
    case 'fair':      return 'Orta'
    case 'poor':      return 'Zayıf'
    case 'critical':  return 'Kritik'
    default:          return 'Bilinmiyor'
  }
}

function fulfillmentStatusKey(pct: number): string {
  const tier = classifyCapitalFulfillment(pct)
  switch (tier) {
    case 'complete':      return 'complete'
    case 'near_complete': return 'accepted'
    case 'partial':       return 'partial'
    case 'low':           return 'overdue'
    case 'critical':      return 'rejected'
    default:              return 'draft'
  }
}

function loanBurdenStatusKey(ratio: number | null): string {
  const tier = classifyLoanBurden(ratio)
  switch (tier) {
    case 'no_debt':  return 'complete'
    case 'low':      return 'accepted'
    case 'moderate': return 'partial'
    case 'high':     return 'overdue'
    case 'severe':   return 'rejected'
    default:         return 'draft'
  }
}

function loanBurdenLabel(ratio: number | null): string {
  const tier = classifyLoanBurden(ratio)
  switch (tier) {
    case 'no_debt':  return 'Borçsuz'
    case 'low':      return 'Düşük'
    case 'moderate': return 'Orta'
    case 'high':     return 'Yüksek'
    case 'severe':   return 'Kritik'
    default:         return '—'
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PartnerCapitalStatementTab() {
  const { data, isLoading, isError, error } = useQuery<ApiResponse, Error>({
    queryKey: ['partner-capital-statement'],
    queryFn:  fetchCapitalStatement,
    staleTime: 30 * 60 * 1000, // 30 minutes
  })

  if (isLoading) {
    return (
      <div className="p-6 text-[#64748b] text-sm">
        Sermaye tablosu yükleniyor…
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="p-6 text-neg-text text-sm">
        Sermaye tablosu yüklenemedi: {error?.message ?? 'Bilinmeyen hata'}
      </div>
    )
  }

  const { report } = data
  const { summary, partner_lines: lines } = report

  return (
    <div className="space-y-6 p-1">
      {/* ── Summary KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <FlowraKpiCard
          label="Toplam Ödenmiş Sermaye"
          value={summary.total_paid_capital_try}
          sub="Tüm ortaklar"
        />
        <FlowraKpiCard
          label="Toplam Taahhüt"
          value={summary.total_committed_capital_try}
          sub="Tüm ortaklar"
        />
        <FlowraKpiCard
          label="Toplam Ortak Borcu"
          value={summary.total_outstanding_loans_try}
          sub="Aktif krediler"
        />
        <FlowraKpiCard
          label="Taahhüt Karşılama"
          value={0}
          rawValue={`${summary.weighted_avg_fulfillment_pct.toFixed(1)}%`}
          sub="Ağırlıklı ortalama"
        />
        <FlowraKpiCard
          label="Toplam Dağıtım"
          value={summary.total_distributions_try}
          sub="Tarihsel temettü + maaş"
        />
        <FlowraKpiCard
          label="Şirket Öz Sermayesi"
          value={summary.company_equity_try}
          sub="Ödenmiş sermaye toplamı"
        />
        <FlowraKpiCard
          label="Ortak Sayısı"
          value={report.partner_count}
          rawValue={String(report.partner_count)}
          sub={`${report.fully_funded_partners} tam karşılanan`}
        />
        <div className="flex flex-col justify-between rounded-lg border border-[#e2e8f0] bg-white p-4">
          <span className="text-xs text-[#64748b] font-medium mb-2">Sermaye Sağlığı</span>
          <FlowraStatusBadge status={healthStatusKey(report.company_capital_health)} />
        </div>
      </div>

      {/* ── Per-partner table ─────────────────────────────────────────────── */}
      <FlowraCard>
        <div className="p-4 border-b border-[#e2e8f0]">
          <h3 className="text-sm font-semibold text-[#0f172a]">Ortak Sermaye Detayı</h3>
          <p className="text-xs text-[#64748b] mt-0.5">Tarih: {report.as_of_date}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-4 py-2 font-medium text-[#475569]">Ortak</th>
                <th className="text-right px-4 py-2 font-medium text-[#475569]">Pay %</th>
                <th className="text-right px-4 py-2 font-medium text-[#475569]">Taahhüt</th>
                <th className="text-right px-4 py-2 font-medium text-[#475569]">Ödenen</th>
                <th className="text-right px-4 py-2 font-medium text-[#475569]">Eksik</th>
                <th className="text-right px-4 py-2 font-medium text-[#475569]">Kredi Bakiyesi</th>
                <th className="text-right px-4 py-2 font-medium text-[#475569]">Dağıtım</th>
                <th className="text-right px-4 py-2 font-medium text-[#475569]">Net Pozisyon</th>
                <th className="text-center px-4 py-2 font-medium text-[#475569]">Taahhüt</th>
                <th className="text-center px-4 py-2 font-medium text-[#475569]">Borç Yükü</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-[#94a3b8] py-8">
                    Henüz ortak verisi yok
                  </td>
                </tr>
              )}
              {lines.map((line: PartnerCapitalLine) => (
                <tr
                  key={line.partner_id}
                  className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-[#0f172a]">{line.partner_name}</td>
                  <td className="text-right px-4 py-3 text-[#475569]">
                    {line.share_pct.toFixed(1)}%
                  </td>
                  <td className="text-right px-4 py-3 text-[#475569]">
                    {fmtTRY(line.committed_capital_try)}
                  </td>
                  <td className="text-right px-4 py-3 text-[#475569]">
                    {fmtTRY(line.paid_capital_try)}
                  </td>
                  <td className="text-right px-4 py-3">
                    <span className={line.unpaid_capital_try > 0 ? 'text-neg-text' : 'text-[#94a3b8]'}>
                      {line.unpaid_capital_try > 0 ? fmtTRY(line.unpaid_capital_try) : '—'}
                    </span>
                  </td>
                  <td className="text-right px-4 py-3">
                    <span className={line.outstanding_loans_try > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}>
                      {line.outstanding_loans_try > 0 ? fmtTRY(line.outstanding_loans_try) : '—'}
                    </span>
                  </td>
                  <td className="text-right px-4 py-3 text-[#475569]">
                    {line.total_distributions_try > 0 ? fmtTRY(line.total_distributions_try) : '—'}
                  </td>
                  <td className="text-right px-4 py-3">
                    <span className={line.net_equity_position_try >= 0 ? 'text-pos-text' : 'text-neg-text'}>
                      {fmtTRY(line.net_equity_position_try)}
                    </span>
                  </td>
                  <td className="text-center px-4 py-3">
                    <FlowraStatusBadge
                      status={fulfillmentStatusKey(line.capital_fulfillment_pct)}
                    />
                  </td>
                  <td className="text-center px-4 py-3">
                    <span className="text-[10px] text-[#475569]">
                      {loanBurdenLabel(line.loan_to_equity_ratio)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FlowraCard>

      {/* ── Narrative footer ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
        <p className="text-xs text-[#475569]">
          <span className="font-medium">Değerlendirme: </span>
          {report.narrative}
        </p>
        <p className="text-[10px] text-[#94a3b8] mt-1">
          {report.partners_with_loans} ortak aktif kredi taşıyor · Güncelleme: {report.as_of_date}
        </p>
      </div>
    </div>
  )
}
