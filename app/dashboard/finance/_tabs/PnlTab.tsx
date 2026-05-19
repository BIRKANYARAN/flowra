// ── PnlTab — Kâr / Zarar Tablosu ─────────────────────────────────────────────
//
// Accrual P&L statement for the current month with:
//   • Revenue waterfall (ciro → brüt kâr → giderler → EBITDA → net)
//   • KDV özeti (sales / purchase / expense / net)
//   • Tahsilat vs fatura delta
//   • Geçen aylar mini-trend (son 6 ay sparkline row)

import Link                  from 'next/link'
import { FinanceService }   from '@/lib/services/finance.service'
import { periodForMonth }   from '@/lib/services/finance-rules'
import { fmtTRY as fmt }   from '@/lib/format'
import { createClient }     from '@/lib/supabase-server'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmtFull(n: number): string {
  return (n < 0 ? '−' : '') + '₺' + TRY.format(Math.abs(n))
}
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
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names  = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[m - 1] ?? ym} ${String(y).slice(2)}`
}

// ── Waterfall row ─────────────────────────────────────────────────────────────

function WRow({ label, value, sub, isTotal, isDeduction, isSub }: {
  label: string; value: number; sub?: string
  isTotal?: boolean; isDeduction?: boolean; isSub?: boolean
}) {
  const labelClass = isTotal
    ? 'text-xs font-black text-gray-900'
    : isSub ? 'text-[11px] font-medium text-gray-400 pl-4'
    : 'text-xs font-semibold text-gray-600'
  const valueClass = isTotal
    ? `text-sm font-black ${value >= 0 ? 'text-pos-text' : 'text-neg'}`
    : isDeduction
    ? 'text-xs font-bold text-neg'
    : `text-xs font-bold ${value >= 0 ? 'text-gray-800' : 'text-neg'}`

  return (
    <div className={`flex items-center justify-between gap-2 py-1.5 ${isTotal ? 'border-t border-dashed border-[#e2e8f0] mt-1' : ''}`}>
      <div className="min-w-0">
        <span className={labelClass}>{label}</span>
        {sub && <span className="text-[9px] text-gray-400 ml-1.5">{sub}</span>}
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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function PnlTab({ userId, companyId }: Props) {
  const now  = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthYMs  = lastNMonths(6, now)
  const supabase  = createClient()

  const { from: monthFrom, to: monthTo } = periodForMonth(currentYM)

  function sq<T>(fn: () => Promise<T>, fb: T): Promise<T> { return fn().catch(() => fb) }

  const [currentSummary, expenseCatRaw, ...historySummaries] = await Promise.all([
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
  if (!s) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded text-center py-16 shadow-sm">
        <div className="w-8 h-8 rounded-full bg-gray-100 mx-auto mb-3 flex items-center justify-center">
          <span className="text-gray-400 text-sm font-bold">—</span>
        </div>
        <p className="text-gray-500 font-medium text-sm">Bu dönem için finansal veri bulunamadı.</p>
        <p className="text-gray-400 text-xs mt-1">Satış veya gider eklendiğinde gelir tablosu otomatik hesaplanır.</p>
      </div>
    )
  }

  const revenue      = Number(s.revenue_try              ?? 0)
  const cogs         = Number(s.cost_try                 ?? 0)
  const grossProfit  = Number(s.gross_profit_try         ?? 0)
  const expenses     = Number(s.expenses_total_try       ?? 0)
  const matrah       = Number(s.matrah_try               ?? 0)
  const netAfterTax  = Number(s.net_after_tax_try        ?? 0)
  const corpTax      = Number(s.corporate_tax_try        ?? 0)
  const salesVat     = Number(s.sales_vat_try            ?? 0)
  const purchaseVat  = Number(s.purchase_vat_try         ?? 0)
  const expenseVat   = Number(s.expense_vat_try          ?? 0)
  const netVat       = salesVat - purchaseVat - expenseVat
  const ebitda       = grossProfit - expenses

  // Month-over-month margin trend — historySummaries[4] = prior month, [5] = current
  const priorSummary    = historySummaries[historySummaries.length - 2] ?? null
  const priorRevenue    = Number(priorSummary?.revenue_try    ?? 0)
  const priorGrossProfit = Number(priorSummary?.gross_profit_try ?? 0)
  const currentMargin   = revenue > 0 ? grossProfit / revenue   : null
  const priorMargin     = priorRevenue > 0 ? priorGrossProfit / priorRevenue : null
  const marginDrop      = currentMargin !== null && priorMargin !== null && priorMargin > 0
    ? priorMargin - currentMargin
    : null

  return (
    <div className="space-y-4">

      {/* Month-over-month margin deterioration alert */}
      {marginDrop !== null && marginDrop > 0.10 && (
        <div className={`rounded border px-4 py-3 flex items-start gap-3 ${
          marginDrop > 0.20 ? 'bg-neg-light border-neg-light' : 'bg-warn-light border-warn-light'
        }`}>
          <span className="text-base mt-0.5">{marginDrop > 0.20 ? '🔴' : '⚠'}</span>
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

    <div className="grid grid-cols-12 gap-4">

      {/* ── Left: P&L Waterfall ─────────────────────────────────────────────── */}
      <div className="col-span-7 space-y-4">

        {/* Main waterfall */}
        <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
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
                <span className="text-[10px] text-gray-400 font-medium truncate">{label}</span>
                <span className="text-[10px] tabular-nums text-gray-500 font-semibold shrink-0">
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
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">KDV Özeti</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Hesaplanan KDV',   value: salesVat,    color: 'text-pos-text' },
              { label: '− İndirilecek KDV', value: purchaseVat + expenseVat, color: 'text-neg' },
              { label: 'Net KDV',           value: netVat,      color: netVat > 0 ? 'text-orange-700' : 'text-pos-text' },
            ].map(c => (
              <div key={c.label} className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">{c.label}</div>
                <div className={`text-sm font-black tabular-nums ${c.color}`}>{fmtFull(Math.abs(c.value))}</div>
                {c.label === 'Net KDV' && (
                  <div className={`text-[9px] mt-0.5 font-semibold ${netVat > 0 ? 'text-orange-600' : 'text-pos-text'}`}>
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
            { label: 'Brüt Kâr',        value: fmt(grossProfit), sub: `Marj: ${pct(grossProfit, revenue)}`, color: grossProfit >= 0 ? 'border-l-emerald-400' : 'border-l-red-400' },
            { label: 'Toplam Giderler',  value: fmt(expenses),    sub: 'Kesinti + operasyonel', color: 'border-l-amber-400' },
            { label: 'Vergi Matrahı',    value: fmt(matrah),      sub: 'Vergi öncesi kazanç', color: matrah >= 0 ? 'border-l-primary-400' : 'border-l-red-400' },
          ].map(k => (
            <div key={k.label} className={`bg-white border border-l-4 border-[#e2e8f0] ${k.color} rounded px-4 py-3`}>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{k.label}</div>
              <div className="text-[10px] text-gray-400">{k.sub}</div>
              <div className="text-lg font-black tabular-nums text-gray-900 mt-1">{k.value}</div>
            </div>
          ))}
        </div>

        {/* 6-ay mini trend */}
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">6 Aylık Net Kâr Trendi</div>
          <div className="space-y-1.5">
            {monthYMs.map((ym, i) => {
              const ms      = historySummaries[i]
              const net     = Number(ms?.net_after_tax_try ?? 0)
              const rev     = Number(ms?.revenue_try ?? 0)
              const isCur   = ym === currentYM
              const barW    = rev > 0 ? Math.min(100, Math.abs(net / rev) * 100) : 0
              return (
                <div key={ym} className={`flex items-center gap-2 ${isCur ? 'font-bold' : ''}`}>
                  <span className="text-[10px] text-gray-400 w-12 shrink-0">{fmtMonth(ym)}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
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
      <div className="col-span-12 flex items-center justify-between px-1 pt-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Bu görünüm cari ay tahakkuk bazlı P&amp;L&apos;i gösterir.
          PDF dışa aktarım için resmi raporu inceleyin.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/commercial?tab=sales" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Satışlar →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/operations?tab=expenses" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Giderler →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/reports/income-statement" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Gelir Tablosu →
          </Link>
        </div>
      </div>
    </div>
    </div>
  )
}
