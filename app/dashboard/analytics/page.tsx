export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/analytics — CFO Executive Report
//
// SERVER COMPONENT — data loaded via getQuarterlyReport + existing RPC.
//
// Zones:
//   1. YTD command strip     — revenue, gross profit, net after tax, tax
//   2. Quarter grid          — 4Q side-by-side with margins + QoQ delta
//   3. Geçici Vergi schedule — quarterly provisional tax payment calendar
//   4. Monthly breakdown     — existing granular table
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }     from '@/lib/supabase-server'
import { redirect }         from 'next/navigation'
import { resolveCompanyId } from '@/lib/resolve-company'
import { FinanceNavTabs }   from '@/components/dashboard/FinanceNavTabs'
import { normalizeAnalytics } from '@/lib/normalize'
import { getQuarterlyReport, type QuarterResult } from '@/lib/finance/financial-core'

// ── Formatters ────────────────────────────────────────────────────────────────

const _TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmt(n: number): string {
  const abs = Math.abs(Number(n || 0))
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${_TRY.format(abs)}`
}
function fmtPct(r: number): string {
  return `%${(r * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
}
function delta(curr: number, prev: number): { text: string; color: string } {
  if (prev === 0) return { text: '—', color: 'text-gray-400' }
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  const sign = pct >= 0 ? '+' : ''
  const color = pct >= 0 ? 'text-emerald-600' : 'text-red-600'
  return { text: `${sign}${pct.toFixed(1)}%`, color }
}
function fmtDate(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${day} ${months[Number(m) - 1]} ${y}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid!, supabase) }
  catch { redirect('/auth') }

  const currentYear = new Date().getFullYear()
  const today       = new Date().toISOString().slice(0, 10)

  // ── Data loading — parallel ───────────────────────────────────────────────
  function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    return fn().catch(() => fallback)
  }

  const ZERO_REPORT = {
    year: currentYear,
    quarters: [],
    ytd: { revenue: 0, gross_profit: 0, net_profit: 0, matrah: 0, corporate_tax: 0, net_after_tax: 0, total_gecici: 0 },
  }

  const [report, analyticsRaw] = await Promise.all([
    sq(() => getQuarterlyReport(uid!, companyId, currentYear), ZERO_REPORT),
    sq(async () => {
      const { data } = await supabase.rpc('get_sales_analytics', { p_user_id: uid!, p_company_id: companyId })
      return data as unknown
    }, null as unknown),
  ])

  const a       = normalizeAnalytics(analyticsRaw)
  const monthly = a.monthly_sales
  const ytd     = report.ytd
  const qs      = report.quarters
  const convRate = a.total_proformas > 0
    ? Math.round((a.converted_proformas / a.total_proformas) * 100) : 0

  // Quarters with actual data (ended or current)
  const activeQs = qs.filter((q: QuarterResult) => q.revenue > 0 || q.is_past_quarter)
  void activeQs

  return (
    <div className="max-w-5xl space-y-4">
      <FinanceNavTabs active="analytics" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-black text-gray-900 tracking-tight">CFO Raporu {currentYear}</h1>
          <p className="text-xs text-gray-400 mt-0.5">Çeyreklik P&L · Vergi Takvimi · Aylık Satışlar</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-semibold">
            {convRate}% dönüşüm · {a.total_sales} satış
          </span>
        </div>
      </div>

      {/* ── Zone 1: YTD Command Strip ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'YTD Ciro',         value: fmt(ytd.revenue),       tone: 'text-gray-900' },
          { label: 'Brüt Kâr',         value: fmt(ytd.gross_profit),   tone: ytd.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600' },
          { label: 'Vergi Sonrası Net', value: fmt(ytd.net_after_tax), tone: ytd.net_after_tax >= 0 ? 'text-emerald-700' : 'text-red-600' },
          { label: 'Tahmini KV',        value: fmt(ytd.corporate_tax), tone: ytd.corporate_tax > 0 ? 'text-amber-600' : 'text-gray-400' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Zone 2: Quarter Grid ─────────────────────────────────────────────── */}
      {qs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-800">Çeyreklik Performans</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Ciro · Brüt Kâr · Net Kâr · Marjlar</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[540px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Çeyrek</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ciro</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-400">Brüt Kâr</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">Net Kâr</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Brüt Marj</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Net Marj</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400">KV Matrahı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {qs.map((q: QuarterResult, i: number) => {
                  const prev = i > 0 ? qs[i - 1] : null
                  const revDelta = prev && prev.revenue > 0 ? delta(q.revenue, prev.revenue) : null
                  const isFuture = !q.is_past_quarter && q.period.from > today
                  return (
                    <tr key={q.label} className={`hover:bg-gray-50/60 ${isFuture ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-black text-gray-900">{q.label}</div>
                        {isFuture && <div className="text-[9px] text-gray-400">Henüz başlamadı</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-bold text-gray-900">{fmt(q.revenue)}</div>
                        {revDelta && <div className={`text-[10px] font-semibold ${revDelta.color}`}>{revDelta.text}</div>}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${q.gross_profit >= 0 ? 'text-primary-700' : 'text-red-600'}`}>
                        {fmt(q.gross_profit)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${q.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmt(q.net_profit)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${q.gross_margin >= 0.3 ? 'text-emerald-600' : q.gross_margin >= 0.1 ? 'text-amber-600' : 'text-red-600'}`}>
                        {q.revenue > 0 ? fmtPct(q.gross_margin) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${q.net_margin >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                        {q.revenue > 0 ? fmtPct(q.net_margin) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${q.matrah > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        {q.matrah > 0 ? fmt(q.matrah) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {/* YTD row */}
                <tr className="bg-primary-50/40 font-black border-t-2 border-primary-100">
                  <td className="px-4 py-3 text-primary-800 font-black text-xs">YTD Toplam</td>
                  <td className="px-4 py-3 text-right font-mono font-black text-gray-900">{fmt(ytd.revenue)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-black ${ytd.gross_profit >= 0 ? 'text-primary-700' : 'text-red-600'}`}>{fmt(ytd.gross_profit)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-black ${ytd.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(ytd.net_profit)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-500">
                    {ytd.revenue > 0 ? fmtPct(ytd.gross_profit / ytd.revenue) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-500">
                    {ytd.revenue > 0 ? fmtPct(ytd.net_profit / ytd.revenue) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-black ${ytd.matrah > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{ytd.matrah > 0 ? fmt(ytd.matrah) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Zone 3: Geçici Vergi Schedule ────────────────────────────────────── */}
      {qs.some(q => q.gecici_vergi > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-gray-800">Geçici Vergi Takvimi {currentYear}</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Kurumlar vergisi matrahı üzerinden %25 · yıllık beyan Nisan ayında
              </p>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              Toplam {fmt(ytd.total_gecici)}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {qs.filter((q: QuarterResult) => q.gecici_vergi > 0 || q.gecici_due_date).map((q: QuarterResult) => {
              if (!q.gecici_due_date) return null
              const isPast    = q.gecici_due_date <= today
              const isUrgent  = !isPast && q.gecici_due_date <= addDays(today, 30)
              return (
                <div key={q.label}
                  className={`px-4 py-3 flex items-center justify-between gap-4 ${isUrgent ? 'bg-amber-50/40' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-gray-800">{q.label} Geçici Vergi</span>
                      {isPast && <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">Geçti</span>}
                      {isUrgent && !isPast && <span className="text-[9px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">30 gün içinde</span>}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Son ödeme: {fmtDate(q.gecici_due_date)} · Matrah: {fmt(q.matrah)}
                    </div>
                  </div>
                  <div className={`text-base font-black tabular-nums ${isPast ? 'text-gray-400' : isUrgent ? 'text-amber-700' : 'text-amber-600'}`}>
                    {fmt(q.gecici_vergi)}
                  </div>
                </div>
              )
            })}
            <div className="px-4 py-3 flex items-center justify-between bg-gray-50">
              <div>
                <div className="text-xs font-black text-gray-700">Yıl Sonu Kurumlar Vergisi Tahmini</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  Nisan {currentYear + 1}· Yıllık matrah × %25 − ödenen geçici vergiler
                </div>
              </div>
              <div className="text-base font-black text-amber-700 tabular-nums">
                {fmt(Math.max(0, ytd.corporate_tax - ytd.total_gecici))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Zone 4: Monthly Breakdown ────────────────────────────────────────── */}
      {monthly.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-black text-gray-800">Aylık Satış Detayı</h2>
            <span className="text-[10px] text-gray-400">{a.total_sales} satış · {a.total_proformas} teklif</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ay</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Satış</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ciro (TRY)</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">Kâr (TRY)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...monthly].reverse().map(m => (
                <tr key={m.month} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-800">{m.month}</td>
                  <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{m.count}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(m.revenue_try)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${m.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmt(m.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl text-center py-16">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 font-medium">Henüz satış verisi yok.</p>
        </div>
      )}
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
