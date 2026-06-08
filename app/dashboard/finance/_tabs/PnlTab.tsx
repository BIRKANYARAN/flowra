// ── PnlTab — Kâr / Zarar Tablosu ─────────────────────────────────────────────
//
// Accrual P&L statement for the current month with:
//   • Revenue waterfall (ciro → brüt kâr → giderler → EBITDA → net)
//   • KDV özeti (sales / purchase / expense / net)
//   • Tahsilat vs fatura delta
//   • Geçen aylar mini-trend (son 6 ay sparkline row)
//   • Çok Dönemli Karşılaştırma (son 6 ay yan yana)

import Link                          from 'next/link'
import { PayrollAnalyticsClient }   from '@/app/dashboard/finance/_tabs/_payroll/PayrollAnalyticsClient'
import { RevenueRecognitionClient } from '@/app/dashboard/finance/_tabs/_recognition/RevenueRecognitionClient'
import { MarginTrendClient }        from '@/app/dashboard/finance/_tabs/_margin-trend/MarginTrendClient'
import { EbitdaBridgeClient }       from '@/app/dashboard/finance/_tabs/_ebitda/EbitdaBridgeClient'
import { ProfitabilityAttributionClient } from '@/app/dashboard/finance/_tabs/_attribution/ProfitabilityAttributionClient'
import { FinanceService }           from '@/lib/services/finance.service'
import { periodForMonth }           from '@/lib/services/finance-rules'
import { fmtTRY, fmtTRY as fmt, fmtMonthShort as fmtMonth } from '@/lib/format'
import { createClient }             from '@/lib/supabase-server'
import { NarrativeFooter }          from '@/components/ds'
import { GLIncomeStatementService } from '@/lib/services/ledger/gl-income-statement.service'
import { MultiPeriodPnlService }    from '@/lib/services/finance/multi-period-pnl.service'
import type { MultiPeriodPnlReport, PnlLineItem } from '@/lib/services/finance/multi-period-pnl.service'
import { PnlCharts }               from './PnlCharts'
import { DetailSection }           from '@/components/dashboard/DetailSection'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtFull(n: number): string { return fmt(n, 0) }
function pct(num: number, den: number): string {
  if (den === 0) return '—'
  return `%${((num / den) * 100).toFixed(1).replace('.', ',')}`
}
function lastNMonths(n: number, ref: Date): string[] {
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref)
    d.setDate(1); d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}
// ── Waterfall row ─────────────────────────────────────────────────────────────

function WRow({ label, value, sub, isTotal, isDeduction, isSub }: {
  label: string; value: number; sub?: string
  isTotal?: boolean; isDeduction?: boolean; isSub?: boolean
}) {
  const labelClass = isTotal
    ? 'text-xs font-black text-[#0f172a]'
    : isSub ? 'text-[11px] font-medium text-[#94a3b8] pl-4'
    : 'text-xs font-semibold text-[#64748b]'
  const valueClass = isTotal
    ? `text-sm font-black ${value >= 0 ? 'text-pos-text' : 'text-neg'}`
    : isDeduction
    ? 'text-xs font-bold text-neg'
    : `text-xs font-bold ${value >= 0 ? 'text-[#1e293b]' : 'text-neg'}`

  return (
    <div className={`flex items-center justify-between gap-2 py-1.5 ${isTotal ? 'border-t border-dashed border-[#e2e8f0] mt-1' : ''}`}>
      <div className="min-w-0">
        <span className={labelClass}>{label}</span>
        {sub && <span className="text-[9px] text-[#94a3b8] ml-1.5">{sub}</span>}
      </div>
      <span className={`tabular-nums shrink-0 ${valueClass}`}>
        {isDeduction ? `(${fmtFull(Math.abs(value))})` : fmtFull(value)}
      </span>
    </div>
  )
}

// ── Expense category labels ────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  general:       'Genel Giderler',
  rent:          'Kira',
  salary:        'Maaş / Bordro',
  utilities:     'Faturalar (Elektrik/Su/Gaz)',
  marketing:     'Pazarlama',
  logistics:     'Lojistik / Kargo',
  software:      'Yazılım / Abonelik',
  equipment:     'Ekipman / Donanım',
  tax:           'Vergi / Resmi Ücret',
  interest:      'Faiz Gideri',
  board_fee:     'Yönetim Kurulu Ücreti',
  principal:     'Anapara Geri Ödemesi',
  dividend:      'Kâr Payı',
  partner_loan:  'Ortak Finansmanı',
  other:         'Diğer',
}

// ── Multi-Period Comparison Table ─────────────────────────────────────────────

function MultiPeriodTable({ report }: { report: MultiPeriodPnlReport }) {
  // Periods newest first (reversed for display)
  const periods = [...report.periods].reverse()

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-5 shadow-sm overflow-x-auto">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
        Çok Dönemli Karşılaştırma — Son 6 Ay
      </div>
      <table className="w-full text-xs border-collapse min-w-[600px]">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="text-left py-2 pr-3 text-[10px] font-black uppercase tracking-wide text-[#94a3b8] w-40">
              Kalem
            </th>
            {periods.map(p => (
              <th key={p.period_key} className="text-right py-2 px-2 text-[10px] font-black uppercase tracking-wide text-[#94a3b8] whitespace-nowrap">
                {p.period_label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.line_items.map(item => (
            <MultiPeriodRow key={item.key} item={item} periods={periods} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MultiPeriodRow({
  item,
  periods,
}: {
  item: PnlLineItem
  periods: MultiPeriodPnlReport['periods']
}) {
  const isSubtotal = item.is_subtotal

  const rowClass = isSubtotal
    ? 'border-t border-dashed border-[#e2e8f0] bg-[#f8fafc]'
    : 'border-t border-[#f1f5f9]'

  const labelClass = isSubtotal
    ? 'font-black text-[#0f172a]'
    : item.indent_level === 1
    ? 'text-[#64748b] pl-4'
    : item.indent_level === 2
    ? 'text-[#94a3b8] pl-8'
    : 'font-semibold text-[#334155]'

  return (
    <tr className={rowClass}>
      <td className={`py-1.5 pr-3 text-[11px] ${labelClass}`}>
        {item.label}
      </td>
      {periods.map(p => {
        const pk    = p.period_key
        const value = item.values[pk] ?? 0
        // For inverted items (expenses) display positive
        const displayVal = item.is_inverted ? Math.abs(value) : value
        const chgPct     = item.change_pcts[pk]

        const valueColor = isSubtotal
          ? value >= 0 ? 'text-pos-text' : 'text-neg'
          : 'text-[#1e293b]'

        return (
          <td key={pk} className={`py-1.5 px-2 text-right tabular-nums align-top ${isSubtotal ? 'font-black' : 'font-medium'}`}>
            <div className={`text-[11px] ${valueColor}`}>
              {fmtTRY(displayVal, 0)}
            </div>
            {chgPct !== null && chgPct !== undefined && (
              <div className={`text-[9px] mt-0.5 ${
                chgPct > 0 ? 'text-pos-text' : chgPct < 0 ? 'text-neg' : 'text-[#94a3b8]'
              }`}>
                {chgPct > 0 ? '▲' : chgPct < 0 ? '▼' : '—'}
                {chgPct !== 0 ? `%${Math.abs(chgPct).toFixed(1)}` : ''}
              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string; glMode?: string }

export async function PnlTab({ userId, companyId, glMode = 'shadow' }: Props) {
  const now  = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthYMs  = lastNMonths(6, now)
  const supabase  = createClient()

  const { from: monthFrom, to: monthTo } = periodForMonth(currentYM)

  function sq<T>(fn: () => Promise<T>, fb: T): Promise<T> { return fn().catch(() => fb) }

  // Try GL income statement when mode supports it
  const useGl = glMode === 'gl_primary' || glMode === 'parallel'
  const glStatement = useGl
    ? await sq(() => GLIncomeStatementService.compute(companyId, supabase, { toDate: monthTo }), null)
    : null

  // Build last-6-months periods for multi-period P&L
  const last6Periods = lastNMonths(6, now).map(ym => {
    const [y, m] = ym.split('-').map(Number)
    return { year: y, month: m }
  })

  const [currentSummary, expenseCatRaw, multiPeriodReport, ...historySummaries] = await Promise.all([
    sq(() => FinanceService.getFinancialSummary(userId, companyId, periodForMonth(currentYM)), null),
    sq(async () => {
      const { data } = await supabase
        .from('expenses')
        .select('category, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', monthFrom)
        .lte('expense_date', monthTo)
        .neq('payment_status', 'cancelled')
      return (data ?? []) as Array<{ category: string | null; amount_try: number | null }>
    }, [] as Array<{ category: string | null; amount_try: number | null }>),
    sq(() => MultiPeriodPnlService.getReport(companyId, supabase, last6Periods), null),
    ...lastNMonths(6, now).map(ym =>
      sq(() => FinanceService.getFinancialSummary(userId, companyId, periodForMonth(ym)), null)
    ),
  ])

  // Group expense rows by category
  const catMap = new Map<string, number>()
  for (const e of expenseCatRaw) {
    const key = e.category ?? 'other'
    catMap.set(key, (catMap.get(key) ?? 0) + Number(e.amount_try ?? 0))
  }
  const expenseByCategory = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => ({ cat, label: CATEGORY_LABELS[cat] ?? cat, total }))

  const s = currentSummary

  // ── Determine data source and values ─────────────────────────────────────
  // GL data takes precedence in gl_primary mode; operational is fallback.
  const hasGlData  = glStatement !== null && glStatement.gross_revenue_try > 0
  const useGlData  = glMode === 'gl_primary' && hasGlData
  const dataSource = glMode === 'gl_primary' ? 'GL (Muhasebe)' : 'Operasyonel (Tahmin)'

  // When GL data is available and mode is gl_primary, prefer GL values
  const revenue      = useGlData ? glStatement!.gross_revenue_try    : Number(s?.revenue_try         ?? 0)
  const cogs         = useGlData ? glStatement!.cogs_try             : Number(s?.cost_try            ?? 0)
  const grossProfit  = useGlData ? glStatement!.gross_profit_try     : Number(s?.gross_profit_try    ?? 0)
  const expenses     = useGlData ? glStatement!.total_opex_try       : Number(s?.expenses_total_try  ?? 0)
  const ebitda       = useGlData ? glStatement!.ebitda_try           : grossProfit - expenses
  const netAfterTax  = useGlData ? glStatement!.net_income_try       : Number(s?.net_after_tax_try   ?? 0)
  const corpTax      = useGlData ? glStatement!.tax_try              : Number(s?.corporate_tax_try   ?? 0)

  if (!s && !hasGlData) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft text-center py-16 shadow-sm">
        <div className="w-8 h-8 rounded-full bg-[#f1f5f9] mx-auto mb-3 flex items-center justify-center">
          <span className="text-[#94a3b8] text-sm font-bold">—</span>
        </div>
        <p className="text-[#64748b] font-medium text-sm">Bu dönem için finansal veri bulunamadı.</p>
        <p className="text-[#94a3b8] text-xs mt-1">Satış veya gider eklendiğinde gelir tablosu otomatik hesaplanır.</p>
      </div>
    )
  }

  const matrah       = Number(s?.matrah_try           ?? 0)
  const salesVat     = Number(s?.sales_vat_try        ?? 0)
  const purchaseVat  = Number(s?.purchase_vat_try     ?? 0)
  const expenseVat   = Number(s?.expense_vat_try      ?? 0)
  const netVat       = salesVat - purchaseVat - expenseVat

  // Month-over-month margin trend — historySummaries[4] = prior month, [5] = current
  const priorSummary    = (historySummaries as Array<typeof s>)[historySummaries.length - 2] ?? null
  const priorRevenue    = Number(priorSummary?.revenue_try    ?? 0)
  const priorGrossProfit = Number(priorSummary?.gross_profit_try ?? 0)
  const currentMargin   = revenue > 0 ? grossProfit / revenue   : null
  const priorMargin     = priorRevenue > 0 ? priorGrossProfit / priorRevenue : null
  const marginDrop      = currentMargin !== null && priorMargin !== null && priorMargin > 0
    ? priorMargin - currentMargin
    : null

  return (
    <div className="space-y-4">

      {/* Veri kaynağı indicator */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Veri Kaynağı:</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black ${
          glMode === 'gl_primary' && hasGlData
            ? 'bg-pos-light border-pos-light text-pos-text'
            : glMode === 'parallel'
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-[#f1f5f9] border-[#e2e8f0] text-[#64748b]'
        }`}>
          {dataSource}
        </span>
        {glMode === 'parallel' && hasGlData && (
          <span className="text-[9px] text-[#94a3b8]">GL verileri mevcut ancak raporlama operasyoneldir</span>
        )}
      </div>

      {/* Month-over-month margin deterioration alert */}
      {marginDrop !== null && marginDrop > 0.10 && (
        <div className={`rounded border px-4 py-3 flex items-start gap-3 ${
          marginDrop > 0.20 ? 'bg-neg-light border-neg-light' : 'bg-warn-light border-warn-light'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${marginDrop > 0.20 ? 'bg-neg' : 'bg-warn'}`} />
          <div className="flex-1">
            <div className={`text-[11px] font-black uppercase tracking-wide ${
              marginDrop > 0.20 ? 'text-neg-text' : 'text-warn-text'
            }`}>
              Brüt Marj Düşüşü — Geçen Aya Göre
            </div>
            <div className={`text-xs mt-0.5 ${marginDrop > 0.20 ? 'text-neg-text' : 'text-warn-text'}`}>
              Bu ay: <strong>%{((currentMargin ?? 0) * 100).toFixed(1)}</strong>{' '}
              → Geçen ay: <strong>%{(priorMargin! * 100).toFixed(1)}</strong>{' '}
              ({marginDrop > 0 ? '−' : '+'}{(Math.abs(marginDrop) * 100).toFixed(1)} puan).{' '}
              SMM artışı veya fiyat baskısı olabilir.
            </div>
          </div>
          <Link href="/dashboard/operations?tab=expenses"
            className={`text-[10px] font-bold underline underline-offset-2 shrink-0 mt-0.5 whitespace-nowrap ${
              marginDrop > 0.20 ? 'text-neg-text hover:text-neg-text' : 'text-warn-text hover:text-warn-text'
            }`}>
            Giderler →
          </Link>
        </div>
      )}

      {/* ── Visual summary — cascade · trend · expense mix ──────────────────── */}
      <PnlCharts
        cascade={{ revenue, gross: grossProfit, ebit: ebitda, net: netAfterTax }}
        monthly={monthYMs.map((ym, i) => ({
          label:   fmtMonth(ym),
          revenue: Number((historySummaries as Array<typeof s>)[i]?.revenue_try ?? 0),
          net:     Number((historySummaries as Array<typeof s>)[i]?.net_after_tax_try ?? 0),
        }))}
        expenses={expenseByCategory.map(e => ({ name: e.label, value: e.total }))}
      />

    <div className="grid grid-cols-12 gap-4">

      {/* ── Left: P&L Waterfall ─────────────────────────────────────────────── */}
      <div className="col-span-7 space-y-4">

        {/* Main waterfall */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-5 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
            Kâr / Zarar — {fmtMonth(currentYM)}
          </div>
          <div className="space-y-0">
            <WRow label="Ciro" value={revenue}
              sub={revenue > 0 ? `Brüt marj ${pct(grossProfit, revenue)}` : 'Satış yok'} />
            <WRow label="− Satılan Mal Maliyeti (SMM)" value={cogs} isDeduction isSub />
            <WRow label="Brüt Kâr" value={grossProfit}
              sub={`Marj: ${pct(grossProfit, revenue)}`} isTotal />
            <WRow label="− Operasyonel Giderler" value={expenses} isDeduction isSub />
            {expenseByCategory.length > 0 && expenseByCategory.map(({ cat, label, total }) => (
              <div key={cat} className="flex items-center justify-between gap-2 py-1 pl-6">
                <span className="text-[10px] text-[#94a3b8] font-medium truncate">{label}</span>
                <span className="text-[10px] tabular-nums text-[#64748b] font-semibold shrink-0">
                  ({fmtFull(total)})
                </span>
              </div>
            ))}
            <WRow label="Faaliyet Kârı (EBIT)" value={ebitda}
              sub={ebitda >= 0 ? 'Operasyon kârlı' : 'Zarar eden operasyon'} isTotal />
            <WRow label="Vergi Matrahı" value={matrah}
              sub="Giderler düşüldü, sermaye hareketleri hariç" isSub />
            {corpTax > 0 && (
              <WRow label="− Kurumlar Vergisi (%25)" value={corpTax} isDeduction isSub />
            )}
            <WRow label="Vergi Sonrası Net" value={netAfterTax}
              sub={netAfterTax >= 0 ? 'Kârlı dönem' : 'Zararlı dönem'} isTotal />
          </div>
        </div>

        {/* KDV Özeti */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">KDV Özeti</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Hesaplanan KDV',   value: salesVat,    color: 'text-pos-text' },
              { label: '− İndirilecek KDV', value: purchaseVat + expenseVat, color: 'text-neg' },
              { label: 'Net KDV',           value: netVat,      color: netVat > 0 ? 'text-warn-text' : 'text-pos-text' },
            ].map(c => (
              <div key={c.label} className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{c.label}</div>
                <div className={`text-sm font-black tabular-nums ${c.color}`}>{fmtFull(Math.abs(c.value))}</div>
                {c.label === 'Net KDV' && (
                  <div className={`text-[9px] mt-0.5 font-semibold ${netVat > 0 ? 'text-warn' : 'text-pos-text'}`}>
                    {netVat > 0 ? '⬆ Ödenecek' : netVat < 0 ? '⬇ Devir' : 'Sıfır'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: KPIs + Tahsilat + Trend ────────────────────────────────── */}
      <div className="col-span-5 space-y-4">

        {/* KPI cards */}
        <div className="space-y-2">
          {[
            { label: 'Brüt Kâr',        value: fmt(grossProfit), sub: `Marj: ${pct(grossProfit, revenue)}`, color: grossProfit >= 0 ? 'border-l-[#059669]' : 'border-l-[#dc2626]' },
            { label: 'Toplam Giderler',  value: fmt(expenses),    sub: 'Kesinti + operasyonel', color: 'border-l-[#d97706]' },
            { label: 'Vergi Matrahı',    value: fmt(matrah),      sub: 'Vergi öncesi kazanç', color: matrah >= 0 ? 'border-l-brand/30' : 'border-l-[#dc2626]' },
          ].map(k => (
            <div key={k.label} className={`bg-white border border-l-4 border-[#e2e8f0] ${k.color} rounded px-4 py-3`}>
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{k.label}</div>
              <div className="text-[10px] text-[#94a3b8]">{k.sub}</div>
              <div className="text-lg font-black tabular-nums text-[#0f172a] mt-1">{k.value}</div>
            </div>
          ))}
        </div>

        {/* 6-ay mini trend */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">6 Aylık Net Kâr Trendi</div>
          <div className="space-y-1.5">
            {monthYMs.map((ym, i) => {
              const ms      = historySummaries[i]
              const net     = Number(ms?.net_after_tax_try ?? 0)
              const rev     = Number(ms?.revenue_try ?? 0)
              const isCur   = ym === currentYM
              const barW    = rev > 0 ? Math.min(100, Math.abs(net / rev) * 100) : 0
              return (
                <div key={ym} className={`flex items-center gap-2 ${isCur ? 'font-bold' : ''}`}>
                  <span className="text-[10px] text-[#94a3b8] w-12 shrink-0">{fmtMonth(ym)}</span>
                  <div className="flex-1 h-3 bg-[#f1f5f9] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${net >= 0 ? 'bg-pos' : 'bg-neg'}`}
                      style={{ width: `${barW}%` }} />
                  </div>
                  <span className={`text-[10px] tabular-nums w-16 text-right shrink-0 ${net >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                    {fmt(net)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Cross-navigation */}
      <NarrativeFooter
        className="col-span-12 pt-1"
        narrative="Tahakkuk kârı gerçek nakit değildir — tahsilat hızı P&L ile nakit pozisyonu arasındaki açığı belirler."
        links={[
          { label: 'Satışlar',      href: '/dashboard/commercial?tab=sales' },
          { label: 'Giderler',      href: '/dashboard/operations?tab=expenses' },
          { label: 'Gelir Tablosu', href: '/dashboard/reports/income-statement' },
        ]}
      />
    </div>

    {/* Çok Dönemli Karşılaştırma */}
    {multiPeriodReport && (
      <MultiPeriodTable report={multiPeriodReport} />
    )}

    {/* Detaylı Analiz — deep panels, collapsed by default (load on demand) */}
    <DetailSection title="Detaylı Kâr/Zarar Analizi" subtitle="Marj trendi · EBITDA köprüsü · kârlılık kaynağı · gelir tanıma · bordro">
      {/* Kâr Marjı Trend Analizi */}
      <MarginTrendClient companyId={companyId} />
      {/* EBITDA Köprüsü & Faaliyet Kaldıracı */}
      <EbitdaBridgeClient companyId={companyId} />
      {/* Kârlılık Kaynağı Analizi */}
      <ProfitabilityAttributionClient companyId={companyId} />
      {/* Gelir Tanıma — Tahakkuk vs Nakit */}
      <RevenueRecognitionClient companyId={companyId} />
      {/* Maaş / Bordro Analitiği */}
      <PayrollAnalyticsClient companyId={companyId} />
    </DetailSection>
    </div>
  )
}
