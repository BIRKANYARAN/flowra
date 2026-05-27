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
import IncomeStatementClient     from '@/app/dashboard/finance/_tabs/_income/IncomeStatementClient'
import { PeriodCloseWizard }     from '@/app/dashboard/finance/_tabs/_period-close/PeriodCloseWizard'
import { ObservationRail }       from '@/app/dashboard/_shared/ObservationRail'
import { BorcYaslandirmaOzeti }  from '@/app/dashboard/finance/_shared/BorcYaslandirmaOzeti'
import { WorkingCapitalSection } from '@/app/dashboard/finance/_shared/WorkingCapitalSection'
import { RetainedEarningsService } from '@/lib/services/finance/retained-earnings.service'
import { BalanceSheetService }   from '@/lib/services/balance-sheet.service'
import { TaxService }            from '@/lib/services/tax.service'
import { FinanceService }        from '@/lib/services/finance.service'
import { PartnerService }        from '@/lib/services/partner.service'
import { PeriodService }         from '@/lib/services/period.service'
import { getCfoMetrics, getQuarterlyReport } from '@/lib/finance/financial-core'
import { getRiskEngineResult }   from '@/lib/finance/risk-engine'
import { detectDuplicates }      from '@/lib/engines/duplicate-detector'
import { GlReconciliationService } from '@/lib/services/ledger/gl-reconciliation.service'
import type { GlReconciliationReport, ReconciliationItem } from '@/lib/services/ledger/gl-reconciliation.service'
import { createClient }          from '@/lib/supabase-server'
import { fmtTRY, fmtPct, fmtDate, fmtCompact, fmtDateMed } from '@/lib/format'
import { makeRequestContext }    from '@/lib/logger'
import type { CfoMetrics }       from '@/lib/finance/cfo-metrics'
import type { QuarterResult }    from '@/lib/finance/financial-core'
import type { AccountingPeriod, PeriodCloseChecklist } from '@/types/dto'

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
    <div className={`flex items-center justify-between ${bold ? 'font-bold text-[#0f172a]' : 'text-[#64748b]'}`}>
      <span className="text-xs">{label}</span>
      <span className={`tabular-nums text-xs ${negative && value > 0 ? 'text-neg-text' : value < 0 ? 'text-neg-text' : ''}`}>
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
        <div className={`text-xs ${bold ? 'text-[#0f172a]' : 'text-[#334155]'}`}>{label}</div>
        <div className="text-[0.65rem] text-[#94a3b8]">{detail}</div>
      </div>
      <div className={`text-xs font-bold tabular-nums ${sign > 0 ? 'text-neg-text' : 'text-pos-text'}`}>
        {fmtTRY(amount)}
      </div>
    </div>
  )
}

// ── GL Mutabakat sub-component ────────────────────────────────────────────────

function ReconciliationStatusChip({ status }: { status: ReconciliationItem['status'] }) {
  const map: Record<ReconciliationItem['status'], { label: string; cls: string }> = {
    balanced:    { label: 'Dengeli',      cls: 'bg-pos-light text-pos-text border-pos-light' },
    discrepancy: { label: 'Uyuşmazlık',   cls: 'bg-neg-light text-neg-text border-neg-light' },
    no_gl_data:  { label: 'GL Verisi Yok', cls: 'bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]' },
    skipped:     { label: 'Atlandı',      cls: 'bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]' },
  }
  const { label, cls } = map[status]
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>
  )
}

function GlMutabakatRaporu({ report }: { report: GlReconciliationReport }) {
  const { all_balanced, discrepancy_count, trial_balance, items, gl_mode, status_label, total_discrepancy_try } = report

  const bannerCls = all_balanced
    ? 'bg-pos-light border-pos-light text-pos-text'
    : 'bg-neg-light border-neg-light text-neg-text'

  const modeLabel = gl_mode === 'parallel' ? 'Paralel'
    : gl_mode === 'shadow'   ? 'Shadow'
    : gl_mode === 'gl_primary' ? 'GL Primer' : gl_mode

  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            GL Mutabakat Raporu
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {report.period_label} · GL vs Operasyonel Tablolar
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]">
            Mod: {modeLabel}
          </span>
          <span className={`text-[10px] font-bold px-2 py-1 rounded border ${bannerCls}`}>
            {all_balanced ? '✓ Tüm hesaplar dengeli' : `⚠ ${discrepancy_count} uyuşmazlık tespit edildi`}
          </span>
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded px-3 py-2 border mb-3 text-xs font-semibold flex items-center justify-between ${bannerCls}`}>
        <span>{status_label}</span>
        {!all_balanced && total_discrepancy_try > 0 && (
          <span className="tabular-nums font-bold">Toplam fark: {fmtTRY(total_discrepancy_try)}</span>
        )}
      </div>

      {/* Trial Balance check */}
      <div className={`rounded px-3 py-2 border mb-3 text-xs ${
        trial_balance.is_balanced
          ? 'bg-pos-light border-pos-light text-pos-text'
          : 'bg-neg-light border-neg-light text-neg-text'
      }`}>
        <div className="flex items-center justify-between font-semibold mb-0.5">
          <span>Mizan Kontrolü (Çift Taraflı Kayıt)</span>
          <span className={trial_balance.is_balanced ? 'text-pos-text' : 'text-neg-text font-bold'}>
            {trial_balance.is_balanced ? '✓ Dengeli' : `⚠ Fark: ${fmtTRY(trial_balance.imbalance)}`}
          </span>
        </div>
        <div className="flex gap-4 text-[10px] opacity-80">
          <span>DR: {fmtTRY(trial_balance.total_debits)}</span>
          <span>CR: {fmtTRY(trial_balance.total_credits)}</span>
          <span>{trial_balance.entry_count} kayıt · {trial_balance.line_count} satır</span>
        </div>
      </div>

      {/* Items table */}
      {all_balanced ? (
        <div className="text-xs text-[#94a3b8] text-center py-3 bg-pos-light rounded border border-pos-light text-pos-text font-semibold">
          ✓ Uyuşmazlık yok — tüm hesaplar GL ile operasyonel tablolar arasında dengeli
        </div>
      ) : (
        <div className="border border-[#e2e8f0] rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hesap</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">GL</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Operasyonel</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Fark %</th>
                <th className="text-center px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {items.map((item) => (
                <tr key={item.label} className="hover:bg-[#f8fafc]/60">
                  <td className="px-3 py-2 text-[#334155] font-medium">
                    {item.label}
                    {item.notes && (
                      <div className="text-[10px] text-[#94a3b8] font-normal mt-0.5">{item.notes}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono text-[#0f172a]">
                    {item.gl_amount !== null ? fmtTRY(item.gl_amount) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono text-[#0f172a]">
                    {item.ops_amount !== null ? fmtTRY(item.ops_amount) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-mono ${
                    item.discrepancy_pct === null ? 'text-[#94a3b8]'
                    : Math.abs(item.discrepancy_pct) < 5 ? 'text-pos-text'
                    : Math.abs(item.discrepancy_pct) < 20 ? 'text-warn-text'
                    : 'text-neg-text'
                  }`}>
                    {item.discrepancy_pct !== null
                      ? `${item.discrepancy_pct >= 0 ? '+' : ''}${item.discrepancy_pct.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ReconciliationStatusChip status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-[#94a3b8]">
          {new Date(report.computed_at).toLocaleString('tr-TR')} itibarıyla hesaplandı
        </span>
        <Link
          href="/dashboard/cfo/reconciliation"
          className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2"
        >
          Detaylı mutabakat →
        </Link>
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

  // ── Error tracking — replaces silent sq() swallower ─────────────────────────
  // sqt() wraps sq() and records which services failed so the UI can show a
  // visible warning instead of silently rendering ₺0 everywhere.
  const loadErrors: string[] = []
  function sqt<T>(label: string, p: Promise<T>): Promise<T | null> {
    return p.catch(() => { loadErrors.push(label); return null })
  }

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

  // Last 3 months for duplicate detection (wider window catches cross-month dupes)
  const dupFrom = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) })()

  // Period close status — sequential (checklist needs period object)
  const periodData = await sqt('Dönem Durumu', (async (): Promise<{ period: AccountingPeriod; checklist: PeriodCloseChecklist } | null> => {
    const period = await PeriodService.getCurrent(companyId, supabase)
    if (!period) return null
    const checklist = await PeriodService.buildCloseChecklist(userId, companyId, period, supabase)
    return { period, checklist }
  })())

  const currentYear = parseInt(today.slice(0, 4), 10)

  const [balanceSheet, financialSummary, kdvResult, corporateTaxResult, partnerBalances, cfoMetrics, riskData, quarterlyReport, dupExpenses, retainedEarnings, glReconciliation] =
    await Promise.all([
      sqt('Bilanço',          BalanceSheetService.compute(userId, companyId, today, supabase)),
      sqt('Gelir Tablosu',    FinanceService.getFinancialSummary(userId, companyId, period, undefined, ctx)),
      sqt('KDV',              TaxService.getKdvNet(userId, companyId, period, ctx)),
      sqt('Kurumlar Vergisi', TaxService.getCorporateTax(userId, companyId, period, undefined, ctx)),
      sqt('Ortak Bakiyeleri', PartnerService.getPartnerBalances(userId, companyId, ctx)),
      getCfoMetrics(companyId, { from, to: today }).catch(() => ZERO_METRICS),
      getRiskEngineResult(companyId).catch(() => null),
      getQuarterlyReport(userId, companyId, new Date().getFullYear()).catch(() => ZERO_QUARTERLY),
      supabase
        .from('expenses')
        .select('id, expense_date, expense_type, amount_try, vendor_name, description')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', dupFrom)
        .neq('payment_status', 'cancelled')
        .then(r => r.data ?? []),
      RetainedEarningsService.getStatement(companyId, userId, supabase, currentYear).catch(() => null),
      sqt('GL Mutabakat', GlReconciliationService.compute(companyId, supabase, { fromDate: yearStart, toDate: today })),
    ])

  const duplicates = detectDuplicates(
    (dupExpenses as Array<{ id: string; expense_date: string; expense_type: string; amount_try: number; vendor_name?: string | null; description?: string | null }>)
      .map(e => ({ ...e, amount_try: Number(e.amount_try ?? 0) }))
  ).slice(0, 5) // cap at 5 warnings

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
      detail: `${pct(collectionRate, 0)} tahsilat oranı${collectionRate >= 85 ? ' — sağlıklı ✓' : ' — dönemde takip gerekli'}`,
    },
  ]

  const checksPassedCount = checks.filter(c => c.passed).length

  const gradeColor = {
    A: 'text-pos-text bg-pos-light border-pos-light',
    B: 'text-info-text bg-info-light border-info-light',
    C: 'text-warn-text bg-warn-light border-warn-light',
    D: 'text-warn-text bg-warn-light border-warn/20',
    F: 'text-neg-text bg-neg-light border-neg-light',
  }[healthScore.grade]

  // ── C4: Governance Confidence Narrative ────────────────────────────────────
  const governanceLines: string[] = []
  const failedChecks = checks.filter(c => !c.passed)

  if (checksPassedCount === checks.length && duplicates.length === 0) {
    governanceLines.push(
      'Tüm muhasebe kontrolleri geçti ve kopya masraf sinyali yok — bu dönemin verileri güvenilir.'
    )
  } else {
    if (failedChecks.length > 0) {
      governanceLines.push(
        `${failedChecks.length} muhasebe kontrolü başarısız: ${failedChecks.map(f => f.name).join(', ')} — finansal tablolar onaylanmadan dönemi kapatmayın.`
      )
    }
    if (duplicates.length > 0) {
      const highConf = duplicates.filter(d => d.confidence === 'high').length
      governanceLines.push(
        `${duplicates.length} potansiyel kopya masraf${highConf > 0 ? ` (${highConf} yüksek güven)` : ''} — gider doğruluğu teyit edilmeden dönem kârı kesinleştirilmemeli.`
      )
    }
  }

  if (periodData) {
    const endMs    = new Date(periodData.period.period_end + 'T00:00:00').getTime()
    const daysOver = Math.round((Date.now() - endMs) / 86_400_000)
    if (daysOver > 0 && periodData.period.status === 'open') {
      governanceLines.push(
        `Dönem ${daysOver} gün önce bitmesine rağmen hâlâ açık — kapanış gecikmesi denetim sürekliliğini zayıflatır.`
      )
    }
    if (periodData.period.status === 'locked') {
      governanceLines.push(
        'Dönem kilitlenmiş — denetim zinciri bu dönem için tamamlandı.'
      )
    }
  }

  if (loadErrors.length > 0) {
    governanceLines.push(
      `${loadErrors.join(', ')} ${loadErrors.length === 1 ? 'servisi' : 'servisleri'} yanıt vermedi — gösterilen değerler eksik olabilir, güven düzeyi düşük.`
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Period-close intelligence signals ──────────────────────────────────── */}
      <ObservationRail context="period-close" maxItems={3} />

      {/* ── Period Close Wizard — guided step-by-step close process ──────────── */}
      <PeriodCloseWizard periodId={periodData?.period.id} />

      {/* ── Veri yükleme hatası banner — yalnızca servis çağrıları başarısız olduğunda görünür ── */}
      {loadErrors.length > 0 && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-neg-light border border-neg-light rounded text-xs">
          <span className="text-neg text-base leading-none mt-0.5 shrink-0">⚠</span>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-neg-text">Bazı veriler yüklenemedi</span>
            <span className="text-neg ml-2">
              — {loadErrors.join(', ')} {loadErrors.length === 1 ? 'servisi' : 'servisleri'} yanıt vermedi.
              Gösterilen değerler eksik veya ₺0 olabilir.
            </span>
          </div>
          <a
            href="/dashboard/finance?tab=cfo"
            className="shrink-0 text-neg-text font-semibold hover:underline whitespace-nowrap"
          >
            Yenile →
          </a>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#94a3b8] mt-0.5">Finansal doğruluk ve dönem yönetimi — {fmtDate(today)}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/finance?tab=tax"
            className="text-xs font-semibold text-[#64748b] hover:text-[#1e293b] border border-[#e2e8f0] px-3 py-1.5 rounded hover:bg-[#f8fafc] transition-colors"
          >
            Vergi Merkezi →
          </Link>
        </div>
      </div>

      {/* Row 1: Health Score + Accuracy Checks */}
      <div className="grid grid-cols-3 gap-3">

        {/* Financial Health Score */}
        <div className={`border rounded p-4 flex flex-col items-center justify-center text-center ${gradeColor}`}>
          <div className="text-[0.65rem] font-black uppercase tracking-widest mb-1.5 opacity-60">
            Finansal Sağlık
          </div>
          <div className="text-4xl font-black">{healthScore.grade}</div>
          <div className="text-base font-bold mt-1 tabular-nums">{healthScore.score}/100</div>
          <div className="text-[0.65rem] mt-1.5 opacity-70">
            {healthScore.grade === 'A' ? 'Mükemmel' :
             healthScore.grade === 'B' ? 'İyi' :
             healthScore.grade === 'C' ? 'Orta' :
             healthScore.grade === 'D' ? 'Dikkat gerekli' : 'Kritik'}
          </div>
        </div>

        {/* Component scores */}
        <div className="border border-[#e2e8f0] rounded p-4 bg-white col-span-2 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
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
              <div key={row.label} className="flex items-center justify-between text-xs">
                <span className="text-[#64748b]">{row.label}</span>
                <span className={`font-bold tabular-nums ${row.ok ? 'text-pos-text' : 'text-neg'}`}>
                  {row.ok ? '✓' : '!'} {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Accounting Accuracy Checks */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Muhasebe Doğruluk Kontrolleri
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded ${
            checksPassedCount === checks.length
              ? 'bg-pos-light text-pos-text'
              : 'bg-warn-light text-warn-text'
          }`}>
            {checksPassedCount}/{checks.length} geçti
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {checks.map(c => (
            <div key={c.name} className={`rounded px-3 py-2 border flex items-start gap-2 ${
              c.passed
                ? 'bg-pos-light border-pos-light'
                : 'bg-neg-light border-neg-light'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${c.passed ? 'bg-pos' : 'bg-neg'}`} />
              <div>
                <div className={`text-xs font-semibold ${c.passed ? 'text-pos-text' : 'text-neg-text'}`}>{c.name}</div>
                <div className={`text-[0.65rem] mt-0.5 ${c.passed ? 'text-pos-text' : 'text-neg'}`}>{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Gelir Tablosu — Formal Income Statement ─────────────────────────── */}
      <IncomeStatementClient companyId={companyId} />

      {/* GL Mutabakat Raporu */}
      {glReconciliation && (
        <GlMutabakatRaporu report={glReconciliation} />
      )}

      {/* C4: Dönem Güvence Değerlendirmesi */}
      {governanceLines.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Dönem Güvence Değerlendirmesi</span>
            <span className="text-[9px] text-[#94a3b8]">Muhasebe bütünlüğü · Dönem süresi · Denetim sürekliliği</span>
          </div>
          <div className="space-y-0.5">
            {governanceLines.map((line, i) => (
              <div key={i} className="text-[11px] text-[#64748b] leading-snug">
                <span className="text-[#cbd5e1] mr-1.5">—</span>{line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Period Close Status */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem Kapanış Durumu</div>
          {periodData ? (
            <span className={`text-[10px] font-bold px-2 py-1 rounded ${
              periodData.period.status === 'locked' ? 'bg-[#f1f5f9] text-[#64748b]' :
              periodData.period.status === 'closed' ? 'bg-info-light text-info-text' :
              periodData.checklist.ready_to_close  ? 'bg-pos-light text-pos-text' :
              'bg-warn-light text-warn-text'
            }`}>
              {periodData.period.status === 'locked' ? 'KİLİTLİ' :
               periodData.period.status === 'closed' ? 'KAPALI' :
               periodData.checklist.ready_to_close   ? 'KAPATMAYA HAZIR' :
               'AKTİF DÖNEM'}
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-1 rounded bg-[#f1f5f9] text-[#94a3b8]">DÖNEM YOK</span>
          )}
        </div>

        {periodData ? (
          <>
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="text-xs text-[#64748b]">
                <span className="font-semibold text-[#334155]">
                  {fmtDateMed(periodData.period.period_start)}
                </span>
                <span className="mx-1.5 text-[#cbd5e1]">—</span>
                <span className="font-semibold text-[#334155]">
                  {fmtDateMed(periodData.period.period_end)}
                </span>
              </div>
              <span className="text-[10px] text-[#cbd5e1]">·</span>
              <span className="text-[10px] text-[#94a3b8] tabular-nums">
                Dönem Kârı: <span className={`font-bold ${periodData.period.period_profit_try >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmtTRY(periodData.period.period_profit_try)}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'bank_reconciled',        label: 'Banka Mutabakatı',   passed: periodData.checklist.bank_reconciled },
                { key: 'expenses_complete',      label: 'Giderler Tamamlandı', passed: periodData.checklist.expenses_complete },
                { key: 'tax_summary_approved',   label: 'Vergi Tipi Ataması', passed: periodData.checklist.tax_summary_approved },
                { key: 'balance_sheet_balanced', label: 'Bilanço Dengeli',    passed: periodData.checklist.balance_sheet_balanced },
              ].map(item => (
                <div key={item.key} className={`rounded px-3 py-2 border flex items-center gap-2 ${
                  item.passed
                    ? 'bg-pos-light border-pos-light'
                    : 'bg-warn-light border-warn-light'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.passed ? 'bg-pos' : 'bg-warn'}`} />
                  <span className={`text-[0.65rem] font-semibold ${item.passed ? 'text-pos-text' : 'text-warn-text'}`}>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={`text-[11px] font-semibold ${
                periodData.checklist.ready_to_close ? 'text-pos-text' : 'text-warn-text'
              }`}>
                {periodData.checklist.ready_to_close
                  ? '✓ Tüm kontroller geçti — dönem kapatılmaya hazır'
                  : `${[periodData.checklist.bank_reconciled, periodData.checklist.expenses_complete, periodData.checklist.tax_summary_approved, periodData.checklist.balance_sheet_balanced].filter(Boolean).length}/4 kontrol geçti`
                }
              </span>
              <Link
                href="/dashboard/cfo/period-close"
                className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2"
              >
                Dönem Kapat →
              </Link>
            </div>
          </>
        ) : (
          <div className="text-xs text-[#94a3b8] text-center py-3">
            Aktif muhasebe dönemi bulunamadı.{' '}
            <Link href="/dashboard/cfo/period-close" className="font-semibold text-brand-light hover:text-brand underline underline-offset-2">
              Yeni dönem aç →
            </Link>
          </div>
        )}
      </div>

      {/* Kopya Masraf Uyarıları — only shown when potential duplicates are found */}
      {duplicates.length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-warn-text">Kopya Masraf Uyarıları</div>
              <div className="text-[10px] text-warn mt-0.5">Son 3 ay — istatistiksel tespit · CFO onayı gerekli</div>
            </div>
            <span className="text-[9px] font-black uppercase tracking-wide bg-warn-light text-warn-text px-2 py-0.5 rounded border border-warn-light">
              {duplicates.filter(d => d.confidence === 'high').length} yüksek · {duplicates.filter(d => d.confidence === 'medium').length} orta
            </span>
          </div>
          <div className="space-y-2">
            {duplicates.map((d, i) => (
              <div key={i} className={`rounded px-3 py-2.5 border text-xs ${
                d.confidence === 'high'
                  ? 'bg-neg-light border-neg-light'
                  : 'bg-warn-light border-warn-light'
              }`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-black tabular-nums text-[#0f172a]">{fmtTRY(d.amount_try)}</span>
                    <span className="text-[#94a3b8]">·</span>
                    <span className="font-semibold text-[#334155]">{d.expense_type}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      d.confidence === 'high'
                        ? 'bg-neg-light text-neg-text'
                        : 'bg-warn-light text-warn-text'
                    }`}>
                      {d.confidence === 'high' ? 'Yüksek' : 'Orta'}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#64748b]">{d.rows.map(r => r.expense_date).join(' · ')}</span>
                </div>
                <div className="text-[10px] text-[#64748b] mt-1">{d.reason}</div>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-warn-text mt-2">
            → <Link href="/dashboard/operations?tab=expenses" className="font-semibold underline underline-offset-2">Masrafları incele</Link> · Duplikasyonları manuel olarak onaylayın veya silin
          </div>
        </div>
      )}

      {/* Row 3: Balance Sheet preview */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Bilanço Özeti — {fmtDate(today)}
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded ${
            bsBalanced ? 'bg-pos-light text-pos-text' : 'bg-warn-light text-warn-text'
          }`}>
            {bsBalanced ? 'DENGELENMIŞ' : 'FARK VAR'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {/* Assets */}
          <div>
            <div className="text-xs font-bold text-[#64748b] mb-2">AKTİFLER</div>
            <div className="space-y-1.5 text-xs">
              <BalanceLine label="Nakit"      value={balanceSheet?.assets.cash_try ?? 0} />
              <BalanceLine label="Alacaklar"  value={balanceSheet?.assets.receivables_try ?? 0} />
              <BalanceLine label="Stok"       value={balanceSheet?.assets.inventory_try ?? 0} />
              <div className="pt-1.5 border-t border-[#e2e8f0]">
                <BalanceLine label="TOPLAM AKTİF" value={balanceSheet?.assets.total_assets_try ?? 0} bold />
              </div>
            </div>
          </div>
          {/* Liabilities */}
          <div>
            <div className="text-xs font-bold text-[#64748b] mb-2">PASİFLER</div>
            <div className="space-y-1.5 text-xs">
              <BalanceLine label="Ortak Borçları"  value={balanceSheet?.liabilities.partner_loans_try ?? 0} negative />
              <BalanceLine label="Vergi Borcu"     value={balanceSheet?.liabilities.tax_payable_try ?? 0} negative />
              <div className="pt-1.5 border-t border-[#e2e8f0]">
                <BalanceLine label="TOPLAM PASİF" value={balanceSheet?.liabilities.total_liabilities_try ?? 0} bold negative />
              </div>
            </div>
          </div>
          {/* Equity */}
          <div>
            <div className="text-xs font-bold text-[#64748b] mb-2">ÖZKAYNAK</div>
            <div className="space-y-1.5 text-xs">
              <BalanceLine label="Ortak Sermayesi"  value={balanceSheet?.equity.total_partner_capital_try ?? 0} />
              <BalanceLine label="Geçmiş Yıl Karı"  value={balanceSheet?.equity.retained_earnings_try ?? 0} />
              <BalanceLine label="Dönem Kar/Zararı" value={balanceSheet?.equity.current_period_profit_try ?? 0} />
              <div className="pt-1.5 border-t border-[#e2e8f0]">
                <BalanceLine label="TOPLAM ÖZKAYNAK" value={balanceSheet?.equity.total_equity_try ?? 0} bold />
              </div>
            </div>
          </div>
        </div>
        {!bsBalanced && (
          <div className="mt-3 bg-warn-light border border-warn-light rounded px-3 py-2 text-xs text-warn-text">
            <strong>Fark:</strong> {fmt(balanceSheet?.imbalance_try ?? 0)} — Nakit pozisyonu yaklaşık hesaplanmaktadır.
          </div>
        )}
      </div>

      {/* Row 4: Tax Obligations + Receivable Aging */}
      <div className="grid grid-cols-2 gap-3">

        {/* Tax */}
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
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
            <div className="pt-2 border-t border-[#e2e8f0]">
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
            className="mt-3 block text-center text-xs font-semibold text-brand-light hover:text-brand"
          >
            Vergi detayı →
          </Link>
        </div>

        {/* Receivable aging */}
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            Alacak Yaşlandırma — Bugün İtibarıyla
          </div>
          <div className="space-y-2">
            {[
              { label: '0–30 gün (Cari)',    value: (riskData?.totalOutstanding ?? 0) - (riskData?.overdueTotal ?? 0), color: 'text-pos-text' },
              { label: '31–60 gün',          value: riskData?.overdue30Total ?? 0,                                   color: 'text-warn-text'   },
              { label: '60+ gün (Gecikmiş)', value: (riskData?.overdue60Total ?? 0) + (riskData?.overdue90Total ?? 0), color: 'text-neg-text'   },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <span className="text-[#64748b]">{row.label}</span>
                <span className={`font-bold ${row.color}`}>{fmt(row.value)}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-[#e2e8f0] flex items-center justify-between text-xs font-bold">
              <span className="text-[#334155]">Toplam Alacak</span>
              <span className="text-[#0f172a]">{fmt(riskData?.totalOutstanding ?? 0)}</span>
            </div>
          </div>
          <Link
            href="/dashboard/commercial?tab=collections"
            className="mt-3 block text-center text-xs font-semibold text-brand-light hover:text-brand"
          >
            Tahsilatlar →
          </Link>
        </div>
      </div>

      {/* Row 4b: AP Aging Summary */}
      <BorcYaslandirmaOzeti companyId={companyId} supabase={supabase} />

      {/* Row 5: P&L Summary */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Gelir Tablosu Özeti — {today.slice(0, 4)} YTD
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Satış Geliri',  value: revenue,                         color: 'text-[#0f172a]' },
            { label: 'SMST',          value: -(financialSummary?.cost_try ?? 0), color: 'text-neg-text' },
            { label: 'Brüt Kâr',     value: grossProfit,                     color: grossProfit >= 0 ? 'text-pos-text' : 'text-neg-text' },
            { label: 'Net Kâr (VD)', value: netAfterTax,                     color: netAfterTax >= 0 ? 'text-pos-text' : 'text-neg-text' },
          ].map(k => (
            <div key={k.label} className="text-center">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{k.label}</div>
              <div className={`text-base font-black tabular-nums ${k.color}`}>
                {fmtCompact(Math.abs(k.value))}
              </div>
              {k.label !== 'Satış Geliri' && (
                <div className="text-[10px] text-[#94a3b8]">{fmt(Math.abs(k.value))}</div>
              )}
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/finance?tab=pnl"
          className="mt-3 block text-center text-xs font-semibold text-brand-light hover:text-brand"
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
          if (prev === 0) return { text: '—', color: 'text-[#94a3b8]' }
          const p = ((curr - prev) / Math.abs(prev)) * 100
          return { text: `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, color: p >= 0 ? 'text-pos-text' : 'text-neg' }
        }
        const addDaysQ = (dateStr: string, n: number) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
        const fmtDateQ = fmtDateMed

        return (
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
              <div>
                <h2 className="text-xs font-black text-[#0f172a]">Çeyreklik Analitik — {currentYear}</h2>
                <p className="text-[10px] text-[#94a3b8] mt-0.5">YTD P&L · Çeyreklik performans · Geçici vergi takvimi</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-right">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8]">YTD Ciro</div>
                  <div className="text-xs font-black text-[#0f172a] tabular-nums">{fmtTRY(ytd.revenue)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8]">Net Kâr</div>
                  <div className={`text-xs font-black tabular-nums ${ytd.net_after_tax >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmtTRY(ytd.net_after_tax)}</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                    <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Çeyrek</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ciro</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-brand-light">Brüt Kâr</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Net Kâr</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Brüt Marj</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-warn">KV Matrahı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {qs.map((q: QuarterResult, i: number) => {
                    const prev = i > 0 ? qs[i - 1] : null
                    const revDelta = prev && prev.revenue > 0 ? deltaQ(q.revenue, prev.revenue) : null
                    const isFuture = !q.is_past_quarter && q.period.from > today
                    return (
                      <tr key={q.label} className={`hover:bg-[#f8fafc]/60 ${isFuture ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-2.5 font-black text-[#0f172a] text-xs">{q.label}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="font-mono font-bold text-[#0f172a]">{fmtTRY(q.revenue)}</div>
                          {revDelta && <div className={`text-[10px] font-semibold ${revDelta.color}`}>{revDelta.text}</div>}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${q.gross_profit >= 0 ? 'text-brand' : 'text-neg'}`}>{fmtTRY(q.gross_profit)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${q.net_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmtTRY(q.net_profit)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${q.gross_margin >= 0.3 ? 'text-pos-text' : q.gross_margin >= 0.1 ? 'text-warn-text' : 'text-neg'}`}>
                          {q.revenue > 0 ? fmtPctQ(q.gross_margin) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${q.matrah > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>{q.matrah > 0 ? fmtTRY(q.matrah) : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-brand-subtle/40 font-black border-t-2 border-brand/10">
                    <td className="px-4 py-2.5 text-brand font-black text-xs">YTD Toplam</td>
                    <td className="px-4 py-2.5 text-right font-mono font-black text-[#0f172a]">{fmtTRY(ytd.revenue)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.gross_profit >= 0 ? 'text-brand' : 'text-neg'}`}>{fmtTRY(ytd.gross_profit)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.net_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmtTRY(ytd.net_profit)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[#64748b]">{ytd.revenue > 0 ? fmtPctQ(ytd.gross_profit / ytd.revenue) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.matrah > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>{ytd.matrah > 0 ? fmtTRY(ytd.matrah) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Gecici vergi schedule if any */}
            {qs.some((q: QuarterResult) => q.gecici_vergi > 0) && (
              <div className="border-t border-[#e2e8f0]">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Geçici Vergi Takvimi {currentYear}</div>
                  <span className="text-xs font-bold text-warn-text bg-warn-light border border-warn-light px-2 py-0.5 rounded">Toplam {fmtTRY(ytd.total_gecici)}</span>
                </div>
                <div className="divide-y divide-[#f1f5f9]">
                  {qs.filter((q: QuarterResult) => q.gecici_vergi > 0 && q.gecici_due_date).map((q: QuarterResult) => {
                    if (!q.gecici_due_date) return null
                    const isPast   = q.gecici_due_date <= today
                    const isUrgent = !isPast && q.gecici_due_date <= addDaysQ(today, 30)
                    return (
                      <div key={q.label} className={`px-4 py-2.5 flex items-center justify-between gap-4 ${isUrgent ? 'bg-warn-light/40' : ''}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#1e293b]">{q.label} Geçici Vergi</span>
                            {isPast && <span className="text-[9px] bg-[#f1f5f9] text-[#94a3b8] px-1.5 py-0.5 rounded">Geçti</span>}
                            {isUrgent && !isPast && <span className="text-[9px] bg-warn-light text-warn-text font-bold px-1.5 py-0.5 rounded">30 gün içinde</span>}
                          </div>
                          <div className="text-[10px] text-[#94a3b8] mt-0.5">Son ödeme: {fmtDateQ(q.gecici_due_date)} · Matrah: {fmtTRY(q.matrah)}</div>
                        </div>
                        <div className={`text-xs font-black tabular-nums ${isPast ? 'text-[#94a3b8]' : isUrgent ? 'text-warn-text' : 'text-warn-text'}`}>{fmtTRY(q.gecici_vergi)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Çalışma Sermayesi — Working Capital Intelligence */}
      <WorkingCapitalSection
        companyId={companyId}
        userId={userId}
        supabase={supabase}
      />

      {/* Kâr/Zarar Dağılımı — Retained Earnings Roll-Forward */}
      {retainedEarnings && (() => {
        const re = retainedEarnings
        const discrepancyOk = re.discrepancy_try !== null && Math.abs(re.discrepancy_try) <= 100
        const discrepancyWarn = re.discrepancy_try !== null && Math.abs(re.discrepancy_try) > 100

        const rows = [
          { label: 'Açılış Geçmiş Yıl Karı',                          value: re.opening_retained_earnings_try, color: 'text-[#0f172a]'  },
          { label: `Dönem Net Kar/(Zararı) — ${currentYear}`,          value: re.net_income_try,                color: re.net_income_try >= 0 ? 'text-pos-text' : 'text-neg'   },
          { label: 'Yasal Yedek Akçe Ayrımı (TTK 519 — %5)',           value: -re.legal_reserve_transfer_try,   color: re.legal_reserve_transfer_try > 0 ? 'text-neg-text' : 'text-[#94a3b8]' },
          { label: 'Kâr Payı Dağıtımı (Onaylanmış)',                   value: -re.dividends_declared_try,       color: re.dividends_declared_try > 0 ? 'text-neg-text' : 'text-[#94a3b8]'    },
        ]

        return (
          <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                  Kâr/Zarar Dağılımı — Özkaynak Roll-Forward
                </div>
                <div className="text-[10px] text-[#94a3b8] mt-0.5">
                  {re.period_from} — {re.period_to} · TTK 519 Yasal Yedek Akçe
                </div>
              </div>
              {re.balance_sheet_equity_try !== null && (
                <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                  discrepancyOk
                    ? 'bg-pos-light border-pos-light text-pos-text'
                    : 'bg-warn-light border-warn-light text-warn-text'
                }`}>
                  {discrepancyOk ? '✓ Bilanço ile uyumlu' : '⚠ Fark var'}
                </span>
              )}
            </div>
            <div className="border border-[#e2e8f0] rounded overflow-hidden mb-3">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-[#f1f5f9]">
                  {rows.map((row, i) => (
                    <tr key={i} className="bg-white hover:bg-[#f8fafc]/60">
                      <td className="px-4 py-2 text-[#334155]">{row.label}</td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums ${row.color}`}>
                        {fmtTRY(row.value)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#f8fafc] border-t-2 border-[#e2e8f0]">
                    <td className="px-4 py-2.5 font-black text-[#0f172a]">Kapanış Geçmiş Yıl Karı</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black tabular-nums ${
                      re.closing_retained_earnings_try >= 0 ? 'text-pos-text' : 'text-neg'
                    }`}>
                      {fmtTRY(re.closing_retained_earnings_try)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {re.balance_sheet_equity_try !== null && (
              <div className={`rounded px-3 py-2 border text-xs ${
                discrepancyOk
                  ? 'bg-pos-light border-pos-light text-pos-text'
                  : 'bg-warn-light border-warn-light text-warn-text'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Bilanço Özkaynak Kontrolü</span>
                  <span className="font-mono font-bold tabular-nums">
                    {discrepancyOk ? '✓ Fark ≤ ₺100' : `Fark: ${fmtTRY(re.discrepancy_try ?? 0)}`}
                  </span>
                </div>
                <div className="text-[10px] mt-1 opacity-80">
                  Bilanço: {fmtTRY(re.balance_sheet_equity_try)} · Kapanış GYK: {fmtTRY(re.closing_retained_earnings_try)}
                </div>
                {discrepancyWarn && (
                  <div className="text-[10px] mt-1 font-semibold">
                    Nakit tahmini yöntemi nedeniyle fark oluşabilir — dönem kapanışında kontrol edin.
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* GL Tools */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#e2e8f0]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">GL Araçları</span>
        </div>
        <div className="grid grid-cols-5 divide-x divide-[#f1f5f9]">
          {[
            { href: '/dashboard/cfo/trial-balance',        title: 'Mizan',              desc: 'Hesap kodları ve bakiyeler',        tag: 'TB' },
            { href: '/dashboard/cfo/period-close',         title: 'Dönem Kapanışı',     desc: 'Kapat ve kilitle',                  tag: 'PC' },
            { href: '/dashboard/cfo/journal-entries',      title: 'Journal',            desc: 'Çift taraflı muhasebe denetim izi', tag: 'JE' },
            { href: '/dashboard/cfo/reconciliation',       title: 'GL Mutabakat',       desc: 'GL vs operasyonel tablo',           tag: 'RC' },
            { href: '/dashboard/cfo/bank-reconciliation',  title: 'Banka Mutabakat',    desc: 'Banka ekstresi eşleştirme',         tag: 'BK' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="px-4 py-3 hover:bg-[#f8fafc] transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[0.65rem] font-black text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0.5 rounded tabular-nums">{item.tag}</span>
                <span className="text-xs font-bold text-[#0f172a]">{item.title}</span>
              </div>
              <div className="text-[0.65rem] text-[#94a3b8]">{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Financial Reports */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#e2e8f0]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Finansal Raporlar</span>
        </div>
        <div className="grid grid-cols-4 divide-x divide-[#f1f5f9]">
          {[
            { href: '/dashboard/reports/income-statement', title: 'Gelir Tablosu',      desc: 'P&L — Brüt kâr, net kâr' },
            { href: '/dashboard/reports/balance-sheet',    title: 'Bilanço',            desc: 'Aktif = Pasif + Özkaynak' },
            { href: '/dashboard/reports/cash-flow',        title: 'Nakit Akışı',        desc: 'Faaliyet / Yatırım / Finansman' },
            { href: '/dashboard/reports/executive-summary',title: 'Yönetici Özeti',     desc: '1 sayfa PDF — CEO için' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="px-4 py-3 hover:bg-[#f8fafc] transition-colors">
              <div className="text-xs font-bold text-[#0f172a] mb-0.5">{item.title}</div>
              <div className="text-[0.65rem] text-[#94a3b8]">{item.desc}</div>
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#f1f5f9] border-t border-[#f1f5f9]">
          {[
            { href: '/dashboard/cfo/tax/kdv',       title: 'KDV Özeti',          desc: 'Hesaplanan − İndirilecek' },
            { href: '/dashboard/cfo/tax/corporate', title: 'Kurumlar Vergisi',   desc: 'Geçici vergi takvimi' },
            { href: '/dashboard/insights',           title: 'AI Analizler',       desc: 'Anomali ve kopya gider tespiti' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="px-4 py-3 hover:bg-[#f8fafc] transition-colors">
              <div className="text-xs font-bold text-[#0f172a] mb-0.5">{item.title}</div>
              <div className="text-[0.65rem] text-[#94a3b8]">{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
