// ── QuarterlyTab — Çeyreklik CFO Raporu ─────────────────────────────────────
//
// Zones:
//   1. YTD command strip (4 KPIs)
//   2. Quarter grid (table with QoQ delta)
//   3. Geçici vergi schedule
//   4. Monthly sales breakdown

import Link                                         from 'next/link'
import { NarrativeFooter }                         from '@/components/ds'
import { getQuarterlyReport, type QuarterResult } from '@/lib/finance/financial-core'
import { normalizeAnalytics } from '@/lib/normalize'
import { createClient }       from '@/lib/supabase-server'
import { fmtTRY as fmt }     from '@/lib/format'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(r: number): string {
  return `%${(r * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
}
function delta(curr: number, prev: number): { text: string; color: string } {
  if (prev === 0) return { text: '—', color: 'text-[#94a3b8]' }
  const pct  = ((curr - prev) / Math.abs(prev)) * 100
  const sign = pct >= 0 ? '+' : ''
  return { text: `${sign}${pct.toFixed(1)}%`, color: pct >= 0 ? 'text-pos-text' : 'text-neg' }
}
function fmtDate(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${day} ${months[Number(m) - 1]} ${y}`
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function QuarterlyTab({ userId, companyId }: Props) {
  const currentYear = new Date().getFullYear()
  const today       = new Date().toISOString().slice(0, 10)
  const supabase    = createClient()

  function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    return fn().catch(() => fallback)
  }

  const ZERO_REPORT = {
    year: currentYear,
    quarters: [] as QuarterResult[],
    ytd: { revenue: 0, gross_profit: 0, net_profit: 0, matrah: 0, corporate_tax: 0, net_after_tax: 0, total_gecici: 0 },
  }
  const ZERO_PREV = {
    year: currentYear - 1,
    quarters: [] as QuarterResult[],
    ytd: { revenue: 0, gross_profit: 0, net_profit: 0, matrah: 0, corporate_tax: 0, net_after_tax: 0, total_gecici: 0 },
  }

  // Current month bounds for close readiness checks
  const currentMonth = today.slice(0, 7)  // YYYY-MM
  const monthStart   = `${currentMonth}-01`
  const monthEnd     = today

  const [report, prevReport, analyticsRaw, overdueCount, missingCategoryCount, unconfirmedExpenses] = await Promise.all([
    sq(() => getQuarterlyReport(userId, companyId, currentYear), ZERO_REPORT),
    sq(() => getQuarterlyReport(userId, companyId, currentYear - 1), ZERO_PREV),
    sq(async () => {
      const { data } = await supabase.rpc('get_sales_analytics', { p_user_id: userId, p_company_id: companyId })
      return data as unknown
    }, null as unknown),
    // Check 1: How many sales are overdue/unpaid
    sq(async () => {
      const { count } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('payment_status', ['unpaid', 'partial', 'overdue'])
        .not('is_deleted', 'eq', true)
      return count ?? 0
    }, 0),
    // Check 2: Expenses this month missing a category
    sq(async () => {
      const { count } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd)
        .or('expense_type.is.null,expense_type.eq.')
        .not('is_deleted', 'eq', true)
      return count ?? 0
    }, 0),
    // Check 3: Expenses this month not yet marked paid
    sq(async () => {
      const { count } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd)
        .neq('payment_status', 'paid')
        .not('is_deleted', 'eq', true)
      return count ?? 0
    }, 0),
  ])

  const a       = normalizeAnalytics(analyticsRaw)
  const monthly = a.monthly_sales
  const ytd     = report.ytd
  const qs      = report.quarters
  const prevQs  = prevReport.quarters
  const prevYtd = prevReport.ytd
  const convRate = a.total_proformas > 0
    ? Math.round((a.converted_proformas / a.total_proformas) * 100) : 0

  // YoY helper: same-index quarter from prior year
  const yoyRevDelta = (qIdx: number) => {
    const prev = prevQs[qIdx]
    if (!prev || prev.revenue === 0) return null
    return delta(qs[qIdx]?.revenue ?? 0, prev.revenue)
  }
  const ytdYoY = prevYtd.revenue > 0 ? delta(ytd.revenue, prevYtd.revenue) : null

  // ── Period Close Readiness ─────────────────────────────────────────────────
  const pastDueGecici = qs.filter((q: QuarterResult) => q.gecici_due_date && q.gecici_due_date < today && q.gecici_vergi > 0)

  const closeChecks: Array<{
    id:       string
    label:    string
    detail:   string
    ok:       boolean
    warning?: boolean
  }> = [
    {
      id:     'overdue-sales',
      label:  'Vadesi geçmiş tahsilat yok',
      detail: overdueCount === 0
        ? 'Tüm satışlar tahsil edildi veya vade içinde'
        : `${overdueCount} satış hâlâ ödenmemiş — tahsilat başlatın`,
      ok:     overdueCount === 0,
      warning: overdueCount > 0 && overdueCount <= 3,
    },
    {
      id:     'expense-categories',
      label:  'Tüm masraflar kategorize edildi',
      detail: missingCategoryCount === 0
        ? `${currentMonth} masrafları kategorize edilmiş`
        : `${missingCategoryCount} masrafın kategorisi eksik — gider türü atayın`,
      ok:     missingCategoryCount === 0,
    },
    {
      id:     'expenses-paid',
      label:  'Ay içi masraflar ödendi',
      detail: unconfirmedExpenses === 0
        ? `${currentMonth} masraflarının tamamı kapatıldı`
        : `${unconfirmedExpenses} masraf henüz ödenmedi olarak işaretli`,
      ok:     unconfirmedExpenses === 0,
      warning: true,
    },
    {
      id:     'gecici-vergi',
      label:  'Geçici vergi takvimi güncel',
      detail: pastDueGecici.length === 0
        ? 'Gecikmiş geçici vergi kaydı yok'
        : `${pastDueGecici.length} geçici vergi dönemi geçti — beyan yapıldı mı?`,
      ok:     pastDueGecici.length === 0,
    },
    {
      id:     'ytd-revenue',
      label:  'YTD ciro kaydı mevcut',
      detail: ytd.revenue > 0
        ? `${currentYear} YTD ciro: ${fmt(ytd.revenue)}`
        : 'Bu yıl için henüz satış kaydı yok',
      ok:     ytd.revenue > 0,
      warning: true,
    },
  ]

  const passCount = closeChecks.filter(c => c.ok).length
  const readinessScore = Math.round((passCount / closeChecks.length) * 100)
  const readinessLabel = readinessScore >= 100 ? 'Hazır' : readinessScore >= 60 ? 'Kısmen Hazır' : 'Eksikler Var'
  const readinessBadgeClass = readinessScore >= 100
    ? 'bg-pos-light text-pos-text border-pos-light'
    : readinessScore >= 60
    ? 'bg-warn-light text-warn-text border-warn-light'
    : 'bg-neg-light text-neg-text border-neg-light'

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black text-[#0f172a] tracking-tight">CFO Raporu {currentYear}</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">Çeyreklik P&L · Vergi Takvimi · Aylık Satışlar</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-[#f1f5f9] text-[#64748b] px-2.5 py-1 rounded font-semibold">
            {convRate}% dönüşüm · {a.total_sales} satış
          </span>
        </div>
      </div>

      {/* Zone 1 — YTD strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: 'YTD Ciro', value: fmt(ytd.revenue), tone: 'text-[#0f172a]',
            sub: ytdYoY ? ytdYoY.text + ' yıllık' : undefined, subColor: ytdYoY?.color,
          },
          {
            label: 'Brüt Kâr', value: fmt(ytd.gross_profit),
            tone: ytd.gross_profit >= 0 ? 'text-pos-text' : 'text-neg',
          },
          {
            label: 'Vergi Sonrası Net', value: fmt(ytd.net_after_tax),
            tone: ytd.net_after_tax >= 0 ? 'text-pos-text' : 'text-neg',
          },
          {
            label: 'Tahmini KV', value: fmt(ytd.corporate_tax),
            tone: ytd.corporate_tax > 0 ? 'text-warn-text' : 'text-[#94a3b8]',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.tone}`}>{c.value}</div>
            {'sub' in c && c.sub && (
              <div className={`text-[10px] font-semibold mt-1 leading-none ${c.subColor ?? 'text-[#94a3b8]'}`}>{c.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Zone 2 — Quarter grid */}
      {qs.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0]">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Çeyreklik Performans</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">Ciro · Brüt Kâr · Net Kâr · Marjlar</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[620px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Çeyrek</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ciro</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">YoY</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-brand-light">Brüt Kâr</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Net Kâr</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Brüt Marj</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Net Marj</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-warn">KV Matrahı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {qs.map((q: QuarterResult, i: number) => {
                  const prev = i > 0 ? qs[i - 1] : null
                  const revDelta = prev && prev.revenue > 0 ? delta(q.revenue, prev.revenue) : null
                  const yoy      = yoyRevDelta(i)
                  const isFuture = !q.is_past_quarter && q.period.from > today
                  return (
                    <tr key={q.label} className={`hover:bg-[#f8fafc]/60 ${isFuture ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-black text-[#0f172a]">{q.label}</div>
                        {isFuture && <div className="text-[9px] text-[#94a3b8]">Henüz başlamadı</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-bold text-[#0f172a]">{fmt(q.revenue)}</div>
                        {revDelta && <div className={`text-[10px] font-semibold ${revDelta.color}`}>{revDelta.text} QoQ</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {yoy
                          ? <span className={`text-xs font-black tabular-nums ${yoy.color}`}>{yoy.text}</span>
                          : <span className="text-[#cbd5e1] text-xs">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${q.gross_profit >= 0 ? 'text-brand' : 'text-neg'}`}>
                        {fmt(q.gross_profit)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${q.net_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                        {fmt(q.net_profit)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${q.gross_margin >= 0.3 ? 'text-pos-text' : q.gross_margin >= 0.1 ? 'text-warn-text' : 'text-neg'}`}>
                        {q.revenue > 0 ? fmtPct(q.gross_margin) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${q.net_margin >= 0 ? 'text-[#64748b]' : 'text-neg'}`}>
                        {q.revenue > 0 ? fmtPct(q.net_margin) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${q.matrah > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>
                        {q.matrah > 0 ? fmt(q.matrah) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {/* YTD row */}
                <tr className="bg-brand-subtle/40 font-black border-t-2 border-brand/10">
                  <td className="px-4 py-3 text-brand font-black text-xs">YTD Toplam</td>
                  <td className="px-4 py-3 text-right font-mono font-black text-[#0f172a]">{fmt(ytd.revenue)}</td>
                  <td className="px-4 py-3 text-right">
                    {ytdYoY
                      ? <span className={`text-xs font-black ${ytdYoY.color}`}>{ytdYoY.text}</span>
                      : <span className="text-[#cbd5e1] text-xs">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-black ${ytd.gross_profit >= 0 ? 'text-brand' : 'text-neg'}`}>{fmt(ytd.gross_profit)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-black ${ytd.net_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmt(ytd.net_profit)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#64748b]">
                    {ytd.revenue > 0 ? fmtPct(ytd.gross_profit / ytd.revenue) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[#64748b]">
                    {ytd.revenue > 0 ? fmtPct(ytd.net_profit / ytd.revenue) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-black ${ytd.matrah > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>{ytd.matrah > 0 ? fmt(ytd.matrah) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Zone 3 — Gecici vergi schedule */}
      {qs.some((q: QuarterResult) => q.gecici_vergi > 0) && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Geçici Vergi Takvimi {currentYear}</div>
              <p className="text-[10px] text-[#94a3b8] mt-0.5">Kurumlar vergisi matrahı üzerinden %25 · yıllık beyan Nisan ayında</p>
            </div>
            <span className="text-xs font-bold text-warn-text bg-warn-light border border-warn-light px-2.5 py-1 rounded">
              Toplam {fmt(ytd.total_gecici)}
            </span>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {qs.filter((q: QuarterResult) => q.gecici_vergi > 0 || q.gecici_due_date).map((q: QuarterResult) => {
              if (!q.gecici_due_date) return null
              const isPast   = q.gecici_due_date <= today
              const isUrgent = !isPast && q.gecici_due_date <= addDays(today, 30)
              return (
                <div key={q.label} className={`px-4 py-3 flex items-center justify-between gap-4 ${isUrgent ? 'bg-warn-light/40' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#1e293b]">{q.label} Geçici Vergi</span>
                      {isPast && <span className="text-[9px] bg-[#f1f5f9] text-[#94a3b8] px-1.5 py-0.5 rounded">Geçti</span>}
                      {isUrgent && !isPast && <span className="text-[9px] bg-warn-light text-warn-text font-bold px-1.5 py-0.5 rounded">30 gün içinde</span>}
                    </div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">Son ödeme: {fmtDate(q.gecici_due_date)} · Matrah: {fmt(q.matrah)}</div>
                  </div>
                  <div className={`text-base font-black tabular-nums ${isPast ? 'text-[#94a3b8]' : isUrgent ? 'text-warn-text' : 'text-warn-text'}`}>
                    {fmt(q.gecici_vergi)}
                  </div>
                </div>
              )
            })}
            <div className="px-4 py-3 flex items-center justify-between bg-[#f8fafc]">
              <div>
                <div className="text-xs font-black text-[#334155]">Yıl Sonu Kurumlar Vergisi Tahmini</div>
                <div className="text-[10px] text-[#94a3b8] mt-0.5">Nisan {currentYear + 1} · Yıllık matrah × %25 − ödenen geçici vergiler</div>
              </div>
              <div className="text-base font-black text-warn-text tabular-nums">
                {fmt(Math.max(0, ytd.corporate_tax - ytd.total_gecici))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zone 4 — Monthly breakdown */}
      {monthly.length > 0 ? (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Aylık Satış Detayı</div>
            <span className="text-[10px] text-[#94a3b8]">{a.total_sales} satış · {a.total_proformas} teklif</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ay</th>
                <th className="text-center px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Satış</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ciro (TRY)</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Kâr (TRY)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {[...monthly].reverse().map(m => (
                <tr key={m.month} className="hover:bg-[#f8fafc]/60 transition-colors">
                  <td className="px-4 py-3 font-semibold text-[#1e293b]">{m.month}</td>
                  <td className="px-4 py-3 text-center text-[#64748b] tabular-nums">{m.count}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#334155]">{fmt(m.revenue_try)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${m.profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                    {fmt(m.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded text-center py-16 shadow-sm">
          <p className="text-[#64748b] font-medium text-sm">Henüz satış verisi yok.</p>
          <p className="text-[#94a3b8] text-xs mt-1">Satış kaydedildiğinde çeyreklik analiz otomatik hesaplanır.</p>
        </div>
      )}

      {/* Zone 5 — Period Close Readiness */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem Kapanış Kontrolü</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">Dönem kapatmadan önce kontrol edilmesi gereken kalemler</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-[#64748b]">{passCount}/{closeChecks.length}</span>
            <span className={`text-xs font-bold border px-2.5 py-1 rounded ${readinessBadgeClass}`}>
              {readinessLabel}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-[#f1f5f9] w-full">
          <div
            className={`h-full transition-all duration-500 ${
              readinessScore >= 100 ? 'bg-pos-light' : readinessScore >= 60 ? 'bg-warn' : 'bg-neg'
            }`}
            style={{ width: `${readinessScore}%` }}
          />
        </div>

        <div className="divide-y divide-[#f1f5f9]">
          {closeChecks.map(check => {
            const icon = check.ok
              ? <span className="text-pos text-base leading-none">✓</span>
              : check.warning
              ? <span className="text-warn text-base leading-none">⚠</span>
              : <span className="text-neg text-base leading-none">✗</span>

            const labelClass = check.ok ? 'text-[#1e293b]' : check.warning ? 'text-warn-text' : 'text-neg-text'
            const detailClass = check.ok ? 'text-[#94a3b8]' : check.warning ? 'text-warn-text' : 'text-neg'

            return (
              <div key={check.id} className={`px-4 py-3 flex items-start gap-3 ${!check.ok && !check.warning ? 'bg-neg-light/30' : !check.ok ? 'bg-warn-light/30' : ''}`}>
                <div className="mt-0.5 w-5 shrink-0 flex justify-center">{icon}</div>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-bold ${labelClass}`}>{check.label}</div>
                  <div className={`text-[10px] mt-0.5 ${detailClass}`}>{check.detail}</div>
                </div>
              </div>
            )
          })}
        </div>

        {readinessScore >= 100 && (
          <div className="px-4 py-3 bg-pos-light/40 border-t border-pos-light text-center">
            <p className="text-xs text-pos-text font-bold">✓ Tüm kontroller geçti — dönem kapatılabilir</p>
          </div>
        )}
      </div>

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="Geçici vergi nakit planlamasını doğrudan etkiler — çeyrek matrahı büyüyorsa nakit rezervi buna göre ayrılmalı."
        links={[
          { label: 'Aylık P&L',     href: '/dashboard/finance?tab=pnl' },
          { label: 'KDV/KV',        href: '/dashboard/finance?tab=tax' },
          { label: 'Gelir Tablosu', href: '/dashboard/reports/income-statement' },
        ]}
      />
    </div>
  )
}
