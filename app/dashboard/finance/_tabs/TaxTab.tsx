// ── TaxTab — Vergi Merkezi ────────────────────────────────────────────────────
//
// Content from /dashboard/tax:
//   Zone 1 — KPI strip (4 cards)
//   Zone 2 — Aylık KDV Geçmişi (6-month table)
//   Zone 3 — Geçici Vergi Takvimi (Q1-Q3 + year-end)
//   Zone 4 — Matrah Analizi waterfall

import Link               from 'next/link'
import { FinanceService }   from '@/lib/services/finance.service'
import { periodForMonth }   from '@/lib/services/finance-rules'
import {
  getQuarterlyReport,
  geciciDueDate,
  type QuarterResult,
} from '@/lib/finance/financial-core'
import { fmtTRY as fmt } from '@/lib/format'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names  = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[m - 1] ?? ym} ${String(y).slice(2)}`
}
function fmtDate(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${day} ${months[Number(m) - 1]} ${y}`
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function lastNMonths(n: number, ref: Date): string[] {
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref); d.setDate(1); d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function kdvPositionLabel(netVat: number): { label: string; color: string; bg: string } {
  if (netVat > 0) return { label: '⬆ Ödenecek',  color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' }
  if (netVat < 0) return { label: '⬇ Devredilen', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' }
  return { label: 'Sıfır', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' }
}

function geciciStatus(dueDate: string, today: string): 'overdue' | 'urgent' | 'upcoming' | 'future' | 'none' {
  if (!dueDate) return 'none'
  if (dueDate < today)              return 'overdue'
  if (dueDate <= addDays(today, 14)) return 'urgent'
  if (dueDate <= addDays(today, 45)) return 'upcoming'
  return 'future'
}

function nextGeciciDue(quarters: QuarterResult[], today: string): { label: string; date: string; amount: number } | null {
  const upcoming = quarters
    .filter(q => q.gecici_due_date && q.gecici_due_date >= today && q.gecici_vergi > 0)
    .sort((a, b) => a.gecici_due_date.localeCompare(b.gecici_due_date))
  if (!upcoming.length) return null
  const q = upcoming[0]
  return { label: q.label, date: q.gecici_due_date, amount: q.gecici_vergi }
}

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

  const [report, ...monthlySummaries] = await Promise.all([
    sq(() => getQuarterlyReport(userId, companyId, currentYear), ZERO_REPORT),
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

  return (
    <div className="space-y-6">

      {/* ── Tax urgency banner ────────────────────────────────────────────────── */}
      {overdueQuarters.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-base animate-pulse">🔴</span>
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-red-800">
              Vadesi Geçmiş Geçici Vergi
            </div>
            <div className="text-xs text-red-700 mt-0.5">
              {overdueQuarters.map(q => (
                <span key={q.label} className="mr-3">
                  {q.label}: <strong>{fmt(q.gecici_vergi)}</strong> — {fmtDate(q.gecici_due_date)} vadesi geçti
                </span>
              ))}
            </div>
          </div>
          <a href="/dashboard/cfo/tax/corporate" className="text-[10px] font-bold text-red-700 hover:text-red-800 underline underline-offset-2 shrink-0 mt-0.5">
            KV Detayı →
          </a>
        </div>
      )}

      {overdueQuarters.length === 0 && urgentQuarters.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-base">⚠</span>
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-amber-800">
              Yaklaşan Geçici Vergi Ödemesi — 14 Gün İçinde
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              {urgentQuarters.map(q => (
                <span key={q.label} className="mr-3">
                  {q.label}: <strong>{fmt(q.gecici_vergi)}</strong> — son ödeme {fmtDate(q.gecici_due_date)}
                </span>
              ))}
            </div>
          </div>
          <a href="/dashboard/cfo/tax/corporate" className="text-[10px] font-bold text-amber-700 hover:text-amber-800 underline underline-offset-2 shrink-0 mt-0.5">
            KV Detayı →
          </a>
        </div>
      )}

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-0 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        {[
          {
            label: 'Net KDV (Bu Ay)',
            value: currentKdv.netVat !== 0 ? fmt(Math.abs(currentKdv.netVat)) : '₺0',
            sub:   kdvPos.label,
            color: currentKdv.netVat > 0 ? 'text-orange-700' : currentKdv.netVat < 0 ? 'text-emerald-700' : 'text-gray-400',
          },
          {
            label: 'YTD Kurumlar Vergisi',
            value: ytd.corporate_tax > 0 ? fmt(ytd.corporate_tax) : '—',
            sub:   `Matrah: ${fmt(ytd.matrah)}`,
            color: ytd.corporate_tax > 0 ? 'text-amber-700' : 'text-gray-400',
          },
          {
            label: 'Ödenen Geçici Vergi',
            value: ytd.total_gecici > 0 ? fmt(ytd.total_gecici) : '—',
            sub:   kvRemaining > 0 ? `Kalan: ${fmt(kvRemaining)}` : 'Tamamı ödendi',
            color: ytd.total_gecici > 0 ? 'text-blue-700' : 'text-gray-400',
          },
          {
            label: 'Sonraki Ödeme',
            value: nextDue ? fmtDate(nextDue.date) : '—',
            sub:   nextDue ? `${nextDue.label} · ${fmt(nextDue.amount)}` : 'Bekleyen ödeme yok',
            color: nextDue
              ? (geciciStatus(nextDue.date, today) === 'urgent' ? 'text-red-600' : 'text-amber-700')
              : 'text-gray-400',
          },
        ].map((card, i) => (
          <div key={card.label}
            className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Zone 2: Aylık KDV Geçmişi ───────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-black text-gray-800">Aylık KDV Geçmişi</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">Son 6 ay · Satış KDV − İndirim = Net KDV</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Dönem</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">Satış KDV</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-400">İndirilecek</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Net KDV</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...kdvHistory].reverse().map(row => {
              const indirim = row.purchaseVat + row.expenseVat
              const pos     = kdvPositionLabel(row.netVat)
              const isCurrent = row.ym === today.slice(0, 7)
              return (
                <tr key={row.ym} className={`hover:bg-gray-50/60 transition-colors ${isCurrent ? 'bg-primary-50/30' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {fmtMonth(row.ym)}
                    {isCurrent && <span className="ml-2 text-[9px] bg-primary-100 text-primary-700 font-bold px-1.5 py-0.5 rounded-full">Bu ay</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                    {row.salesVat > 0 ? fmt(row.salesVat) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-red-600 tabular-nums">
                    {indirim > 0 ? fmt(indirim) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${pos.color}`}>
                    {row.netVat !== 0 ? fmt(Math.abs(row.netVat)) : '₺0'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.salesVat === 0 && row.purchaseVat === 0 && row.expenseVat === 0 ? (
                      <span className="text-[10px] text-gray-300">Veri yok</span>
                    ) : (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pos.bg} ${pos.color}`}>
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
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-gray-800">Geçici Vergi Takvimi {currentYear}</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Kurumlar vergisi matrahı üzerinden %25 · Q1 Mayıs · Q2 Ağustos · Q3 Kasım</p>
          </div>
          {ytd.total_gecici > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              {fmt(ytd.total_gecici)} ödendi
            </span>
          )}
        </div>
        <div className="divide-y divide-gray-50">
          {([1, 2, 3] as const).map(q => {
            const qData   = quarters[q - 1]
            const dueDate = geciciDueDate(currentYear, q)
            const amount  = qData?.gecici_vergi ?? 0
            const matrah  = qData?.matrah       ?? 0
            const status  = geciciStatus(dueDate, today)
            const hasData = matrah > 0
            const statusBadge = {
              overdue:  { text: 'Vadesi Geçti',  cls: 'bg-red-100 text-red-700 border-red-200' },
              urgent:   { text: '14 gün içinde', cls: 'bg-red-100 text-red-700 border-red-200' },
              upcoming: { text: '45 gün içinde', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
              future:   { text: 'Bekliyor',      cls: 'bg-gray-100 text-gray-500 border-gray-200' },
              none:     { text: '',              cls: '' },
            }[status]
            return (
              <div key={q} className={`px-4 py-3 flex items-center justify-between gap-4 ${
                status === 'urgent' || status === 'overdue' ? 'bg-red-50/30' :
                status === 'upcoming' ? 'bg-amber-50/20' : ''
              }`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-gray-800">Q{q} Geçici Vergi</span>
                    {statusBadge.text && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusBadge.cls}`}>
                        {statusBadge.text}
                      </span>
                    )}
                    {!hasData && (
                      <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Veri bekleniyor</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Son ödeme: {fmtDate(dueDate)}
                    {matrah > 0 && ` · Matrah: ${fmt(matrah)}`}
                  </div>
                </div>
                <div className={`text-base font-black tabular-nums shrink-0 ${
                  !hasData ? 'text-gray-300' :
                  status === 'overdue' || status === 'urgent' ? 'text-red-600' : 'text-amber-600'
                }`}>
                  {hasData ? fmt(amount) : '—'}
                </div>
              </div>
            )
          })}
          <div className="px-4 py-3 flex items-center justify-between gap-4 bg-gray-50">
            <div>
              <div className="text-xs font-black text-gray-700">Yıl Sonu Kurumlar Vergisi</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Nisan {currentYear + 1} · Matrah × %25 − Ödenen Geçici</div>
            </div>
            <div className={`text-base font-black tabular-nums ${kvRemaining > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
              {kvRemaining > 0 ? fmt(kvRemaining) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Zone 4: Matrah Analizi ───────────────────────────────────────────── */}
      {ytd.revenue > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-800">Matrah Analizi — YTD {currentYear}</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Ciro → Brüt Kâr → Matrah → KV hesabı · {monthsElapsed} ay geçti
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { label: 'Ciro (YTD)',              value: ytd.revenue,                     tone: 'text-gray-900', indent: false },
              { label: '− Satılan Mal Maliyeti',  value: ytd.revenue - ytd.gross_profit,  tone: 'text-red-600',  indent: true  },
              { label: '= Brüt Kâr',              value: ytd.gross_profit,                tone: ytd.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600', indent: false },
              { label: '− Giderler',              value: ytd.gross_profit - ytd.net_profit, tone: 'text-red-600', indent: true },
              { label: '= Vergi Matrahı',         value: ytd.matrah,                      tone: ytd.matrah >= 0 ? 'text-amber-700' : 'text-red-600', indent: false },
              { label: '× %25 Kurumlar Vergisi',  value: ytd.corporate_tax,               tone: 'text-orange-600', indent: true },
              { label: '= Vergi Sonrası Net',     value: ytd.net_after_tax,               tone: ytd.net_after_tax >= 0 ? 'text-emerald-700' : 'text-red-700', indent: false },
            ].map((row, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                <div className={`text-xs ${row.indent ? 'pl-4 text-gray-400' : 'font-bold text-gray-800'}`}>{row.label}</div>
                <div className={`text-sm font-black tabular-nums font-mono ${row.tone}`}>{fmt(row.value)}</div>
              </div>
            ))}
            {monthsElapsed < 12 && projectedMatrah > 0 && (
              <div className="px-4 py-2.5 flex items-center justify-between bg-blue-50/30">
                <div className="text-xs text-blue-700 font-semibold">Yıl Sonu Matrah Tahmini ({monthsElapsed} ay → 12 ay)</div>
                <div className="text-sm font-black tabular-nums font-mono text-blue-700">~{fmt(projectedMatrah)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cross-links → detailed CFO tax pages */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/cfo/tax/kdv"
          className="bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-orange-200 transition-colors shadow-[0_1px_2px_rgba(17,24,39,0.04)]"
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">KDV Detayı</div>
          <div className="text-xs font-bold text-gray-900">KDV Özeti →</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Hesaplanan − İndirilecek = Net KDV · Beyanname hazırlığı</div>
        </Link>
        <Link
          href="/dashboard/cfo/tax/corporate"
          className="bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-amber-200 transition-colors shadow-[0_1px_2px_rgba(17,24,39,0.04)]"
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Kurumlar Vergisi</div>
          <div className="text-xs font-bold text-gray-900">KV Raporu →</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Geçici vergi takvimi · YTD kurumlar vergisi tahmini</div>
        </Link>
      </div>
    </div>
  )
}
