// ── TaxTab — Vergi Merkezi ────────────────────────────────────────────────────
//
// Content from /dashboard/tax:
//   Zone 1 — KPI strip (4 cards)
//   Zone 1b — KDV Özeti + Kurumlar Vergisi Tahmini
//   Zone 2 — Aylık KDV Geçmişi (6-month table)
//   Zone 3 — Geçici Vergi Takvimi (Q1-Q3 + year-end)
//   Zone 3b — Beyan Takvimi (Turkish compliance calendar — 12 months)
//   Zone 4 — Matrah Analizi waterfall

import Link               from 'next/link'
import { FinanceService }   from '@/lib/services/finance.service'
import { periodForMonth }   from '@/lib/services/finance-rules'
import {
  getQuarterlyReport,
  geciciDueDate,
  type QuarterResult,
} from '@/lib/finance/financial-core'
import { TaxService, type KDVSummary, type CorporateTaxEstimate } from '@/lib/services/tax.service'
import { TaxCalendarService, type TaxCalendar } from '@/lib/services/tax/tax-calendar.service'
import { TaxReserveService, type TaxReserveReport, type TaxReserveItem } from '@/lib/services/tax/tax-reserve.service'
import { createClient } from '@/lib/supabase-server'
import { fmtTRY as fmt, fmtMonthShort as fmtMonth, fmtDateMed as fmtDate } from '@/lib/format'
import { TaxCalendarClient } from './_tax-calendar/TaxCalendarClient'
import { TaxComplianceDashboardClient } from './_tax/TaxComplianceDashboardClient'
import { TaxComplianceClient } from './_tax-compliance/TaxComplianceClient'
import { GecikmeHesaplayiciClient } from './_tax/GecikmeHesaplayiciClient'
import {
  computeKdvDeductionRate,
  classifyKdvPosition,
  computeKdvTrend,
  formatKdvPeriod,
} from '@/lib/services/tax.service'
import { lastNMonths, kdvPositionLabel, geciciStatus, nextGeciciDue } from './_tax/helpers'
import { BeyanTakvimi } from './_tax/BeyanTakvimi'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function TaxTab({ userId, companyId }: Props) {
  const now         = new Date()
  const today       = now.toISOString().slice(0, 10)
  const currentYear = now.getFullYear()
  const monthYMs    = lastNMonths(6, now)

  function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    return fn().catch(() => fallback)
  }

  const ZERO_REPORT = {
    year: currentYear,
    quarters: [] as QuarterResult[],
    ytd: { revenue: 0, gross_profit: 0, net_profit: 0, matrah: 0, corporate_tax: 0, net_after_tax: 0, total_gecici: 0 },
  }

  const supabase = createClient()

  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentPeriod = periodForMonth(currentYM)

  const [report, kdvSummary, corpTaxEstimate, taxCalendar, taxReserve, ...monthlySummaries] = await Promise.all([
    sq(() => getQuarterlyReport(userId, companyId, currentYear), ZERO_REPORT),
    sq(() => TaxService.computeKDVSummary(companyId, currentPeriod.from, currentPeriod.to, supabase), null as KDVSummary | null),
    sq(() => TaxService.estimateCorporateTax(companyId, today, supabase), null as CorporateTaxEstimate | null),
    sq(() => TaxCalendarService.getCalendar(companyId, userId, supabase, { today }), null as TaxCalendar | null),
    sq(() => TaxReserveService.buildReport(companyId, supabase, today), null as TaxReserveReport | null),
    ...monthYMs.map(ym =>
      sq(() => FinanceService.getFinancialSummary(userId, companyId, periodForMonth(ym)), null)
    ),
  ])

  const ytd     = report.ytd
  const quarters = report.quarters

  const kdvHistory = monthYMs.map((ym, i) => {
    const s = monthlySummaries[i]
    const salesVat    = Number(s?.sales_vat_try    ?? 0)
    const purchaseVat = Number(s?.purchase_vat_try ?? 0)
    const expenseVat  = Number(s?.expense_vat_try  ?? 0)
    const netVat      = salesVat - purchaseVat - expenseVat
    return { ym, salesVat, purchaseVat, expenseVat, netVat }
  })

  const currentKdv    = kdvHistory[kdvHistory.length - 1]
  const kdvPos        = kdvPositionLabel(currentKdv.netVat)
  const nextDue       = nextGeciciDue(quarters, today)

  // KDV Beyanı helpers
  const kdvDeductionRate = computeKdvDeductionRate(
    currentKdv.purchaseVat + currentKdv.expenseVat,
    currentKdv.salesVat,
  )
  const kdvPosition = classifyKdvPosition(currentKdv.netVat)
  const kdvTrend = computeKdvTrend(
    kdvHistory.map(h => ({ output: h.salesVat, input: h.purchaseVat + h.expenseVat })),
  )
  const kdvPeriodMonth = now.getMonth() + 1 // 1-based
  const kdvPeriodLabel = formatKdvPeriod(now.getFullYear(), kdvPeriodMonth)
  // KDV filing due date: 26th of following month
  const kdvFilingDueMonth = kdvPeriodMonth === 12 ? 1 : kdvPeriodMonth + 1
  const kdvFilingDueYear  = kdvPeriodMonth === 12 ? now.getFullYear() + 1 : now.getFullYear()
  const trMonths = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
  const kdvFilingDueLong = `26 ${trMonths[kdvFilingDueMonth - 1]} ${kdvFilingDueYear}`
  const kdvTrendLabel = kdvTrend === 'increasing' ? '↑ Artıyor' : kdvTrend === 'decreasing' ? '↓ Azalıyor' : '→ Stabil'
  const kdvTrendCls   = kdvTrend === 'increasing' ? 'text-neg-text bg-neg-light border-neg-light' : kdvTrend === 'decreasing' ? 'text-pos-text bg-pos-light border-pos-light' : 'text-[#64748b] bg-[#f1f5f9] border-[#e2e8f0]'
  const kvRemaining   = Math.max(0, ytd.corporate_tax - ytd.total_gecici)
  const monthsElapsed = now.getMonth() + 1
  const projectedMatrah = monthsElapsed > 0 ? (ytd.matrah / monthsElapsed) * 12 : 0

  // Urgency check for all quarters (overdue or urgent)
  const overdueQuarters = quarters.filter(q =>
    q.gecici_due_date && q.gecici_vergi > 0 && geciciStatus(q.gecici_due_date, today) === 'overdue'
  )
  const urgentQuarters = quarters.filter(q =>
    q.gecici_due_date && q.gecici_vergi > 0 && geciciStatus(q.gecici_due_date, today) === 'urgent'
  )

  // ── Vergi Rezervi helpers ────────────────────────────────────────────────────
  const reserveCoverageBadge = (status: TaxReserveReport['coverage_status']) => {
    switch (status) {
      case 'adequate':     return { text: 'Yeterli (%120+)',   cls: 'bg-pos-light text-pos-text border-pos-light' }
      case 'tight':        return { text: 'Sınırda (%80–120)', cls: 'bg-warn-light text-warn-text border-warn-light' }
      case 'insufficient': return { text: 'Yetersiz (<%80)',   cls: 'bg-neg-light text-neg-text border-neg-light' }
      default:             return { text: 'Bilinmiyor',        cls: 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]' }
    }
  }

  const reserveItemStatusCls = (status: TaxReserveItem['status']) => {
    switch (status) {
      case 'overdue':  return 'bg-neg-light text-neg-text border-neg-light'
      case 'due_soon': return 'bg-warn-light text-warn-text border-warn-light'
      case 'upcoming': return 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
      default:         return 'bg-pos-light text-pos-text border-pos-light'
    }
  }

  const reserveItemStatusText = (item: TaxReserveItem) => {
    switch (item.status) {
      case 'overdue':  return `${Math.abs(item.days_until_due)} gün gecikti`
      case 'due_soon': return `${item.days_until_due} gün kaldı`
      case 'upcoming': return `${item.days_until_due} gün`
      default:         return 'Ödendi'
    }
  }

  return (
    <div className="space-y-4">

      {/* Client islands are each isolated in an ErrorBoundary so a single island's
          render error degrades to a local fallback instead of blanking the whole tab. */}
      {/* ── Vergi Uyum Takvimi (client island — TanStack Query) ─────────────── */}
      <ErrorBoundary label="tax-compliance"><TaxComplianceClient companyId={companyId} /></ErrorBoundary>

      {/* ── Vergi Uyum Paneli (client island — TanStack Query) ───────────────── */}
      <ErrorBoundary label="tax-compliance-dashboard"><TaxComplianceDashboardClient companyId={companyId} /></ErrorBoundary>

      {/* ── Vergi Takvimi (client island — TanStack Query) ───────────────────── */}
      <ErrorBoundary label="tax-calendar"><TaxCalendarClient companyId={companyId} /></ErrorBoundary>

      {/* ── Vergi Rezervi ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vergi Rezervi</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">Yaklaşan vergi yükümlülükleri için nakit rezerv takibi</p>
          </div>
          {taxReserve && (
            <div className="flex items-center gap-2 shrink-0">
              {(() => {
                const badge = reserveCoverageBadge(taxReserve.coverage_status)
                return (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.cls}`}>
                    {badge.text}
                  </span>
                )
              })()}
            </div>
          )}
        </div>

        {!taxReserve ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[#94a3b8]">Vergi rezervi hesaplanamadı</p>
          </div>
        ) : (
          <>
            {/* Coverage summary strip */}
            <div className="grid grid-cols-4 gap-0 border-b border-[#e2e8f0]">
              {[
                {
                  label: 'Toplam Rezerv',
                  value: fmt(taxReserve.total_reserved_try),
                  color: 'text-warn-text',
                },
                {
                  label: 'Mevcut Nakit',
                  value: taxReserve.cash_available_try !== null ? fmt(taxReserve.cash_available_try) : '—',
                  color: taxReserve.cash_available_try !== null ? 'text-pos-text' : 'text-[#94a3b8]',
                },
                {
                  label: 'Karşılama Oranı',
                  value: taxReserve.reserve_coverage_pct !== null
                    ? `%${taxReserve.reserve_coverage_pct.toFixed(0)}`
                    : '—',
                  color: taxReserve.coverage_status === 'adequate'
                    ? 'text-pos-text'
                    : taxReserve.coverage_status === 'tight'
                    ? 'text-warn-text'
                    : taxReserve.coverage_status === 'insufficient'
                    ? 'text-neg'
                    : 'text-[#94a3b8]',
                },
                {
                  label: 'Vadesi Geçmiş',
                  value: taxReserve.total_overdue_try > 0 ? fmt(taxReserve.total_overdue_try) : '—',
                  color: taxReserve.total_overdue_try > 0 ? 'text-neg' : 'text-[#94a3b8]',
                },
              ].map((card, i) => (
                <div key={card.label}
                  className={`p-3 ${i < 3 ? 'border-r border-[#e2e8f0]' : ''}`}>
                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
                  <div className={`text-base font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
                </div>
              ))}
            </div>

            {/* Insufficient coverage warning */}
            {taxReserve.coverage_status === 'insufficient' && taxReserve.cash_available_try !== null && (
              <div className="mx-4 my-3 bg-neg-light border border-neg rounded px-3 py-2 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 mt-1" />
                <div className="text-xs text-neg-text">
                  <span className="font-black">Nakit rezervi yetersiz.</span>{' '}
                  Mevcut nakit (<strong>{fmt(taxReserve.cash_available_try)}</strong>), vergi yükümlülüklerinin
                  {' '}<strong>%{taxReserve.reserve_coverage_pct?.toFixed(0) ?? '?'}</strong>&apos;ini karşılıyor.
                  Hedef: toplam rezervin en az %120&apos;si ({fmt(taxReserve.total_reserved_try * 1.2)}).
                </div>
              </div>
            )}

            {/* Items table */}
            {taxReserve.items.filter(i => i.status !== 'paid').length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                    <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vergi Türü</th>
                    <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem</th>
                    <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Son Gün</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tahmini</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Rezerv</th>
                    <th className="text-center px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {taxReserve.items
                    .filter(item => item.status !== 'paid')
                    .map(item => {
                      const statusCls  = reserveItemStatusCls(item.status)
                      const statusText = reserveItemStatusText(item)
                      const rowBg = item.status === 'overdue'
                        ? 'bg-neg-light/20'
                        : item.status === 'due_soon'
                        ? 'bg-warn-light/10'
                        : ''
                      return (
                        <tr key={`${item.tax_type}-${item.due_date}`}
                          className={`hover:bg-[#f8fafc]/60 transition-colors ${rowBg}`}>
                          <td className="px-4 py-2.5 font-bold text-[#1e293b]">{item.label}</td>
                          <td className="px-4 py-2.5 text-[#64748b]">{item.period_label}</td>
                          <td className={`px-4 py-2.5 font-semibold ${
                            item.status === 'overdue' ? 'text-neg-text' :
                            item.status === 'due_soon' ? 'text-warn-text' :
                            'text-[#1e293b]'
                          }`}>
                            {fmtDate(item.due_date)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#1e293b]">
                            {item.estimated_amount_try > 0 ? fmt(item.estimated_amount_try) : <span className="text-[#cbd5e1]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-warn-text">
                            {item.reserved_amount_try > 0 ? fmt(item.reserved_amount_try) : <span className="text-[#cbd5e1]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusCls}`}>
                              {statusText}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-[#94a3b8]">Yaklaşan vergi yükümlülüğü bulunamadı</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Tax urgency banner ────────────────────────────────────────────────── */}
      {overdueQuarters.length > 0 && (
        <div className="bg-neg-light border border-neg rounded px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 mt-1" />
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-neg-text">
              Vadesi Geçmiş Geçici Vergi
            </div>
            <div className="text-xs text-neg-text mt-0.5">
              {overdueQuarters.map(q => (
                <span key={q.label} className="mr-3">
                  {q.label}: <strong>{fmt(q.gecici_vergi)}</strong> — {fmtDate(q.gecici_due_date)} vadesi geçti
                </span>
              ))}
            </div>
          </div>
          <Link href="/dashboard/cfo/tax/corporate" className="text-[10px] font-bold text-neg-text hover:text-neg-text underline underline-offset-2 shrink-0 mt-0.5">
            KV Detayı →
          </Link>
        </div>
      )}

      {overdueQuarters.length === 0 && urgentQuarters.length > 0 && (
        <div className="bg-warn-light border border-warn rounded px-4 py-3 flex items-start gap-3">
          <span className="text-base">⚠</span>
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-warn-text">
              Yaklaşan Geçici Vergi Ödemesi — 14 Gün İçinde
            </div>
            <div className="text-xs text-warn-text mt-0.5">
              {urgentQuarters.map(q => (
                <span key={q.label} className="mr-3">
                  {q.label}: <strong>{fmt(q.gecici_vergi)}</strong> — son ödeme {fmtDate(q.gecici_due_date)}
                </span>
              ))}
            </div>
          </div>
          <Link href="/dashboard/cfo/tax/corporate" className="text-[10px] font-bold text-warn-text hover:text-warn-text underline underline-offset-2 shrink-0 mt-0.5">
            KV Detayı →
          </Link>
        </div>
      )}

      {/* ── KDV Beyanı ───────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">VERGİ MERKEZİ</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">KDV Beyanı — {kdvPeriodLabel}</p>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded border bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]">
            {kdvPeriodLabel} ▾
          </span>
        </div>

        {/* KDV declaration breakdown */}
        <div className="px-4 py-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#64748b]">Hesaplanan KDV (Çıktı)</span>
            <span className="tabular-nums text-sm font-black text-warn-text">{fmt(currentKdv.salesVat)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#64748b]">İndirilecek KDV (Girdi)</span>
            <span className="tabular-nums text-sm font-semibold text-pos-text">
              −{fmt(currentKdv.purchaseVat + currentKdv.expenseVat)}
            </span>
          </div>
          <div className="border-t border-[#e2e8f0] pt-2 flex items-center justify-between">
            <span className="text-xs font-black text-[#1e293b]">
              {kdvPosition === 'payable' ? 'Ödenecek KDV' : kdvPosition === 'credit' ? 'Devreden KDV' : 'Net KDV'}
            </span>
            <div className="flex items-center gap-2">
              <span className={`tabular-nums text-base font-black ${
                kdvPosition === 'payable' ? 'text-warn-text' : kdvPosition === 'credit' ? 'text-pos-text' : 'text-[#94a3b8]'
              }`}>
                {fmt(Math.abs(currentKdv.netVat))}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                kdvPosition === 'payable'
                  ? 'bg-warn-light text-warn-text border-warn/20'
                  : kdvPosition === 'credit'
                  ? 'bg-pos-light text-pos-text border-pos-light'
                  : 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
              }`}>
                {kdvPosition === 'payable' ? 'ÖDENECEK' : kdvPosition === 'credit' ? 'DEVREDİLECEK' : 'SIFIR'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[10px] text-[#94a3b8]">
              İndirim Oranı: <span className="font-semibold text-[#64748b]">%{kdvDeductionRate.toFixed(1)}</span>
            </span>
            <span className="text-[10px] text-[#94a3b8]">
              Teslim tarihi: <span className="font-semibold text-[#64748b]">{kdvFilingDueLong}</span>
            </span>
          </div>
        </div>

        {/* KDV Trend mini chart (bar representation) */}
        <div className="border-t border-[#e2e8f0] px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">KDV Trend (Son 4 Ay)</div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${kdvTrendCls}`}>
              {kdvTrendLabel}
            </span>
          </div>
          <div className="flex items-end gap-2 h-12">
            {kdvHistory.slice(-4).map((row, i) => {
              const maxNet = Math.max(...kdvHistory.slice(-4).map(r => Math.abs(r.netVat)), 1)
              const barH   = Math.round((Math.abs(row.netVat) / maxNet) * 100)
              const isLast = i === Math.min(3, kdvHistory.slice(-4).length - 1)
              return (
                <div key={row.ym} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[8px] text-[#94a3b8] tabular-nums">
                    {row.netVat > 0 ? fmt(row.netVat).replace('₺', '') : '—'}
                  </div>
                  <div
                    className={`w-full rounded-sm transition-all ${
                      isLast
                        ? (row.netVat > 0 ? 'bg-warn' : 'bg-pos')
                        : 'bg-[#e2e8f0]'
                    }`}
                    style={{ height: `${Math.max(barH, 4)}%`, minHeight: '4px' }}
                  />
                  <div className="text-[8px] text-[#94a3b8]">{fmtMonth(row.ym)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Gecikme Faizi Hesaplayıcı ────────────────────────────────────────── */}
      <GecikmeHesaplayiciClient />

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
        {[
          {
            label: 'Net KDV (Bu Ay)',
            value: currentKdv.netVat !== 0 ? fmt(Math.abs(currentKdv.netVat)) : '₺0',
            sub:   kdvPos.label,
            color: currentKdv.netVat > 0 ? 'text-warn-text' : currentKdv.netVat < 0 ? 'text-pos-text' : 'text-[#94a3b8]',
          },
          {
            label: 'YTD Kurumlar Vergisi',
            value: ytd.corporate_tax > 0 ? fmt(ytd.corporate_tax) : '—',
            sub:   `Matrah: ${fmt(ytd.matrah)}`,
            color: ytd.corporate_tax > 0 ? 'text-warn-text' : 'text-[#94a3b8]',
          },
          {
            label: 'Ödenen Geçici Vergi',
            value: ytd.total_gecici > 0 ? fmt(ytd.total_gecici) : '—',
            sub:   kvRemaining > 0 ? `Kalan: ${fmt(kvRemaining)}` : 'Tamamı ödendi',
            color: ytd.total_gecici > 0 ? 'text-info-text' : 'text-[#94a3b8]',
          },
          {
            label: 'Sonraki Ödeme',
            value: nextDue ? fmtDate(nextDue.date) : '—',
            sub:   nextDue ? `${nextDue.label} · ${fmt(nextDue.amount)}` : 'Bekleyen ödeme yok',
            color: nextDue
              ? (geciciStatus(nextDue.date, today) === 'urgent' ? 'text-neg' : 'text-warn-text')
              : 'text-[#94a3b8]',
          },
        ].map((card, i) => (
          <div key={card.label}
            className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Zone 1b: KDV Özet Kartı ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* KDV Summary */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">KDV Özeti — {kdvSummary?.period_label ?? currentYM}</div>
            <Link href="/dashboard/cfo/tax/kdv" className="text-[10px] font-bold text-brand-light hover:text-brand underline-offset-2">
              Detaylı Analiz →
            </Link>
          </div>
          <div className="px-4 py-3 space-y-2">
            {kdvSummary ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#64748b]">Hesaplanan KDV (çıkış)</span>
                  <span className="tabular-nums text-sm font-black text-warn">{fmt(kdvSummary.output_vat_try)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#64748b]">İndirilecek KDV (giriş)</span>
                  <span className="tabular-nums text-sm font-semibold text-pos-text">−{fmt(kdvSummary.input_vat_try)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#e2e8f0] pt-2">
                  <span className="text-xs font-black text-[#1e293b]">Net KDV</span>
                  <span className={`tabular-nums text-sm font-black ${kdvSummary.vat_payable ? 'text-warn-text' : 'text-pos-text'}`}>
                    {fmt(Math.abs(kdvSummary.net_vat_try))}
                    <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      kdvSummary.vat_payable
                        ? 'bg-warn-light text-warn-text border-warn/20'
                        : 'bg-pos-light text-pos-text border-pos-light'
                    }`}>
                      {kdvSummary.vat_payable ? 'Ödenecek' : 'Devir'}
                    </span>
                  </span>
                </div>
                <div className="text-[10px] text-[#94a3b8] pt-0.5">
                  Beyan tarihi:{' '}
                  <span className="font-semibold text-[#64748b]">
                    {kdvSummary.filing_due_date}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#94a3b8] py-2">KDV verisi yüklenemedi</p>
            )}
          </div>
        </div>

        {/* Corporate Tax Estimate */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kurumlar Vergisi Tahmini — YTD {currentYear}</div>
            <Link href="/dashboard/cfo/tax/corporate" className="text-[10px] font-bold text-brand-light hover:text-brand underline-offset-2">
              Detaylı Analiz →
            </Link>
          </div>
          <div className="px-4 py-3 space-y-2">
            {corpTaxEstimate ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#64748b]">YTD Ciro</span>
                  <span className="tabular-nums text-sm font-semibold text-[#0f172a]">{fmt(corpTaxEstimate.ytd_revenue_try)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#64748b]">Tahmini KV (%25)</span>
                  <span className="tabular-nums text-sm font-black text-warn-text">{fmt(corpTaxEstimate.estimated_tax_try)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#e2e8f0] pt-2">
                  <span className="text-xs font-black text-[#1e293b]">Kalan Vergi</span>
                  <span className={`tabular-nums text-sm font-black ${corpTaxEstimate.remaining_tax_try > 0 ? 'text-warn-text' : 'text-pos-text'}`}>
                    {fmt(Math.abs(corpTaxEstimate.remaining_tax_try))}
                    {corpTaxEstimate.remaining_tax_try < 0 && (
                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-pos-light text-pos-text border-pos-light">Fazla ödendi</span>
                    )}
                  </span>
                </div>
                <div className="text-[10px] text-[#94a3b8] pt-0.5">
                  Sonraki avans:{' '}
                  <span className="font-semibold text-[#64748b]">{corpTaxEstimate.next_advance_due}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#94a3b8] py-2">Kurumlar vergisi verisi yüklenemedi</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Zone 2: Aylık KDV Geçmişi ───────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Aylık KDV Geçmişi</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Son 6 ay · Satış KDV − İndirim = Net KDV</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Satış KDV</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-neg">İndirilecek</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Net KDV</th>
              <th className="text-center px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {[...kdvHistory].reverse().map(row => {
              const indirim = row.purchaseVat + row.expenseVat
              const pos     = kdvPositionLabel(row.netVat)
              const isCurrent = row.ym === today.slice(0, 7)
              return (
                <tr key={row.ym} className={`hover:bg-[#f8fafc]/60 transition-colors ${isCurrent ? 'bg-brand-subtle/30' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-[#1e293b]">
                    {fmtMonth(row.ym)}
                    {isCurrent && <span className="ml-2 text-[9px] bg-brand-subtle text-brand font-bold px-1.5 py-0.5 rounded">Bu ay</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-pos-text tabular-nums">
                    {row.salesVat > 0 ? fmt(row.salesVat) : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-neg tabular-nums">
                    {indirim > 0 ? fmt(indirim) : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${pos.color}`}>
                    {row.netVat !== 0 ? fmt(Math.abs(row.netVat)) : '₺0'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.salesVat === 0 && row.purchaseVat === 0 && row.expenseVat === 0 ? (
                      <span className="text-[10px] text-[#cbd5e1]">Veri yok</span>
                    ) : (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${pos.bg} ${pos.color}`}>
                        {pos.label}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Zone 3: Geçici Vergi Takvimi ─────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Geçici Vergi Takvimi {currentYear}</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">Kurumlar vergisi matrahı üzerinden %25 · Q1 Mayıs · Q2 Ağustos · Q3 Kasım</p>
          </div>
          {ytd.total_gecici > 0 && (
            <span className="text-xs font-bold text-warn-text bg-warn-light border border-warn-light px-2.5 py-1 rounded">
              {fmt(ytd.total_gecici)} ödendi
            </span>
          )}
        </div>
        <div className="divide-y divide-[#f1f5f9]">
          {([1, 2, 3] as const).map(q => {
            const qData   = quarters[q - 1]
            const dueDate = geciciDueDate(currentYear, q)
            const amount  = qData?.gecici_vergi ?? 0
            const matrah  = qData?.matrah       ?? 0
            const status  = geciciStatus(dueDate, today)
            const hasData = matrah > 0
            const statusBadge = {
              overdue:  { text: 'Vadesi Geçti',  cls: 'bg-neg-light text-neg-text border-neg-light' },
              urgent:   { text: '14 gün içinde', cls: 'bg-neg-light text-neg-text border-neg-light' },
              upcoming: { text: '45 gün içinde', cls: 'bg-warn-light text-warn-text border-warn-light' },
              future:   { text: 'Bekliyor',      cls: 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]' },
              none:     { text: '',              cls: '' },
            }[status]
            return (
              <div key={q} className={`px-4 py-3 flex items-center justify-between gap-4 ${
                status === 'urgent' || status === 'overdue' ? 'bg-neg-light/30' :
                status === 'upcoming' ? 'bg-warn-light/20' : ''
              }`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-[#1e293b]">Q{q} Geçici Vergi</span>
                    {statusBadge.text && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusBadge.cls}`}>
                        {statusBadge.text}
                      </span>
                    )}
                    {!hasData && (
                      <span className="text-[9px] text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0.5 rounded">Veri bekleniyor</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#94a3b8] mt-0.5">
                    Son ödeme: {fmtDate(dueDate)}
                    {matrah > 0 && ` · Matrah: ${fmt(matrah)}`}
                  </div>
                </div>
                <div className={`text-base font-black tabular-nums shrink-0 ${
                  !hasData ? 'text-[#cbd5e1]' :
                  status === 'overdue' || status === 'urgent' ? 'text-neg' : 'text-warn-text'
                }`}>
                  {hasData ? fmt(amount) : '—'}
                </div>
              </div>
            )
          })}
          <div className="px-4 py-3 flex items-center justify-between gap-4 bg-[#f8fafc]">
            <div>
              <div className="text-xs font-black text-[#334155]">Yıl Sonu Kurumlar Vergisi</div>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">Nisan {currentYear + 1} · Matrah × %25 − Ödenen Geçici</div>
            </div>
            <div className={`text-base font-black tabular-nums ${kvRemaining > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>
              {kvRemaining > 0 ? fmt(kvRemaining) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Zone 3b: Beyan Takvimi ──────────────────────────────────────────── */}
      <BeyanTakvimi taxCalendar={taxCalendar} />

      {/* ── Zone 4: Matrah Analizi ───────────────────────────────────────────── */}
      {ytd.revenue > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0]">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Matrah Analizi — YTD {currentYear}</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">
              Ciro → Brüt Kâr → Matrah → KV hesabı · {monthsElapsed} ay geçti
            </p>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {[
              { label: 'Ciro (YTD)',              value: ytd.revenue,                     tone: 'text-[#0f172a]', indent: false },
              { label: '− Satılan Mal Maliyeti',  value: ytd.revenue - ytd.gross_profit,  tone: 'text-neg',  indent: true  },
              { label: '= Brüt Kâr',              value: ytd.gross_profit,                tone: ytd.gross_profit >= 0 ? 'text-pos-text' : 'text-neg', indent: false },
              { label: '− Giderler',              value: ytd.gross_profit - ytd.net_profit, tone: 'text-neg', indent: true },
              { label: '= Vergi Matrahı',         value: ytd.matrah,                      tone: ytd.matrah >= 0 ? 'text-warn-text' : 'text-neg', indent: false },
              { label: '× %25 Kurumlar Vergisi',  value: ytd.corporate_tax,               tone: 'text-warn', indent: true },
              { label: '= Vergi Sonrası Net',     value: ytd.net_after_tax,               tone: ytd.net_after_tax >= 0 ? 'text-pos-text' : 'text-neg-text', indent: false },
            ].map((row, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                <div className={`text-xs ${row.indent ? 'pl-4 text-[#94a3b8]' : 'font-bold text-[#1e293b]'}`}>{row.label}</div>
                <div className={`text-sm font-black tabular-nums font-mono ${row.tone}`}>{fmt(row.value)}</div>
              </div>
            ))}
            {monthsElapsed < 12 && projectedMatrah > 0 && (
              <div className="px-4 py-2.5 flex items-center justify-between bg-info-light/30">
                <div className="text-xs text-info-text font-semibold">Yıl Sonu Matrah Tahmini ({monthsElapsed} ay → 12 ay)</div>
                <div className="text-sm font-black tabular-nums font-mono text-info-text">~{fmt(projectedMatrah)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cross-links → detailed CFO tax pages */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/cfo/tax/kdv"
          className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 hover:border-warn/20 transition-colors shadow-sm"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">KDV Detayı</div>
          <div className="text-xs font-bold text-[#0f172a]">KDV Özeti →</div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">Hesaplanan − İndirilecek = Net KDV · Beyanname hazırlığı</div>
        </Link>
        <Link
          href="/dashboard/cfo/tax/corporate"
          className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 hover:border-warn-light transition-colors shadow-sm"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Kurumlar Vergisi</div>
          <div className="text-xs font-bold text-[#0f172a]">KV Raporu →</div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">Geçici vergi takvimi · YTD kurumlar vergisi tahmini</div>
        </Link>
      </div>
    </div>
  )
}
