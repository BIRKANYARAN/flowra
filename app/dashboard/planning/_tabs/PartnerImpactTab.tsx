// ── PartnerImpactTab — Planning hub / partner-impact tab ──────────────────────
//
// Server component: fetches current-month financials + equalization.
// Client island: interactive "simulate distribution" slider.
//
// Shows: distributable amount today, per-partner share (equalization +
// pro-rata), loan balances, and a slider to test hypothetical distributions.

import { createClient }    from '@/lib/supabase-server'
import { FinanceService }  from '@/lib/services/finance.service'
import { PartnerService }  from '@/lib/services/partner.service'
import { computeCashPosition } from '@/lib/finance/cash'
import Link                from 'next/link'
import { PartnerImpactClient } from './_partner-impact/PartnerImpactClient'

interface Props { companyId: string; userId: string }

const CORPORATE_TAX_RATE = 0.25

function currentMonthPeriod() {
  const now  = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to   = now.toISOString().slice(0, 10)
  return { from, to }
}

export async function PartnerImpactTab({ companyId, userId }: Props) {
  const supabase = createClient()
  const { from, to } = currentMonthPeriod()
  const todayISO = new Date().toISOString().slice(0, 10)

  // ── Parallel data fetch ────────────────────────────────────────────────────

  const [fsResult, eqResult, salesResult, expResult, trancheResult] = await Promise.allSettled([

    // Financial summary — for accrual net income
    FinanceService.getFinancialSummary(userId, companyId, { from, to }, undefined, undefined, supabase),

    // Equalization (no distributable → baseline contribution ratios)
    PartnerService.calculateEqualization(userId, companyId, undefined),

    // Cash-basis: paid sales in period
    supabase.from('sales')
      .select('total_try:total, payment_status, paid_at')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .gte('paid_at', from + 'T00:00:00Z')
      .lte('paid_at', to + 'T23:59:59Z'),

    // Cash-basis: paid + unpaid expenses
    supabase.from('expenses')
      .select('amount_try, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to),

    // Active loan tranches
    supabase.from('partner_loan_tranches')
      .select('partner_id, outstanding_try, annual_interest_rate, due_date, status')
      .eq('company_id', companyId)
      .eq('status', 'active'),
  ])

  // ── Derive values ──────────────────────────────────────────────────────────

  const fs = fsResult.status === 'fulfilled' ? fsResult.value : null
  const eq = eqResult.status === 'fulfilled' ? eqResult.value : null

  const salesRows = salesResult.status === 'fulfilled' ? (salesResult.value.data ?? []) : []
  const expRows   = expResult.status   === 'fulfilled' ? (expResult.value.data   ?? []) : []
  const tranches  = trancheResult.status === 'fulfilled' ? (trancheResult.value.data ?? []) : []

  const paymentsReceived = salesRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const paidExpenses     = expRows.filter(e => e.payment_status === 'paid').reduce((s, e) => s + Number(e.amount_try ?? 0), 0)
  const unpaidExpenses   = expRows.filter(e => e.payment_status !== 'paid').reduce((s, e) => s + Number(e.amount_try ?? 0), 0)

  const { cashBalance, cashDistributable } = computeCashPosition({ paymentsReceived, paidExpenses, unpaidExpenses })

  // Accrual net income (after estimated tax)
  const netIncome = fs ? fs.net_after_tax_try : 0

  // Legal reserve (TTK 519: 5% of profit, up to 20% of paid capital)
  const legalReserve = netIncome > 0 ? Math.round(netIncome * 0.05) : 0

  // Partners with their loan balances per tranche
  const partnerLoans: Record<string, number> = {}
  for (const t of tranches) {
    if (!t.partner_id) continue
    partnerLoans[t.partner_id] = (partnerLoans[t.partner_id] ?? 0) + Number(t.outstanding_try ?? 0)
  }

  // Equalization entries enriched with loan balance
  const enrichedEntries = (eq?.entries ?? []).map(e => ({
    ...e,
    loan_balance_try: partnerLoans[e.partner_id] ?? 0,
  }))

  const totalLoanBalance = enrichedEntries.reduce((s, e) => s + e.loan_balance_try, 0)

  // Next due tranche
  const nextDue = tranches
    .filter(t => t.due_date && t.due_date >= todayISO)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    [0] ?? null

  return (
    <div className="space-y-4">
      <PartnerImpactClient
        cashDistributable={cashDistributable}
        cashBalance={cashBalance}
        netIncome={netIncome}
        legalReserve={legalReserve}
        entries={enrichedEntries}
        totalLoanBalance={totalLoanBalance}
        nextDue={nextDue ? { due_date: nextDue.due_date!, outstanding_try: Number(nextDue.outstanding_try ?? 0) } : null}
        partnerCount={enrichedEntries.length}
        baselinePerUnit={eq?.baseline_per_unit ?? 0}
      />

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Ortak etki simülasyonu gerçek PCLE dağıtımıyla karşılaştırılmalı.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/planning?tab=debt-pressure" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Borç Baskısı →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/partners?tab=waterfall" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Geri Ödeme Planı →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=overview" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Finansal Özet →
          </Link>
        </div>
      </div>
    </div>
  )
}
