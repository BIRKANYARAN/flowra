// ── CFOTab — CFO Cockpit (Finance Hub sekmesi olarak) ────────────────────────
//
// Enterprise CFO cockpit içeriğini Finance Hub'ın 9. sekmesi olarak sunar.
// HTTP self-call yerine doğrudan servis çağrıları kullanır.
//
// Zones:
//   1. Financial Health Score + bileşen skorları
//   2. Muhasebe doğruluk kontrolleri
//   3. Bilanço özeti (3 kolon)
//   4. Vergi yükümlülükleri + alacak yaşlandırma
//   5. P&L özeti (4 KPI)
//   6. GL araçları linkleri (Mizan, Dönem, Journal)
//   7. Finansal raporlar linkleri

import Link                      from 'next/link'
import { BalanceSheetService }   from '@/lib/services/balance-sheet.service'
import { TaxService }            from '@/lib/services/tax.service'
import { FinanceService }        from '@/lib/services/finance.service'
import { PartnerService }        from '@/lib/services/partner.service'
import { getCfoMetrics, getQuarterlyReport } from '@/lib/finance/financial-core'
import { getRiskEngineResult }   from '@/lib/finance/risk-engine'
import { createClient }          from '@/lib/supabase-server'
import { fmtTRY, fmtPct, fmtDate, fmtCompact } from '@/lib/format'
import { makeRequestContext }    from '@/lib/logger'
import type { CfoMetrics }       from '@/lib/finance/cfo-metrics'
import type { QuarterResult }    from '@/lib/finance/financial-core'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sq<T>(p: Promise<T>): Promise<T | null> {
  try { return await p } catch { return null }
}

const fmt = (n: number | null | undefined) => fmtTRY(n ?? 0)
function pct(n: number | null | undefined, d = 1) { return fmtPct(n ?? 0, d) }

// ── Financial Health Score ────────────────────────────────────────────────────

function computeHealthScore(metrics: {
  grossMarginPct:    number
  netMarginPct:      number
  runwayMonths:      number | null
  debtToEquity:      number
  collectionRatePct: number
}): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  let score = 0

  if (metrics.grossMarginPct >= 30)      score += 25
  else if (metrics.grossMarginPct >= 15) score += 15
  else if (metrics.grossMarginPct >= 0)  score += 5

  if (metrics.netMarginPct >= 10)      score += 20
  else if (metrics.netMarginPct >= 5)  score += 12
  else if (metrics.netMarginPct >= 0)  score += 5

  const r = metrics.runwayMonths
  if (r === null || r > 18)     score += 25
  else if (r >= 6)              score += 18
  else if (r >= 3)              score += 10

  if (metrics.debtToEquity <= 0.5)    score += 15
  else if (metrics.debtToEquity <= 1) score += 10
  else if (metrics.debtToEquity <= 2) score += 5

  if (metrics.collectionRatePct >= 85)      score += 15
  else if (metrics.collectionRatePct >= 60) score += 8
  else if (metrics.collectionRatePct >= 0)  score += 3

  const grade: 'A' | 'B' | 'C' | 'D' | 'F' =
    score >= 85 ? 'A' :
    score >= 70 ? 'B' :
    score >= 55 ? 'C' :
    score >= 40 ? 'D' : 'F'

  return { score, grade }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BalanceLine({ label, value, bold, negative }: {
  label: string; value: number; bold?: boolean; negative?: boolean
}) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
      <span className="text-xs">{label}</span>
      <span className={`tabular-nums text-xs ${negative && value > 0 ? 'text-red-700' : value < 0 ? 'text-red-700' : ''}`}>
        {fmtTRY(value)}
      </span>
    </div>
  )
}

function TaxRow({ label, amount, sign, detail, bold }: {
  label: string; amount: number; sign: number; detail: string; bold?: boolean
}) {
  return (
    <div className={`flex items-start justify-between ${bold ? 'font-bold' : ''}`}>
      <div>
        <div className={`text-sm ${bold ? 'text-gray-900' : 'text-gray-700'}`}>{label}</div>
        <div className="text-[11px] text-gray-400">{detail}</div>
      </div>
      <div className={`text-sm font-bold tabular-nums ${sign > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
        {fmtTRY(amount)}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function CFOTab({ userId, companyId }: Props) {
  const supabase  = createClient()
  const today     = new Date().toISOString().slice(0, 10)
  const yearStart = today.slice(0, 4) + '-01-01'
  const year      = today.slice(0, 4)
  const mon       = String(new Date().getMonth() + 1).padStart(2, '0')
  const from      = `${year}-${mon}-01`
  const period    = { from: yearStart, to: today }
  const ctx       = makeRequestContext(userId)

  const ZERO_METRICS: CfoMetrics = {
    cash:        { true_cash_position: 0, operational_cash: 0, restricted_cash: 0, distributable_cash: 0 },
    burn:        { monthly_burn_rate: 0, runway_months: null, runway_days: null, cash_exhaustion_date: null },
    receivables: { total_outstanding: 0, overdue_30d: 0, overdue_60d: 0, overdue_90d: 0, collection_rate_pct: 100 },
    tax:         { kdv_net: 0, corporate_tax_estimate: 0, total_fiscal_obligation: 0 },
    partner:     { total_equity: 0, total_loans: 0, total_dividends: 0, company_owes: 0 },
    stock:       { fifo_value: 0, coverage_months: null },
  }

  const ZERO_QUARTERLY = {
    year: new Date().getFullYear(),
    quarters: [] as QuarterResult[],
    ytd: { revenue: 0, gross_profit: 0, net_profit: 0, matrah: 0, corporate_tax: 0, net_after_tax: 0, total_gecici: 0 },
  }

  const [balanceSheet, financialSummary, kdvResult, corporateTaxResult, partnerBalances, cfoMetrics, riskData, quarterlyReport] =
    await Promise.all([
      sq(BalanceSheetService.compute(userId, companyId, today, supabase)),
      sq(FinanceService.getFinancialSummary(userId, companyId, period, undefined, ctx)),
      sq(TaxService.getKdvNet(userId, companyId, period, ctx)),
      sq(TaxService.getCorporateTax(userId, companyId, period, undefined, ctx)),
      sq(PartnerService.getPartnerBalances(userId, companyId, ctx)),
      getCfoMetrics(companyId, { from, to: today }).catch(() => ZERO_METRICS),
      getRiskEngineResult(companyId).catch(() => null),
      getQuarterlyReport(userId, companyId, new Date().getFullYear()).catch(() => ZERO_QUARTERLY),
    ])

  // ── Derived metrics ─────────────────────────────────────────────────────────

  const revenue        = financialSummary?.revenue_try ?? 0
  const grossProfit    = financialSummary?.gross_profit_try ?? 0
  const netAfterTax    = financialSummary?.net_after_tax_try ?? 0
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const netMarginPct   = revenue > 0 ? (netAfterTax / revenue) * 100 : 0

  const totalPartnerLoans = (partnerBalances ?? []).reduce((s, b) => s + Math.max(0, b.net_loan_try), 0)
  const totalEquity       = balanceSheet?.equity.total_equity_try ?? 0
  const debtToEquity      = totalEquity > 0 ? totalPartnerLoans / totalEquity : 0

  // Use the canonical amount-based collection rate from cfoMetrics (period-filtered, amount-weighted).
  // Do NOT recompute locally from revenue - outstanding, which conflates FX differences and period scope.
  const collectionRate    = cfoMetrics.receivables.collection_rate_pct ?? 100
  const runwayMonths      = cfoMetrics.burn.runway_months

  const healthScore = computeHealthScore({
    grossMarginPct,
    netMarginPct,
    runwayMonths,
    debtToEquity,
    collectionRatePct: collectionRate,
  })

  // ── Accounting checks ───────────────────────────────────────────────────────

  const bsBalanced = balanceSheet?.balanced ?? false
  const fifoOk     = (balanceSheet?.assets.inventory_try ?? 0) >= 0
  const loansOk    = totalPartnerLoans >= 0

  const checks = [
    {
      name:   'Bilanço dengesi',
      passed: bsBalanced,
      detail: bsBalanced
        ? 'Aktif = Pasif + Özkaynak ✓'
        : `Fark: ${fmt(balanceSheet?.imbalance_try ?? 0)}`,
    },
    {
      name:   'FIFO stok bütünlüğü',
      passed: fifoOk,
      detail: fifoOk ? 'Negatif stok lot yok ✓' : 'Negatif stok lot var — kontrol edin',
    },
    {
      name:   'Ortak borç mutabakatı',
      passed: loansOk,
      detail: loansOk
        ? `Net borç: ${fmt(totalPartnerLoans)} ✓`
        : 'Negatif net borç — kontrol edin',
    },
    {
      name:   'Tahsilat oranı',
      passed: collectionRate >= 60,
      detail: `${pct(collectionRate, 0)} tahsilat oranı${collectionRate >= 85 ? ' — sağlıklı ✓' : ' — takip gerekli'}`,
    },
  ]

  const checksPassedCount = checks.filter(c => c.passed).length

  const gradeColor = {
    A: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    B: 'text-blue-700 bg-blue-50 border-blue-200',
    C: 'text-amber-700 bg-amber-50 border-amber-200',
    D: 'text-orange-700 bg-orange-50 border-orange-200',
    F: 'text-red-700 bg-red-50 border-red-200',
  }[healthScore.grade]

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mt-0.5">Finansal doğruluk ve dönem yönetimi — {fmtDate(today)}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/finance?tab=tax"
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-100 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Vergi Merkezi →
          </Link>
        </div>
      </div>

      {/* Row 1: Health Score + Accuracy Checks */}
      <div className="grid grid-cols-3 gap-3">

        {/* Financial Health Score */}
        <div className={`border rounded-xl p-4 flex flex-col items-center justify-center text-center ${gradeColor}`}>
          <div className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">
            Finansal Sağlık
          </div>
          <div className="text-6xl font-black">{healthScore.grade}</div>
          <div className="text-2xl font-bold mt-1">{healthScore.score}/100</div>
          <div className="text-[11px] mt-2 opacity-70">
            {healthScore.grade === 'A' ? 'Mükemmel' :
             healthScore.grade === 'B' ? 'İyi' :
             healthScore.grade === 'C' ? 'Orta' :
             healthScore.grade === 'D' ? 'Dikkat gerekli' : 'Kritik'}
          </div>
        </div>

        {/* Component scores */}
        <div className="border border-gray-100 rounded-xl p-4 bg-white col-span-2 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
            Bileşen Skorları
          </div>
          <div className="space-y-2">
            {[
              { label: 'Brüt Marj', value: pct(grossMarginPct), ok: grossMarginPct >= 15 },
              { label: 'Net Marj', value: pct(netMarginPct), ok: netMarginPct >= 5 },
              { label: 'Nakit Pisti', value: runwayMonths ? `${Math.round(runwayMonths)} ay` : '∞', ok: (runwayMonths ?? 99) >= 6 },
              { label: 'Borç/Özkaynak', value: debtToEquity.toFixed(2) + 'x', ok: debtToEquity <= 1 },
              { label: 'Tahsilat Oranı', value: pct(collectionRate, 0), ok: collectionRate >= 60 },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{row.label}</span>
                <span className={`font-bold ${row.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {row.ok ? '✓' : '!'} {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Accounting Accuracy Checks */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Muhasebe Doğruluk Kontrolleri
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            checksPassedCount === checks.length
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}>
            {checksPassedCount}/{checks.length} geçti
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {checks.map(c => (
            <div key={c.name} className={`rounded-lg px-3 py-2.5 border text-sm ${
              c.passed
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className={`font-semibold ${c.passed ? 'text-emerald-700' : 'text-red-700'}`}>
                {c.passed ? '✓' : '✗'} {c.name}
              </div>
              <div className={`text-[11px] mt-0.5 ${c.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                {c.detail}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Balance Sheet preview */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Bilanço Özeti — {fmtDate(today)}
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
            bsBalanced ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {bsBalanced ? 'DENGELENMIŞ' : 'FARK VAR'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {/* Assets */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">AKTİFLER</div>
            <div className="space-y-1.5 text-sm">
              <BalanceLine label="Nakit"      value={balanceSheet?.assets.cash_try ?? 0} />
              <BalanceLine label="Alacaklar"  value={balanceSheet?.assets.receivables_try ?? 0} />
              <BalanceLine label="Stok"       value={balanceSheet?.assets.inventory_try ?? 0} />
              <div className="pt-1.5 border-t border-gray-100">
                <BalanceLine label="TOPLAM AKTİF" value={balanceSheet?.assets.total_assets_try ?? 0} bold />
              </div>
            </div>
          </div>
          {/* Liabilities */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">PASİFLER</div>
            <div className="space-y-1.5 text-sm">
              <BalanceLine label="Ortak Borçları"  value={balanceSheet?.liabilities.partner_loans_try ?? 0} negative />
              <BalanceLine label="Vergi Borcu"     value={balanceSheet?.liabilities.tax_payable_try ?? 0} negative />
              <div className="pt-1.5 border-t border-gray-100">
                <BalanceLine label="TOPLAM PASİF" value={balanceSheet?.liabilities.total_liabilities_try ?? 0} bold negative />
              </div>
            </div>
          </div>
          {/* Equity */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">ÖZKAYNAK</div>
            <div className="space-y-1.5 text-sm">
              <BalanceLine label="Ortak Sermayesi"  value={balanceSheet?.equity.total_partner_capital_try ?? 0} />
              <BalanceLine label="Geçmiş Yıl Karı"  value={balanceSheet?.equity.retained_earnings_try ?? 0} />
              <BalanceLine label="Dönem Kar/Zararı" value={balanceSheet?.equity.current_period_profit_try ?? 0} />
              <div className="pt-1.5 border-t border-gray-100">
                <BalanceLine label="TOPLAM ÖZKAYNAK" value={balanceSheet?.equity.total_equity_try ?? 0} bold />
              </div>
            </div>
          </div>
        </div>
        {!bsBalanced && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            <strong>Fark:</strong> {fmt(balanceSheet?.imbalance_try ?? 0)} — Nakit pozisyonu yaklaşık hesaplanmaktadır.
          </div>
        )}
      </div>

      {/* Row 4: Tax Obligations + Receivable Aging */}
      <div className="grid grid-cols-2 gap-3">

        {/* Tax */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
            Vergi Yükümlülükleri ({today.slice(0, 4)})
          </div>
          <div className="space-y-2.5">
            <TaxRow
              label="KDV (Net)"
              amount={kdvResult?.net_vat_try ?? 0}
              sign={kdvResult?.net_vat_try ?? 0}
              detail={(kdvResult?.net_vat_try ?? 0) > 0 ? 'Ödenecek' : 'İade edilecek'}
            />
            <TaxRow
              label="Kurumlar Vergisi"
              amount={corporateTaxResult?.tax_try ?? 0}
              sign={corporateTaxResult?.tax_try ?? 0}
              detail="Tahmini yıllık vergi"
            />
            <div className="pt-2 border-t border-gray-100">
              <TaxRow
                label="Toplam Vergi Yükü"
                amount={(kdvResult?.net_vat_try ?? 0) + (corporateTaxResult?.tax_try ?? 0)}
                sign={1}
                detail="KDV + KV toplamı"
                bold
              />
            </div>
          </div>
          <Link
            href="/dashboard/finance?tab=tax"
            className="mt-3 block text-center text-xs font-semibold text-primary-600 hover:text-primary-700"
          >
            Vergi detayı →
          </Link>
        </div>

        {/* Receivable aging */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
            Alacak Yaşlandırma
          </div>
          <div className="space-y-2">
            {[
              { label: '0–30 gün (Cari)',    value: (riskData?.totalOutstanding ?? 0) - (riskData?.overdueTotal ?? 0), color: 'text-emerald-700' },
              { label: '31–60 gün',          value: riskData?.overdue30Total ?? 0,                                   color: 'text-amber-700'   },
              { label: '60+ gün (Gecikmiş)', value: (riskData?.overdue60Total ?? 0) + (riskData?.overdue90Total ?? 0), color: 'text-red-700'   },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{row.label}</span>
                <span className={`font-bold ${row.color}`}>{fmt(row.value)}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-sm font-bold">
              <span className="text-gray-700">Toplam Alacak</span>
              <span className="text-gray-900">{fmt(riskData?.totalOutstanding ?? 0)}</span>
            </div>
          </div>
          <Link
            href="/dashboard/commercial?tab=collections"
            className="mt-3 block text-center text-xs font-semibold text-primary-600 hover:text-primary-700"
          >
            Tahsilatlar →
          </Link>
        </div>
      </div>

      {/* Row 5: P&L Summary */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
          Gelir Tablosu Özeti — {today.slice(0, 4)} YTD
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Satış Geliri',  value: revenue,                         color: 'text-gray-900' },
            { label: 'SMST',          value: -(financialSummary?.cost_try ?? 0), color: 'text-red-700' },
            { label: 'Brüt Kâr',     value: grossProfit,                     color: grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700' },
            { label: 'Net Kâr (VD)', value: netAfterTax,                     color: netAfterTax >= 0 ? 'text-emerald-700' : 'text-red-700' },
          ].map(k => (
            <div key={k.label} className="text-center">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{k.label}</div>
              <div className={`text-lg font-black tabular-nums ${k.color}`}>
                {fmtCompact(Math.abs(k.value))}
              </div>
              {k.label !== 'Satış Geliri' && (
                <div className="text-[10px] text-gray-400">{fmt(Math.abs(k.value))}</div>
              )}
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/finance?tab=pnl"
          className="mt-3 block text-center text-xs font-semibold text-primary-600 hover:text-primary-700"
        >
          Detaylı P&L raporu →
        </Link>
      </div>

      {/* Quarterly Performance section */}
      {quarterlyReport && quarterlyReport.quarters.length > 0 && (() => {
        const qs  = quarterlyReport.quarters
        const ytd = quarterlyReport.ytd
        const currentYear = quarterlyReport.year
        function fmtPctQ(r: number): string {
          return `%${(r * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
        }
        function deltaQ(curr: number, prev: number) {
          if (prev === 0) return { text: '—', color: 'text-gray-400' }
          const p = ((curr - prev) / Math.abs(prev)) * 100
          return { text: `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, color: p >= 0 ? 'text-emerald-600' : 'text-red-600' }
        }
        const addDaysQ = (dateStr: string, n: number) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
        const fmtDateQ = (d: string) => { const [y, m, day] = d.split('-'); const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']; return `${day} ${months[Number(m)-1]} ${y}` }

        return (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-gray-800">Çeyreklik Analitik — {currentYear}</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">YTD P&L · Çeyreklik performans · Geçici vergi takvimi</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-right">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">YTD Ciro</div>
                  <div className="text-sm font-black text-gray-900 tabular-nums">{fmtTRY(ytd.revenue)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Net Kâr</div>
                  <div className={`text-sm font-black tabular-nums ${ytd.net_after_tax >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmtTRY(ytd.net_after_tax)}</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Çeyrek</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ciro</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-400">Brüt Kâr</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">Net Kâr</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Brüt Marj</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400">KV Matrahı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {qs.map((q: QuarterResult, i: number) => {
                    const prev = i > 0 ? qs[i - 1] : null
                    const revDelta = prev && prev.revenue > 0 ? deltaQ(q.revenue, prev.revenue) : null
                    const isFuture = !q.is_past_quarter && q.period.from > today
                    return (
                      <tr key={q.label} className={`hover:bg-gray-50/60 ${isFuture ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-2.5 font-black text-gray-900 text-xs">{q.label}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="font-mono font-bold text-gray-900">{fmtTRY(q.revenue)}</div>
                          {revDelta && <div className={`text-[10px] font-semibold ${revDelta.color}`}>{revDelta.text}</div>}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${q.gross_profit >= 0 ? 'text-primary-700' : 'text-red-600'}`}>{fmtTRY(q.gross_profit)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${q.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmtTRY(q.net_profit)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${q.gross_margin >= 0.3 ? 'text-emerald-600' : q.gross_margin >= 0.1 ? 'text-amber-600' : 'text-red-600'}`}>
                          {q.revenue > 0 ? fmtPctQ(q.gross_margin) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${q.matrah > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{q.matrah > 0 ? fmtTRY(q.matrah) : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-primary-50/40 font-black border-t-2 border-primary-100">
                    <td className="px-4 py-2.5 text-primary-800 font-black text-xs">YTD Toplam</td>
                    <td className="px-4 py-2.5 text-right font-mono font-black text-gray-900">{fmtTRY(ytd.revenue)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.gross_profit >= 0 ? 'text-primary-700' : 'text-red-600'}`}>{fmtTRY(ytd.gross_profit)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmtTRY(ytd.net_profit)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-500">{ytd.revenue > 0 ? fmtPctQ(ytd.gross_profit / ytd.revenue) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.matrah > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{ytd.matrah > 0 ? fmtTRY(ytd.matrah) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Gecici vergi schedule if any */}
            {qs.some((q: QuarterResult) => q.gecici_vergi > 0) && (
              <div className="border-t border-gray-100">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Geçici Vergi Takvimi {currentYear}</div>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Toplam {fmtTRY(ytd.total_gecici)}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {qs.filter((q: QuarterResult) => q.gecici_vergi > 0 && q.gecici_due_date).map((q: QuarterResult) => {
                    if (!q.gecici_due_date) return null
                    const isPast   = q.gecici_due_date <= today
                    const isUrgent = !isPast && q.gecici_due_date <= addDaysQ(today, 30)
                    return (
                      <div key={q.label} className={`px-4 py-2.5 flex items-center justify-between gap-4 ${isUrgent ? 'bg-amber-50/40' : ''}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-800">{q.label} Geçici Vergi</span>
                            {isPast && <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">Geçti</span>}
                            {isUrgent && !isPast && <span className="text-[9px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">30 gün içinde</span>}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Son ödeme: {fmtDateQ(q.gecici_due_date)} · Matrah: {fmtTRY(q.matrah)}</div>
                        </div>
                        <div className={`text-sm font-black tabular-nums ${isPast ? 'text-gray-400' : isUrgent ? 'text-amber-700' : 'text-amber-600'}`}>{fmtTRY(q.gecici_vergi)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* GL Tools */}
      <div className="grid grid-cols-4 gap-2">
        {[
          {
            href:  '/dashboard/cfo/trial-balance',
            title: 'Mizan',
            desc:  'Tüm hesap kodları ve bakiyeler',
            icon:  '📒',
            color: 'hover:border-primary-300',
          },
          {
            href:  '/dashboard/cfo/period-close',
            title: 'Dönem Kapanışı',
            desc:  'Dönemleri kapat ve kilitle',
            icon:  '🔒',
            color: 'hover:border-amber-300',
          },
          {
            href:  '/dashboard/cfo/journal-entries',
            title: 'Journal Kayıtları',
            desc:  'Çift taraflı muhasebe denetim izi',
            icon:  '📋',
            color: 'hover:border-emerald-300',
          },
          {
            href:  '/dashboard/cfo/reconciliation',
            title: 'GL Mutabakat',
            desc:  'GL vs operasyonel tablo karşılaştırması',
            icon:  '⚖️',
            color: 'hover:border-blue-300',
          },
        ].map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-start gap-3 transition-colors ${item.color}`}
          >
            <span className="text-xl mt-0.5">{item.icon}</span>
            <div>
              <div className="text-xs font-bold text-gray-900">{item.title}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Financial Reports */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Finansal Raporlar</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              href:  '/dashboard/reports/income-statement',
              title: 'Gelir Tablosu',
              desc:  'P&L — Brüt kâr, Faaliyet Kârı, net kâr',
              icon:  '📈',
              color: 'hover:border-emerald-300',
            },
            {
              href:  '/dashboard/reports/balance-sheet',
              title: 'Bilanço',
              desc:  'Varlıklar = Kaynaklar + Özkaynak',
              icon:  '⚖️',
              color: 'hover:border-blue-300',
            },
            {
              href:  '/dashboard/reports/cash-flow',
              title: 'Nakit Akışı',
              desc:  'Faaliyet / Yatırım / Finansman',
              icon:  '💧',
              color: 'hover:border-cyan-300',
            },
            {
              href:  '/dashboard/reports/executive-summary',
              title: 'Yönetici Özeti',
              desc:  '1 sayfa CEO raporu — PDF hazır',
              icon:  '📄',
              color: 'hover:border-primary-300',
            },
            {
              href:  '/dashboard/cfo/tax/kdv',
              title: 'KDV Özeti',
              desc:  'Hesaplanan − İndirilecek = Net KDV',
              icon:  '🧾',
              color: 'hover:border-orange-300',
            },
            {
              href:  '/dashboard/cfo/tax/corporate',
              title: 'Kurumlar Vergisi',
              desc:  'Geçici vergi takvimi + YTD KV tahmini',
              icon:  '🏛️',
              color: 'hover:border-amber-300',
            },
            {
              href:  '/dashboard/insights',
              title: 'AI Analizler',
              desc:  'Anomali tespiti, kopya giderler, AI özeti',
              icon:  '🤖',
              color: 'hover:border-purple-300',
            },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-start gap-3 transition-colors ${item.color}`}
            >
              <span className="text-xl mt-0.5">{item.icon}</span>
              <div>
                <div className="text-xs font-bold text-gray-900">{item.title}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
