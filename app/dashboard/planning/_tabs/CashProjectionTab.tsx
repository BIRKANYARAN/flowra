// ── CashProjectionTab — 12-Month Cash Projection ──────────────────────────────
// Server component. Fetches 6 months of trailing actuals, builds forecast engine
// inputs, then renders a month-by-month cash timeline for all 3 scenarios.
// NO client-side JS — pure server-rendered data visualization.

import { createClient }        from '@/lib/supabase-server'
import { computeForecast, buildForecastInputs } from '@/lib/engines/forecast.engine'
import { StrategicScenarioSection } from './StrategicScenarioSection'
import Link                    from 'next/link'
import { NarrativeFooter }     from '@/components/ds'

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmt(n: number) { return FMT.format(Math.round(n)) }
function fmtK(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}

interface Props { companyId: string }

export async function CashProjectionTab({ companyId }: Props) {
  const supabase = createClient()
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1  // 1-12

  // ── Trailing 6 months actuals — 2 parallel queries (not 12 sequential) ───────
  // Compute date range: from the start of (current month - 6) to end of last month.
  const trailingStart = new Date(year, month - 1 - 6, 1)
  const trailingFrom  = trailingStart.toISOString().slice(0, 10)
  const trailingEnd   = new Date(year, month - 1, 0)  // last day of prior month
  const trailingTo    = trailingEnd.toISOString().slice(0, 10)

  const [salesRangeRes, expRangeRes] = await Promise.all([
    supabase
      .from('sales')
      .select('total_try:total, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', trailingFrom)
      .lte('sale_date', trailingTo),
    supabase
      .from('expenses')
      .select('amount_try, expense_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', trailingFrom)
      .lte('expense_date', trailingTo),
  ])

  // Group by YYYY-MM in JS for the 6 months (oldest first)
  const revenueByMonth  = new Map<string, number>()
  const expenseByMonth  = new Map<string, number>()
  for (const r of (salesRangeRes.data ?? [])) {
    const ym = (r.sale_date as string).slice(0, 7)
    revenueByMonth.set(ym, (revenueByMonth.get(ym) ?? 0) + Number(r.total_try ?? 0))
  }
  for (const r of (expRangeRes.data ?? [])) {
    const ym = (r.expense_date as string).slice(0, 7)
    expenseByMonth.set(ym, (expenseByMonth.get(ym) ?? 0) + Number(r.amount_try ?? 0))
  }

  // Build trailing array (6 complete months, oldest first)
  const trailing: Array<{ revenue: number; expenses: number }> = []
  for (let i = 6; i >= 1; i--) {
    const d  = new Date(year, month - 1 - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    trailing.push({
      revenue:  revenueByMonth.get(ym)  ?? 0,
      expenses: expenseByMonth.get(ym)  ?? 0,
    })
  }

  // ── Current month cash proxy (collected sales) ─────────────────────────────
  const curFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const curTo   = now.toISOString().slice(0, 10)
  let currentCash = 0
  try {
    const [colRes, expRes] = await Promise.all([
      supabase.from('sales').select('total_try:total').eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null).gte('paid_at', curFrom + 'T00:00:00Z').lte('paid_at', curTo + 'T23:59:59Z'),
      supabase.from('expenses').select('amount_try').eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null).gte('expense_date', curFrom).lte('expense_date', curTo),
    ])
    const cash   = (colRes.data ?? []).reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const spent  = (expRes.data ?? []).reduce((s, r) => s + Number(r.amount_try ?? 0), 0)
    currentCash  = Math.max(0, cash - spent)
  } catch { /* fallback 0 */ }

  // ── Monthly debt service from active tranches ──────────────────────────────
  let monthlyDebtService = 0
  try {
    const { data: tranches } = await supabase
      .from('partner_loan_tranches')
      // outstanding_try computed (no such column): principal_try − total_repaid_try
      .select('principal_try, total_repaid_try, annual_interest_rate')
      .eq('company_id', companyId)
      .eq('status', 'active')
    monthlyDebtService = (tranches ?? []).reduce((s, t) => {
      const principal = Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0))
      const rate      = Number(t.annual_interest_rate ?? 0)
      return s + (rate > 0 ? principal * rate / 12 : principal * 0.015)
    }, 0)
  } catch { /* fallback 0 */ }

  // ── Build forecast ─────────────────────────────────────────────────────────
  // Start from next month (current month is partially known)
  const { year: startYear, month: startMonth } = month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 }

  const inputs   = buildForecastInputs(trailing, currentCash, monthlyDebtService, startYear, startMonth)
  const forecast = computeForecast(inputs)

  // ── Data quality flags ─────────────────────────────────────────────────────
  const hasData        = trailing.some(m => m.revenue > 0 || m.expenses > 0)
  const avgRevenue     = inputs.avgMonthlyRevenue
  const avgExpenses    = inputs.avgMonthlyExpenses
  const avgNet         = avgRevenue - avgExpenses - monthlyDebtService
  const hasTranches    = monthlyDebtService > 0

  // ── Bar chart max for scaling ──────────────────────────────────────────────
  const allBase  = forecast.base.map(m => Math.abs(m.cash))
  const maxCash  = Math.max(...allBase, 1)

  return (
    <div className="space-y-5">

      {/* ── HEADER METRICS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Ort. Aylık Gelir"   value={`₺${fmtK(avgRevenue)}`}    sub="6 ay ortalama"                                            color={avgRevenue > 0 ? 'text-pos-text' : 'text-[#94a3b8]'} />
        <Metric label="Ort. Aylık Gider"   value={`₺${fmtK(avgExpenses)}`}   sub="6 ay ortalama"                                            color="text-[#334155]" />
        <Metric label="Borç Servisi/Ay"    value={hasTranches ? `₺${fmtK(monthlyDebtService)}` : '—'} sub="aylık nakit çıkışı" color={hasTranches ? 'text-warn' : 'text-[#94a3b8]'} />
        <Metric label="Ort. Net/Ay"        value={`₺${fmtK(avgNet)}`}         sub="borç sonrası · mevcut hızda"                             color={avgNet >= 0 ? 'text-pos-text' : 'text-neg'} />
      </div>

      {!hasData && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3 text-xs text-warn-text">
          <span className="font-semibold">Geçmiş veri bulunamadı.</span>{' '}
          Son 6 aya ait satış ve gider girişi yapıldığında projeksiyon otomatik hesaplanır.
        </div>
      )}

      {/* ── 3-SCENARIO SUMMARY CARDS ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: 'pessimistic', label: 'Kötümser (−20%)', summary: forecast.summary.pessimistic, accent: 'border-neg-light bg-neg-light',   text: 'text-neg-text',     sub: 'text-neg' },
          { key: 'base',        label: 'Baz',              summary: forecast.summary.base,        accent: 'border-[#e8eaef] bg-white',   text: 'text-[#0f172a]',    sub: 'text-[#94a3b8]' },
          { key: 'optimistic',  label: 'İyimser (+15%)',   summary: forecast.summary.optimistic,  accent: 'border-pos-light bg-pos-light', text: 'text-pos-text', sub: 'text-pos' },
        ] as const).map(s => (
          <div key={s.key} className={`rounded border px-4 py-3.5 ${s.accent}`}>
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">{s.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${s.text}`}>
              <span className="text-[#cbd5e1] text-sm font-normal mr-0.5">₺</span>
              {fmtK(Math.abs(s.summary.endCash))}
              {s.summary.endCash < 0 && <span className="text-sm ml-1 font-normal">(−)</span>}
            </div>
            <div className={`text-[10px] mt-1 ${s.sub}`}>12 ay sonu nakit</div>
            {s.summary.runwayEndMonth && (
              <div className="text-[10px] font-bold text-neg mt-1.5">
                {s.summary.runwayEndMonth} nakit tükeniyor
              </div>
            )}
            {!s.summary.runwayEndMonth && s.summary.totalNet >= 0 && (
              <div className={`text-[10px] font-semibold mt-1.5 ${s.sub}`}>
                +₺{fmtK(s.summary.totalNet)} net kâr
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── BASE SCENARIO — MONTHLY CASH BARS ─────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
          <div>
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Baz Senaryo — Aylık Nakit Pozisyonu</span>
            <span className="ml-2 text-[9px] text-[#94a3b8]">({startYear} projeksiyonu)</span>
          </div>
          <Link href="/dashboard/planning?tab=scenarios" className="text-[10px] text-brand-light font-semibold hover:underline">
            Senaryo Editörü →
          </Link>
        </div>

        {/* Bar chart */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-end gap-1 h-20">
            {forecast.base.map((m, i) => {
              const height    = Math.max(4, Math.round((Math.abs(m.cash) / maxCash) * 80))
              const isNeg     = m.cash < 0
              const barClass  = isNeg ? 'bg-neg' : (m.cash > avgRevenue * 3 ? 'bg-pos-light' : 'bg-brand-light')
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className={`w-full rounded-t-sm transition-all ${barClass}`}
                    style={{ height: `${height}px` }}
                    title={`${m.label}: ₺${fmt(m.cash)}`}
                  />
                  <span className="text-[7px] text-[#94a3b8] leading-none font-medium">{m.label.split(' ')[0]}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Month-by-month table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-[#f8fafc]/60">
                <th className="text-left px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] whitespace-nowrap">Ay</th>
                <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] whitespace-nowrap">Gelir</th>
                <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] whitespace-nowrap">Net</th>
                <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] whitespace-nowrap">Nakit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {forecast.base.map((m, i) => (
                <tr key={i} className="hover:bg-[#f8fafc]/40">
                  <td className="px-4 py-2 font-semibold text-[#334155] whitespace-nowrap">{m.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">₺{fmtK(m.revenue)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${m.net >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                    {m.net >= 0 ? '+' : '−'}₺{fmtK(Math.abs(m.net))}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-black ${m.cash >= 0 ? 'text-[#0f172a]' : 'text-neg'}`}>
                    {m.cash < 0 ? '−' : ''}₺{fmtK(Math.abs(m.cash))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ASSUMPTIONS FOOTER ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-[#f8fafc] border border-[#e8eaef] rounded text-[10px] text-[#94a3b8] space-y-1">
        <div className="font-bold text-[#64748b] mb-1">Projeksiyon Varsayımları</div>
        <div>• Son 6 ayın aylık ortalaması baz alınmıştır (gelir + gider)</div>
        {hasTranches && <div>• Aylık borç servisi ₺{fmtK(monthlyDebtService)} tahmin edilmiştir (aktif borç dilimi faizleri)</div>}
        <div>• İyimser: +%15 gelir büyümesi · Kötümser: −%20 gelir stresi · Borç servisi her senaryoda sabit</div>
        <div>• Mevsimsellik, yeni ürün ve büyük gider dalgalanmaları bu modele dahil değildir</div>
      </div>

      {/* ── STRATEGIC P&L PROJECTION — computeMultiScenario ──────────────── */}
      <StrategicScenarioSection companyId={companyId} />

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="Projeksiyon bir tahmin — gerçekleşen satış ve tahsilat takvimiyle hizalayarak güncel tutun."
        links={[
          { label: 'Nakit Akışı',  href: '/dashboard/finance?tab=cashflow' },
          { label: 'Borç Baskısı', href: '/dashboard/planning?tab=debt-pressure' },
        ]}
      />
    </div>
  )
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums leading-none ${color}`}>{value}</div>
      <div className="text-[9px] text-[#94a3b8] mt-1">{sub}</div>
    </div>
  )
}
