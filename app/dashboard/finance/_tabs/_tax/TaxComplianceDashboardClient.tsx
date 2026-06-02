'use client'
// ── TaxComplianceDashboardClient — Vergi Uyum Paneli ─────────────────────────
//
// Client island: fetches /api/tax/compliance-dashboard via TanStack Query.
//
// Features:
//   - Compliance score hero: large score + grade badge
//   - Next obligation card
//   - Obligations table with status badges and overdue highlighting
//   - Summary chips: Total Pending / YTD KDV / KV Provision
//   - Critical banner if any overdue obligations

import { useQuery } from '@tanstack/react-query'
import type { TaxComplianceDashboard, TaxObligation } from '@/lib/services/tax/tax-compliance.service'
import { fmtTRY, fmtDate } from '@/lib/format'

// ── Helpers ───────────────────────────────────────────────────────────────────

type ObligationStatus = TaxObligation['status']
type ComplianceStatus = TaxComplianceDashboard['compliance_status']

function statusChipCls(status: ObligationStatus): string {
  switch (status) {
    case 'overdue':      return 'bg-neg-light text-neg-text border-neg-light'
    case 'upcoming_7d':  return 'bg-warn-light text-warn-text border-warn-light'
    case 'upcoming_30d': return 'bg-[#dbeafe] text-[#1d4ed8] border-[#bfdbfe]'
    case 'on_time':      return 'bg-pos-light text-pos-text border-pos-light'
    case 'paid':         return 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
    default:             return 'bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]'
  }
}

function statusLabel(ob: TaxObligation): string {
  switch (ob.status) {
    case 'overdue':      return `${Math.abs(ob.days_until_due)} gün gecikti`
    case 'upcoming_7d':  return `${ob.days_until_due} gün kaldı`
    case 'upcoming_30d': return `${ob.days_until_due} gün kaldı`
    case 'on_time':      return `${ob.days_until_due} gün`
    case 'not_due':      return `${ob.days_until_due} gün`
    case 'paid':         return 'Ödendi'
    default:             return '—'
  }
}

function statusDisplayLabel(status: ObligationStatus): string {
  switch (status) {
    case 'overdue':      return 'Gecikmiş'
    case 'upcoming_7d':  return '7 gün içinde'
    case 'upcoming_30d': return '30 gün içinde'
    case 'on_time':      return 'Güncel'
    case 'not_due':      return 'Bekliyor'
    case 'paid':         return 'Ödendi'
    default:             return '—'
  }
}

function rowBgCls(status: ObligationStatus): string {
  if (status === 'overdue')      return 'bg-neg-light/20'
  if (status === 'upcoming_7d')  return 'bg-warn-light/10'
  return ''
}

function obligationTypeLabel(type: TaxObligation['obligation_type']): string {
  switch (type) {
    case 'kdv':              return 'KDV'
    case 'gecici_vergi':     return 'Geçici Vergi'
    case 'kurumlar_vergisi': return 'Kurumlar Vergisi'
    case 'sgk':              return 'SGK'
    default:                 return type
  }
}

function complianceBadge(status: ComplianceStatus): { label: string; cls: string } {
  switch (status) {
    case 'compliant': return { label: 'Uyumlu',  cls: 'bg-pos-light text-pos-text border-pos-light' }
    case 'attention': return { label: 'Dikkat',  cls: 'bg-warn-light text-warn-text border-warn-light' }
    case 'risk':      return { label: 'Risk',    cls: 'bg-[#fed7aa] text-[#c2410c] border-[#fdba74]' }
    case 'critical':  return { label: 'Kritik',  cls: 'bg-neg-light text-neg-text border-neg-light' }
    default:          return { label: '—',       cls: 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]' }
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-pos-text'
  if (score >= 60) return 'text-warn-text'
  if (score >= 40) return 'text-[#c2410c]'
  return 'text-neg'
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#e2e8f0]">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vergi Uyum Paneli</div>
      </div>
      <div className="px-4 py-8 text-center">
        <div className="text-xs text-[#94a3b8] animate-pulse">Yükleniyor…</div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function TaxComplianceDashboardClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ dashboard: TaxComplianceDashboard }>({
    queryKey: ['tax-compliance', companyId],
    queryFn: async () => {
      const res = await fetch('/api/tax/compliance-dashboard')
      if (!res.ok) throw new Error('Vergi uyum paneli yüklenemedi')
      return res.json()
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })

  if (isLoading) return <LoadingSkeleton />

  // Guard the NESTED field, not just `data`: a 200 response without `dashboard`
  // would otherwise crash on `dashboard.compliance_status` and bubble to the route
  // error boundary as a full-page "Bir hata oluştu".
  if (isError || !data?.dashboard?.compliance_status) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vergi Uyum Paneli</div>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-[#94a3b8]">Vergi uyum paneli yüklenemedi</p>
        </div>
      </div>
    )
  }

  const { dashboard } = data
  const badge = complianceBadge(dashboard.compliance_status)
  const next  = dashboard.next_due_obligation

  return (
    <div className="space-y-3">

      {/* ── Overdue critical banner ────────────────────────────────────────── */}
      {dashboard.overdue_count > 0 && (
        <div className="bg-neg-light border border-neg rounded px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 mt-1.5" />
          <div className="text-xs text-neg-text">
            <span className="font-black">
              {dashboard.overdue_count} yükümlülük gecikmiş
            </span>
            {' '}— lütfen danışmanınızla iletişime geçin.
          </div>
        </div>
      )}

      {/* ── Main dashboard card ───────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">

        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Vergi Uyum Paneli
            </div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">
              {dashboard.as_of_date} itibarıyla · KDV · Geçici Vergi · KV · SGK
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded border ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        {/* Score hero + next obligation + chips */}
        <div className="grid grid-cols-3 gap-0 border-b border-[#e2e8f0]">

          {/* Compliance score */}
          <div className="p-4 border-r border-[#e2e8f0] flex flex-col items-center justify-center">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1 text-center">
              Uyum Skoru
            </div>
            <div className={`text-5xl font-black tabular-nums leading-none ${scoreColor(dashboard.compliance_score)}`}>
              {dashboard.compliance_score}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1">/ 100</div>
          </div>

          {/* Next obligation */}
          <div className="p-4 border-r border-[#e2e8f0]">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
              Bir Sonraki Yükümlülük
            </div>
            {next ? (
              <>
                <div className="text-xs font-black text-[#1e293b] leading-tight">{next.period_label}</div>
                <div className={`text-[10px] mt-1 font-semibold ${next.days_until_due <= 7 ? 'text-warn-text' : 'text-[#64748b]'}`}>
                  {next.days_until_due === 0
                    ? 'Bugün'
                    : `${next.days_until_due} gün içinde`
                  } — {fmtDate(next.due_date)}
                </div>
                {next.amount_try !== null && (
                  <div className="text-sm font-black tabular-nums text-warn-text mt-1">
                    {fmtTRY(next.amount_try)}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-[#94a3b8]">Bekleyen yükümlülük yok</div>
            )}
          </div>

          {/* Summary chips */}
          <div className="p-4 space-y-2">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam Bekleyen</div>
              <div className="text-base font-black tabular-nums text-warn-text">
                {fmtTRY(dashboard.total_pending_try)}
              </div>
            </div>
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">YTD KDV Ödenen</div>
              <div className="text-sm font-black tabular-nums text-[#1e293b]">
                {fmtTRY(dashboard.kdv_ytd_paid_try)}
              </div>
            </div>
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">KV Karşılık</div>
              <div className="text-sm font-black tabular-nums text-[#1e293b]">
                {fmtTRY(dashboard.corporate_tax_provision_try)}
              </div>
            </div>
          </div>
        </div>

        {/* Obligations table */}
        {dashboard.obligations.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[#94a3b8]">Yükümlülük bulunamadı</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tür</th>
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem</th>
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Son Gün</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tutar</th>
                <th className="text-center px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
                <th className="text-center px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Süre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {dashboard.obligations.map(ob => {
                const isOverdue = ob.status === 'overdue'
                const dateTone  = isOverdue ? 'text-neg-text font-black' : ob.status === 'upcoming_7d' ? 'text-warn-text font-bold' : 'text-[#64748b]'
                return (
                  <tr
                    key={ob.obligation_id}
                    className={`hover:bg-[#f8fafc]/60 transition-colors ${rowBgCls(ob.status)}`}
                  >
                    <td className="px-4 py-2.5 font-bold text-[#1e293b]">
                      {obligationTypeLabel(ob.obligation_type)}
                    </td>
                    <td className="px-4 py-2.5 text-[#64748b]">{ob.period_label}</td>
                    <td className={`px-4 py-2.5 ${dateTone}`}>{fmtDate(ob.due_date)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#1e293b]">
                      {ob.amount_try !== null
                        ? fmtTRY(ob.amount_try)
                        : <span className="text-[#cbd5e1]">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusChipCls(ob.status)}`}>
                        {statusDisplayLabel(ob.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[9px] font-semibold ${isOverdue ? 'text-neg-text' : 'text-[#64748b]'}`}>
                        {statusLabel(ob)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
