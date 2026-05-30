// ═══════════════════════════════════════════════════════════════════════════════
// lib/engines/reconciliation.engine.ts — Master Shareholder Reconciliation Engine
//
// Computes all 19 sections from live Supabase data.
// Design rules:
//   • All queries scoped by company_id
//   • Promise.allSettled for parallel fetches — one failure never breaks all
//   • Every section has try/catch with sensible defaults
//   • All monetary amounts in TRY
//   • data_hash = SHA256(JSON.stringify(sections)) computed before return
// ═══════════════════════════════════════════════════════════════════════════════

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'
import { FinanceService } from '@/lib/services/finance.service'
import { TaxService } from '@/lib/services/tax.service'
import type {
  ReconciliationData,
  ReconSection1_CompanyIdentity,
  ReconSection2_Treasury,
  ReconSection3_Receivables,
  ReconSection4_Payables,
  ReconSection5_Inventory,
  ReconSection6_FixedAssets,
  ReconSection7_TaxPosition,
  ReconSection8_Financing,
  ReconSection9_EquityStructure,
  ReconSection10_PartnerReceivables,
  ReconSection11_PartnerLiabilities,
  ReconSection12_DebtTranches,
  ReconSection13_Distributions,
  ReconSection14_BalanceSheet,
  ReconSection15_PnL,
  ReconSection16_GovernanceRisks,
  ReconSection17_ManagementDeclaration,
  ReconSection18_ShareholderDeclaration,
  ReconSection19_Signoffs,
  GovernanceFinding,
  ConfidenceFactor,
  FinancialValidation,
  ValidationCheck,
  ValidationResult,
  ShareholderPosition,
  ShareholderPositionSummary,
  GovernanceExecutiveSummary,
  ConfidenceScoreV2,
} from '@/types/reconciliation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Helpers ───────────────────────────────────────────────────────────────────

function r2(n: number): number { return Math.round(n * 100) / 100 }

/** Days between two YYYY-MM-DD date strings */
function daysBetween(dateA: string, dateB: string): number {
  return Math.floor((new Date(dateB).getTime() - new Date(dateA).getTime()) / 86_400_000)
}

/** Settle a promise and return its value or a fallback */
async function settle<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p } catch { return fallback }
}

// ── Section builders ──────────────────────────────────────────────────────────

async function buildSection1(
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection1_CompanyIdentity> {
  const { data } = await supabase
    .from('companies')
    .select('name, tax_id, tax_office, mersis_no, address, phone, email, website')
    .eq('id', companyId)
    .maybeSingle()

  const periodLabel = asOfDate.slice(0, 7) // YYYY-MM

  return {
    company_name:        data?.name         ?? 'Bilinmiyor',
    tax_number:          data?.tax_id       ?? null,
    tax_office:          data?.tax_office   ?? null,
    mersis_no:           data?.mersis_no    ?? null,
    trade_registry:      null,
    address:             data?.address      ?? null,
    phone:               data?.phone        ?? null,
    email:               data?.email        ?? null,
    website:             data?.website      ?? null,
    reconciliation_date: asOfDate,
    period_label:        periodLabel,
  }
}

async function buildSection2(
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection2_Treasury> {
  // Compute cash via balance sheet logic: collected sales - paid expenses + partner flows
  const asOfTs = asOfDate + 'T23:59:59.999Z'

  const [salesResult, expensesResult, partnerFlowsResult] = await Promise.allSettled([
    supabase
      .from('sales')
      .select('total_try:total, paid_amount, payment_status')
      .eq('company_id', companyId)
      .in('payment_status', ['paid', 'partial'])
      .is('deleted_at', null)
      .lte('sale_date', asOfDate),

    supabase
      .from('expenses')
      .select('amount_try')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .lte('expense_date', asOfDate),

    supabase
      .from('partner_transactions')
      .select('tx_type, amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .lte('tx_date', asOfTs),
  ])

  let collected = 0
  if (salesResult.status === 'fulfilled') {
    for (const s of (salesResult.value.data ?? [])) {
      if (s.payment_status === 'paid') collected += Number(s.total_try ?? 0)
      else collected += Number(s.paid_amount ?? 0)
    }
  }

  let paidExp = 0
  if (expensesResult.status === 'fulfilled') {
    paidExp = (expensesResult.value.data ?? []).reduce(
      (sum: number, e: { amount_try: number }) => sum + Number(e.amount_try ?? 0), 0
    )
  }

  let partnerIn = 0
  let partnerOut = 0
  if (partnerFlowsResult.status === 'fulfilled') {
    for (const tx of (partnerFlowsResult.value.data ?? [])) {
      const amt = Number(tx.amount_try ?? 0)
      switch (tx.tx_type) {
        case 'capital_in':
        case 'loan_to_company':
        case 'loan_in':
          partnerIn += amt; break
        case 'loan_repayment':
        case 'loan_out':
        case 'dividend':
        case 'salary':
        case 'board_fee':
          partnerOut += amt; break
      }
    }
  }

  const cashEstimate = r2(Math.max(0, collected - paidExp + partnerIn - partnerOut))

  return {
    total_cash_try:      cashEstimate,
    available_cash_try:  cashEstimate,
    restricted_cash_try: 0,
    bank_accounts: [],
    fx_exposure:   [],
    treasury_note: 'Nakit pozisyonu tahmini olarak hesaplanmıştır (banka ekstresi girilmemiş).',
  }
}

async function buildSection3(
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection3_Receivables> {
  const { data: rows } = await supabase
    .from('sales')
    .select('total:total_try, paid_amount, payment_status, sale_date, customers(name)')
    .eq('company_id', companyId)
    .in('payment_status', ['pending', 'partial', 'overdue'])
    .is('deleted_at', null)
    .lte('sale_date', asOfDate)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sales: any[] = rows ?? []
  let total = 0
  const aging = { bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90plus: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerMap: Record<string, { outstanding: number; oldest_days: number; status: string }> = {}
  let overdue = 0

  for (const s of sales) {
    const outstanding = r2(Math.max(0, Number(s.total ?? 0) - Number(s.paid_amount ?? 0)))
    if (outstanding <= 0) continue
    total += outstanding

    const days = daysBetween(s.sale_date ?? asOfDate, asOfDate)
    if      (days <= 30)  aging.bucket_0_30   += outstanding
    else if (days <= 60)  aging.bucket_31_60  += outstanding
    else if (days <= 90)  aging.bucket_61_90  += outstanding
    else                { aging.bucket_90plus += outstanding; overdue += outstanding }

    const cname = s.customers?.name ?? 'Bilinmeyen Müşteri'
    if (!customerMap[cname]) customerMap[cname] = { outstanding: 0, oldest_days: 0, status: s.payment_status }
    customerMap[cname].outstanding += outstanding
    if (days > customerMap[cname].oldest_days) customerMap[cname].oldest_days = days
  }

  const topCustomers = Object.entries(customerMap)
    .sort(([, a], [, b]) => b.outstanding - a.outstanding)
    .slice(0, 5)
    .map(([name, v]) => ({ name, outstanding: r2(v.outstanding), oldest_days: v.oldest_days, status: v.status }))

  const maxCustomer = topCustomers[0]?.outstanding ?? 0
  const concentrationPct = total > 0 ? r2((maxCustomer / total) * 100) : 0

  return {
    total_receivables_try:   r2(total),
    overdue_receivables_try: r2(overdue),
    aging,
    top_customers:           topCustomers,
    doubtful_try:            r2(aging.bucket_90plus * 0.5), // 50% provision estimate
    concentration_pct:       concentrationPct,
    collection_risk_note:    overdue > 0 ? `${r2(overdue)} TRY tutarında 90+ gün gecikmiş alacak mevcut.` : null,
  }
}

async function buildSection4(
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection4_Payables> {
  const { data: rows } = await supabase
    .from('expenses')
    .select('amount_try, expense_date, payment_status, vendor_name, due_date')
    .eq('company_id', companyId)
    .in('payment_status', ['pending', 'overdue'])
    .is('deleted_at', null)
    .lte('expense_date', asOfDate)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenses: any[] = rows ?? []
  let total = 0
  const aging = { bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90plus: 0 }
  const now = new Date(asOfDate)
  const d7  = new Date(asOfDate); d7.setDate(d7.getDate()   + 7)
  const d30 = new Date(asOfDate); d30.setDate(d30.getDate() + 30)
  let upcoming7  = 0
  let upcoming30 = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supplierMap: Record<string, { balance: number; due_date?: string }> = {}

  for (const e of expenses) {
    const amt = Number(e.amount_try ?? 0)
    total += amt

    const days = daysBetween(e.expense_date ?? asOfDate, asOfDate)
    if      (days <= 30)  aging.bucket_0_30   += amt
    else if (days <= 60)  aging.bucket_31_60  += amt
    else if (days <= 90)  aging.bucket_61_90  += amt
    else                  aging.bucket_90plus += amt

    if (e.due_date) {
      const dueDate = new Date(e.due_date)
      if (dueDate >= now && dueDate <= d7)  upcoming7  += amt
      if (dueDate >= now && dueDate <= d30) upcoming30 += amt
    }

    const vendor = e.vendor_name ?? 'Bilinmeyen Tedarikçi'
    if (!supplierMap[vendor]) supplierMap[vendor] = { balance: 0, due_date: e.due_date ?? undefined }
    supplierMap[vendor].balance += amt
  }

  const topSuppliers = Object.entries(supplierMap)
    .sort(([, a], [, b]) => b.balance - a.balance)
    .slice(0, 5)
    .map(([name, v]) => ({ name, balance: r2(v.balance), due_date: v.due_date }))

  return {
    total_payables_try: r2(total),
    aging,
    upcoming_7d_try:    r2(upcoming7),
    upcoming_30d_try:   r2(upcoming30),
    top_suppliers:      topSuppliers,
    critical_note:      aging.bucket_90plus > 0
      ? `${r2(aging.bucket_90plus)} TRY vadesi 90+ gün geçmiş borç mevcut.`
      : null,
  }
}

async function buildSection5(
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection5_Inventory> {
  const [lotsResult, productsResult] = await Promise.allSettled([
    supabase
      .from('stock_lots')
      .select('qty_remaining, cost_price_try, received_at, product_id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0)
      .lte('received_at', asOfDate),

    supabase
      .from('products')
      .select('id, name, stock_qty, stock_alert_qty')
      .eq('company_id', companyId)
      .is('deleted_at', null),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lots: any[]     = lotsResult.status === 'fulfilled'     ? (lotsResult.value.data ?? [])     : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products: any[] = productsResult.status === 'fulfilled' ? (productsResult.value.data ?? []) : []

  let totalInventoryTry = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lotByProduct: Record<string, { qty: number; cost: number }> = {}

  for (const lot of lots) {
    const qty  = Number(lot.qty_remaining ?? 0)
    const cost = Number(lot.cost_price_try ?? 0)
    totalInventoryTry += qty * cost
    const pid = lot.product_id ?? 'unknown'
    if (!lotByProduct[pid]) lotByProduct[pid] = { qty: 0, cost }
    lotByProduct[pid].qty += qty
  }

  let criticalCount = 0
  const topItems = products
    .filter((p: { id: string }) => lotByProduct[p.id])
    .map((p: { id: string; name: string; stock_qty: number; stock_alert_qty: number | null }) => {
      const lot = lotByProduct[p.id] ?? { qty: 0, cost: 0 }
      const totalValue = r2(lot.qty * lot.cost)
      const isCritical = p.stock_alert_qty != null && lot.qty <= p.stock_alert_qty
      if (isCritical) criticalCount++
      return {
        name:        p.name,
        qty:         lot.qty,
        unit_cost:   r2(lot.cost),
        total_value: totalValue,
        stock_alert: p.stock_alert_qty ?? undefined,
      }
    })
    .sort((a: { total_value: number }, b: { total_value: number }) => b.total_value - a.total_value)
    .slice(0, 10)

  const latestLot = lots.sort((a: { received_at: string }, b: { received_at: string }) =>
    b.received_at > a.received_at ? 1 : -1
  )[0]

  return {
    total_inventory_try:  r2(totalInventoryTry),
    item_count:           products.length,
    critical_stock_count: criticalCount,
    top_items:            topItems,
    turnover_note:        null,
    last_count_date:      latestLot?.received_at ?? null,
  }
}

async function buildSection6(): Promise<ReconSection6_FixedAssets> {
  // Fixed assets are not yet tracked in Flowra — phase 2 placeholder
  return {
    total_gross_try:          0,
    accumulated_depreciation: 0,
    net_carrying_value:       0,
    assets: [],
    note: 'Sabit kıymetler henüz sisteme girilmemiştir. Manuel giriş gereklidir.',
  }
}

async function buildSection7(
  userId:    string,
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection7_TaxPosition> {
  const yearStart = asOfDate.slice(0, 4) + '-01-01'
  const period    = { from: yearStart, to: asOfDate }

  const [vatResult, corpTaxResult] = await Promise.allSettled([
    TaxService.getKdvNet(userId, companyId, period, undefined, supabase),
    TaxService.getCorporateTax(userId, companyId, period, undefined, undefined, supabase),
  ])

  const vat     = vatResult.status     === 'fulfilled' ? vatResult.value     : null
  const corpTax = corpTaxResult.status === 'fulfilled' ? corpTaxResult.value : null

  const kdvOutput = Number(vat?.sales_vat_try        ?? 0)
  const kdvInput  = Number((vat?.purchase_vat_try ?? 0) + (vat?.expense_vat_try ?? 0))
  const netKdv    = Number(vat?.net_vat_try          ?? 0)
  const corpTaxAmt = r2(Math.max(0, Number(corpTax?.tax_try ?? 0)))

  return {
    kdv_output_try:       r2(kdvOutput),
    kdv_input_try:        r2(kdvInput),
    net_kdv_try:          r2(netKdv),
    corporate_tax_try:    corpTaxAmt,
    withholding_try:      0,
    overdue_tax_try:      0,
    pending_declarations: [],
    sgk_obligation_try:   0,
    note: 'KDV ve kurumlar vergisi cari yıl baz alınarak hesaplanmıştır.',
  }
}

async function buildSection8(): Promise<ReconSection8_Financing> {
  // External bank/leasing financing not tracked in Flowra core tables yet
  return {
    total_debt_try: 0,
    items: [],
    note: 'Banka kredileri ve finansal kiralama henüz sisteme girilmemiştir. Manuel giriş gereklidir.',
  }
}

async function buildSection9(
  companyId: string,
  supabase:  AnyClient,
): Promise<ReconSection9_EquityStructure> {
  const { data: partners } = await supabase
    .from('partners')
    .select('id, name, share_pct')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('share_pct', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = partners ?? []

  // Compute total capital from partner_finance_events (CAPITAL_IN events)
  const { data: capitalEvents } = await supabase
    .from('partner_finance_events')
    .select('partner_id, amount_try')
    .eq('company_id', companyId)
    .eq('event_type', 'capital_in')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capitalByPartner: Record<string, number> = {}
  for (const ev of (capitalEvents ?? [])) {
    capitalByPartner[ev.partner_id] = (capitalByPartner[ev.partner_id] ?? 0) + Number(ev.amount_try ?? 0)
  }

  let totalCapital = 0
  const shareholders = rows.map((p: { id: string; name: string; share_pct: number }) => {
    const paid = r2(capitalByPartner[p.id] ?? 0)
    totalCapital += paid
    return {
      name:              p.name,
      ownership_pct:     Number(p.share_pct ?? 0),
      paid_capital_try:  paid,
      equity_value_try:  paid, // simplified — equals capital until retained earnings tracked
    }
  })

  return {
    total_capital_try: r2(totalCapital),
    shareholders,
  }
}

async function buildSection10(
  companyId: string,
  supabase:  AnyClient,
): Promise<ReconSection10_PartnerReceivables> {
  // Partner loans TO the company (company owes partners)
  const { data: tranches } = await supabase
    .from('partner_loan_tranches')
    .select('id, partner_id, principal_try, total_repaid_try, interest_rate_annual_pct, expected_repayment_date, status, partners(name, share_pct)')
    .eq('company_id', companyId)
    .in('status', ['active', 'partially_repaid', 'overdue'])
    .is('deleted_at', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = tranches ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerMap: Record<string, any> = {}

  for (const t of rows) {
    const pid     = t.partner_id
    const name    = t.partners?.name      ?? 'Bilinmeyen'
    const share   = Number(t.partners?.share_pct ?? 0)
    const loan    = Number(t.principal_try  ?? 0)
    const repaid  = Number(t.total_repaid_try ?? 0)
    const rate    = Number(t.interest_rate_annual_pct ?? 0)
    const outstanding = r2(Math.max(0, loan - repaid))

    if (!partnerMap[pid]) {
      partnerMap[pid] = {
        partner_id:       pid,
        partner_name:     name,
        ownership_pct:    share,
        loan_total_try:   0,
        repaid_try:       0,
        accrued_interest: 0,
        outstanding_try:  0,
        maturity_profile: t.expected_repayment_date ?? null,
      }
    }
    partnerMap[pid].loan_total_try   += loan
    partnerMap[pid].repaid_try       += repaid
    partnerMap[pid].outstanding_try  += outstanding
    // Simplified accrued interest estimate (1 month at annual rate)
    partnerMap[pid].accrued_interest += r2(outstanding * (rate / 100) / 12)
  }

  const partners = Object.values(partnerMap).map((p) => ({
    ...p,
    loan_total_try:   r2(p.loan_total_try),
    outstanding_try:  r2(p.outstanding_try),
    accrued_interest: r2(p.accrued_interest),
  }))

  const total = r2(partners.reduce((s, p) => s + p.outstanding_try, 0))

  return {
    total_partner_loans_try: total,
    partners,
  }
}

async function buildSection11(
  companyId: string,
  supabase:  AnyClient,
): Promise<ReconSection11_PartnerLiabilities> {
  // Amounts partners OWE the company — reverse loan flows (loan_out events)
  const { data: events } = await supabase
    .from('partner_finance_events')
    .select('partner_id, amount_try, event_type, partners(name)')
    .eq('company_id', companyId)
    .in('event_type', ['loan_out', 'loan_to_partner'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = events ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerMap: Record<string, { name: string; outstanding: number }> = {}

  for (const ev of rows) {
    const pid  = ev.partner_id
    const name = ev.partners?.name ?? 'Bilinmeyen'
    if (!partnerMap[pid]) partnerMap[pid] = { name, outstanding: 0 }
    partnerMap[pid].outstanding += Number(ev.amount_try ?? 0)
  }

  const partners = Object.values(partnerMap)
    .filter(p => p.outstanding > 0)
    .map(p => ({
      partner_name:    p.name,
      outstanding_try: r2(p.outstanding),
      repayment_note:  null,
    }))

  return {
    total_partner_debt_try: r2(partners.reduce((s, p) => s + p.outstanding_try, 0)),
    partners,
  }
}

async function buildSection12(
  companyId: string,
  supabase:  AnyClient,
): Promise<ReconSection12_DebtTranches> {
  const { data: tranches } = await supabase
    .from('partner_loan_tranches')
    .select('id, partner_id, principal_try, total_repaid_try, interest_rate_annual_pct, disbursement_date, expected_repayment_date, status, partners(name)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('disbursement_date', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = tranches ?? []
  let totalTry = 0

  const trancheList = rows.map((t, idx) => {
    const remaining = r2(Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0)))
    totalTry += remaining
    return {
      partner_name:  t.partners?.name ?? 'Bilinmeyen',
      tranche_label: `Dilim #${idx + 1} (${t.disbursement_date ?? '—'})`,
      opening_try:   Number(t.principal_try ?? 0),
      remaining_try: remaining,
      interest_rate: Number(t.interest_rate_annual_pct ?? 0),
      maturity_date: t.expected_repayment_date ?? null,
      priority:      idx + 1,
      status:        t.status ?? 'active',
    }
  })

  return {
    total_tranches_try: r2(totalTry),
    tranches:           trancheList,
  }
}

async function buildSection13(
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection13_Distributions> {
  const { data: events } = await supabase
    .from('partner_finance_events')
    .select('amount_try, event_date, event_type, description')
    .eq('company_id', companyId)
    .in('event_type', ['dividend', 'profit_distribution', 'advance_dividend'])
    .lte('event_date', asOfDate)
    .order('event_date', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = events ?? []
  // Withholding rate in Turkey for dividends: 10% (as of 2024+)
  const WHT_RATE = 0.10

  let totalDistributed = 0
  const history = rows.map((ev) => {
    const gross       = Number(ev.amount_try ?? 0)
    const withholding = r2(gross * WHT_RATE)
    const net         = r2(gross - withholding)
    totalDistributed += gross
    return {
      date:            ev.event_date ?? asOfDate,
      type:            ev.event_type ?? 'dividend',
      gross_try:       r2(gross),
      withholding_try: withholding,
      net_try:         net,
      note:            ev.description ?? null,
    }
  })

  return {
    total_distributed_try:     r2(totalDistributed),
    pending_distributions_try: 0,
    distributable_profit_try:  0, // filled by caller who has P&L
    retained_earnings_try:     0,
    history,
  }
}

async function buildSection14(
  userId:    string,
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection14_BalanceSheet> {
  try {
    const bs = await BalanceSheetService.compute(userId, companyId, asOfDate, supabase)
    return {
      current_assets_try:     bs.assets.total_current_try,
      non_current_assets_try: bs.assets.total_non_current_try,
      total_assets_try:       bs.assets.total_assets_try,
      short_term_liabilities: bs.liabilities.total_current_try,
      long_term_liabilities:  bs.liabilities.total_non_current_try,
      total_liabilities_try:  bs.liabilities.total_liabilities_try,
      equity_try:             bs.equity.total_equity_try,
      net_asset_position_try: r2(bs.assets.total_assets_try - bs.liabilities.total_liabilities_try),
      balanced:               bs.balanced,
      imbalance_try:          bs.imbalance_try,
    }
  } catch {
    return {
      current_assets_try:     0,
      non_current_assets_try: 0,
      total_assets_try:       0,
      short_term_liabilities: 0,
      long_term_liabilities:  0,
      total_liabilities_try:  0,
      equity_try:             0,
      net_asset_position_try: 0,
      balanced:               false,
      imbalance_try:          0,
    }
  }
}

async function buildSection15(
  userId:    string,
  companyId: string,
  asOfDate:  string,
  supabase:  AnyClient,
): Promise<ReconSection15_PnL> {
  const yearStart  = asOfDate.slice(0, 4) + '-01-01'
  const period     = { from: yearStart, to: asOfDate }
  const periodLabel = `${asOfDate.slice(0, 4)} YTD`

  try {
    const summary = await FinanceService.getFinancialSummary(
      userId, companyId, period, undefined, undefined, supabase
    )

    const rev   = summary.revenue_try
    const cogs  = summary.cost_try
    const gp    = summary.gross_profit_try
    const opex  = summary.expenses_total_try
    const ebitda = r2(gp - opex)
    const net   = summary.net_after_tax_try

    return {
      revenue_try:        r2(rev),
      cogs_try:           r2(cogs),
      gross_profit_try:   r2(gp),
      gross_margin_pct:   rev > 0 ? r2((gp / rev) * 100) : 0,
      operating_expenses: r2(opex),
      ebitda_try:         ebitda,
      ebitda_margin_pct:  rev > 0 ? r2((ebitda / rev) * 100) : 0,
      net_profit_try:     r2(net),
      net_margin_pct:     rev > 0 ? r2((net / rev) * 100) : 0,
      period_label:       periodLabel,
    }
  } catch {
    return {
      revenue_try:        0,
      cogs_try:           0,
      gross_profit_try:   0,
      gross_margin_pct:   0,
      operating_expenses: 0,
      ebitda_try:         0,
      ebitda_margin_pct:  0,
      net_profit_try:     0,
      net_margin_pct:     0,
      period_label:       periodLabel,
    }
  }
}

function buildSection16(
  s2:  ReconSection2_Treasury,
  s3:  ReconSection3_Receivables,
  s4:  ReconSection4_Payables,
  s5:  ReconSection5_Inventory,
  s14: ReconSection14_BalanceSheet,
  s7:  ReconSection7_TaxPosition,
  s12: ReconSection12_DebtTranches,
  asOfDate: string,
): ReconSection16_GovernanceRisks {
  const findings: GovernanceFinding[] = []

  // STALE_RECEIVABLES_60: if receivables 60+ days > 0
  const stale60 = s3.aging.bucket_61_90 + s3.aging.bucket_90plus
  if (stale60 > 0) {
    findings.push({
      code:               'STALE_RECEIVABLES_60',
      severity:           s3.aging.bucket_90plus > 0 ? 'critical' : 'warning',
      title:              '60+ Gün Gecikmiş Alacak',
      description:        `${r2(stale60)} TRY tutarında 60 gün üzeri gecikmiş alacak tespit edildi.`,
      financial_impact:   stale60,
      recommended_action: 'Gecikmiş alacaklar için hukuki takip başlatılması değerlendirilmelidir.',
    })
  }

  // BALANCE_IMBALANCE: if balance sheet doesn't balance
  if (!s14.balanced) {
    findings.push({
      code:               'BALANCE_IMBALANCE',
      severity:           'critical',
      title:              'Bilanço Dengesizliği',
      description:        `Bilanço ${r2(Math.abs(s14.imbalance_try))} TRY fark vermektedir.`,
      financial_impact:   Math.abs(s14.imbalance_try),
      recommended_action: 'Bilanço kalemleri gözden geçirilmeli, muhasebe kayıtları doğrulanmalıdır.',
    })
  }

  // OVERDUE_TAX: if net KDV > 0 (owed to authority)
  if (s7.net_kdv_try > 0) {
    findings.push({
      code:               'OVERDUE_TAX',
      severity:           'warning',
      title:              'Ödenmemiş KDV Yükümlülüğü',
      description:        `${r2(s7.net_kdv_try)} TRY net KDV yükümlülüğü tespit edildi.`,
      financial_impact:   s7.net_kdv_try,
      recommended_action: 'KDV beyannamesi kontrol edilerek ödeme takvimi yapılmalıdır.',
    })
  }

  // PARTNER_LOAN_OVERDUE: if any tranche is overdue
  const overdueTranches = s12.tranches.filter(t => t.status === 'overdue')
  if (overdueTranches.length > 0) {
    const impact = overdueTranches.reduce((s, t) => s + t.remaining_try, 0)
    findings.push({
      code:               'PARTNER_LOAN_UNMATURED',
      severity:           'critical',
      title:              'Vadesi Geçmiş Ortak Borç Dilimi',
      description:        `${overdueTranches.length} adet vadesi geçmiş borç dilimi (${r2(impact)} TRY) tespit edildi.`,
      financial_impact:   impact,
      recommended_action: 'Ortaklarla yeniden yapılandırma müzakereleri yapılmalıdır.',
    })
  }

  // TREASURY_LOW: if cash < 1.5x last 30-day expenses
  const thirtyDayPayables = s4.upcoming_30d_try
  if (thirtyDayPayables > 0 && s2.available_cash_try < thirtyDayPayables * 1.5) {
    findings.push({
      code:               'TREASURY_LOW',
      severity:           s2.available_cash_try < thirtyDayPayables ? 'critical' : 'warning',
      title:              'Düşük Nakit Rezervi',
      description:        `Mevcut nakit (${r2(s2.available_cash_try)} TRY), 30 günlük tahmini ödemelerin (${r2(thirtyDayPayables)} TRY) 1.5 katının altında.`,
      financial_impact:   r2(thirtyDayPayables * 1.5 - s2.available_cash_try),
      recommended_action: 'Kısa vadeli nakit akışı planlanmalı, gerekirse ek finansman değerlendirilmelidir.',
    })
  }

  // INVENTORY_NO_COUNT: if no inventory recorded at all
  if (s5.item_count === 0 && s5.total_inventory_try === 0) {
    findings.push({
      code:               'INVENTORY_NO_COUNT',
      severity:           'info',
      title:              'Stok Sayımı Yapılmamış',
      description:        'Sistemde kayıtlı aktif stok tespit edilemedi.',
      financial_impact:   null,
      recommended_action: 'Stok sayımı yapılarak sisteme girilmesi gerekmektedir.',
    })
  }

  // PAYABLES_CRITICAL: 90+ day payables
  if (s4.aging.bucket_90plus > 0) {
    findings.push({
      code:               'PAYABLES_OVERDUE_90',
      severity:           'warning',
      title:              '90+ Gün Vadesi Geçmiş Borç',
      description:        `${r2(s4.aging.bucket_90plus)} TRY tutarında 90 gün üzeri vadesi geçmiş borç mevcut.`,
      financial_impact:   s4.aging.bucket_90plus,
      recommended_action: 'Tedarikçilerle ödeme planı oluşturulmalıdır.',
    })
  }

  return {
    total_critical: findings.filter(f => f.severity === 'critical').length,
    total_warning:  findings.filter(f => f.severity === 'warning').length,
    total_info:     findings.filter(f => f.severity === 'info').length,
    findings,
  }
}

function buildSection17(
  companyName:        string,
  asOfDate:           string,
  createdByEmail:     string,
): ReconSection17_ManagementDeclaration {
  return {
    declaration_text: `İşbu Ortaklar Kurulu Mutabakat Dosyası, ${companyName} şirketinin ${asOfDate} tarihi itibarıyla gerçek finansal durumunu yansıtmaktadır. Sunulan tüm bilgiler mevcut muhasebe kayıtlarına dayanmakta olup şirket yönetimi tarafından doğrulanmıştır.`,
    company_name:        companyName,
    reconciliation_date: asOfDate,
    prepared_by:         createdByEmail,
  }
}

function buildSection18(): ReconSection18_ShareholderDeclaration {
  return {
    declaration_text: 'İşbu mutabakat dosyasını incelediğimi ve aşağıdaki kalemlerin doğruluğunu teyit ettiğimi beyan ederim.',
    items_reviewed: [
      'Hazine ve nakit pozisyonu',
      'Alacak bakiyesi ve yaşlandırma',
      'Borç bakiyesi ve yaşlandırma',
      'Stok değeri',
      'Vergi pozisyonu',
      'Ortak borç ve alacakları',
      'Kar dağıtım geçmişi',
      'Bilanço özeti',
      'Gelir tablosu özeti',
      'Yönetim riskleri ve bulgular',
    ],
  }
}

async function buildSection19(
  companyId: string,
  supabase:  AnyClient,
): Promise<{ section19: ReconSection19_Signoffs; partners: Array<{ id: string; name: string; share_pct: number }> }> {
  const { data: partners } = await supabase
    .from('partners')
    .select('id, name, share_pct')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('share_pct', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = partners ?? []

  const signoffs = rows.map((p: { name: string; share_pct: number }) => ({
    partner_name:  p.name,
    ownership_pct: Number(p.share_pct ?? 0),
    status:        'pending' as const,
    signed_at:     null,
    comments:      null,
  }))

  return {
    section19: {
      required_count:  rows.length,
      completed_count: 0,
      pending_count:   rows.length,
      signoffs,
    },
    partners: rows.map((p: { id: string; name: string; share_pct: number }) => ({
      id:        p.id,
      name:      p.name,
      share_pct: Number(p.share_pct ?? 0),
    })),
  }
}

// ── Confidence Score ──────────────────────────────────────────────────────────

function computeConfidenceScore(
  s3:  ReconSection3_Receivables,
  s5:  ReconSection5_Inventory,
  s14: ReconSection14_BalanceSheet,
  s4:  ReconSection4_Payables,
  periodClosed: boolean,
): { score: number; factors: ConfidenceFactor[] } {
  const factors: ConfidenceFactor[] = [
    {
      name:        'bank_reconciliation_done',
      passed:      periodClosed,
      weight:      20,
      description: 'Dönem kapalı veya kilitli — banka mutabakatı yapılmış sayılır.',
    },
    {
      name:        'inventory_count_current',
      passed:      s5.item_count > 0,
      weight:      15,
      description: 'Aktif stok kalemi sisteme girilmiş.',
    },
    {
      name:        'period_closed',
      passed:      periodClosed,
      weight:      20,
      description: 'Son muhasebe dönemi kapatılmış.',
    },
    {
      name:        'no_stale_receivables_90plus',
      passed:      s3.total_receivables_try === 0 || (s3.aging.bucket_90plus / Math.max(s3.total_receivables_try, 1)) < 0.10,
      weight:      15,
      description: '90+ gün gecikmiş alacaklar toplam alacakların %10\'undan az.',
    },
    {
      name:        'no_overdue_declarations',
      passed:      s4.aging.bucket_90plus === 0,
      weight:      15,
      description: '90+ gün gecikmiş ödenmemiş gider yok.',
    },
    {
      name:        'balance_sheet_balanced',
      passed:      s14.balanced,
      weight:      15,
      description: 'Bilanço 100 TRY tolerans dahilinde dengeli.',
    },
  ]

  const score = Math.round(
    factors.reduce((sum, f) => sum + (f.passed ? f.weight : 0), 0)
  )

  return { score, factors }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main engine
// ═══════════════════════════════════════════════════════════════════════════════

export class ReconciliationEngine {
  /**
   * Compute all 19 reconciliation sections and confidence score.
   * Never throws — individual failures degrade gracefully.
   */
  static async compute(
    userId:    string,
    companyId: string,
    asOfDate:  string,   // YYYY-MM-DD
    supabase:  AnyClient,
    createdByEmail = 'yönetim',
  ): Promise<ReconciliationData> {
    // Run as much as possible in parallel
    const [
      s1Result,
      s2Result,
      s3Result,
      s4Result,
      s5Result,
      s9Result,
      s10Result,
      s11Result,
      s12Result,
      s13Result,
      s19Result,
      periodResult,
    ] = await Promise.allSettled([
      buildSection1(companyId, asOfDate, supabase),
      buildSection2(companyId, asOfDate, supabase),
      buildSection3(companyId, asOfDate, supabase),
      buildSection4(companyId, asOfDate, supabase),
      buildSection5(companyId, asOfDate, supabase),
      buildSection9(companyId, supabase),
      buildSection10(companyId, supabase),
      buildSection11(companyId, supabase),
      buildSection12(companyId, supabase),
      buildSection13(companyId, asOfDate, supabase),
      buildSection19(companyId, supabase),
      // Check if most recent period is closed/locked
      supabase
        .from('accounting_periods')
        .select('status')
        .eq('company_id', companyId)
        .in('status', ['closed', 'locked'])
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // Sections 7, 14, 15 depend on services that might be heavy — run after parallel batch
    const [s7Result, s14Result, s15Result] = await Promise.allSettled([
      buildSection7(userId, companyId, asOfDate, supabase),
      buildSection14(userId, companyId, asOfDate, supabase),
      buildSection15(userId, companyId, asOfDate, supabase),
    ])

    // Unwrap with fallbacks
    const s1  = s1Result.status  === 'fulfilled' ? s1Result.value  : { company_name: 'Bilinmiyor', tax_number: null, tax_office: null, mersis_no: null, trade_registry: null, address: null, phone: null, email: null, website: null, reconciliation_date: asOfDate, period_label: null }
    const s2  = s2Result.status  === 'fulfilled' ? s2Result.value  : { total_cash_try: 0, available_cash_try: 0, restricted_cash_try: 0, bank_accounts: [], fx_exposure: [], treasury_note: null }
    const s3  = s3Result.status  === 'fulfilled' ? s3Result.value  : { total_receivables_try: 0, overdue_receivables_try: 0, aging: { bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90plus: 0 }, top_customers: [], doubtful_try: 0, concentration_pct: 0, collection_risk_note: null }
    const s4  = s4Result.status  === 'fulfilled' ? s4Result.value  : { total_payables_try: 0, aging: { bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90plus: 0 }, upcoming_7d_try: 0, upcoming_30d_try: 0, top_suppliers: [], critical_note: null }
    const s5  = s5Result.status  === 'fulfilled' ? s5Result.value  : { total_inventory_try: 0, item_count: 0, critical_stock_count: 0, top_items: [], turnover_note: null, last_count_date: null }
    const s6  = await settle(buildSection6(), { total_gross_try: 0, accumulated_depreciation: 0, net_carrying_value: 0, assets: [], note: null })
    const s7  = s7Result.status  === 'fulfilled' ? s7Result.value  : { kdv_output_try: 0, kdv_input_try: 0, net_kdv_try: 0, corporate_tax_try: 0, withholding_try: 0, overdue_tax_try: 0, pending_declarations: [], sgk_obligation_try: 0, note: null }
    const s8  = await settle(buildSection8(), { total_debt_try: 0, items: [], note: null })
    const s9  = s9Result.status  === 'fulfilled' ? s9Result.value  : { total_capital_try: 0, shareholders: [] }
    const s10 = s10Result.status === 'fulfilled' ? s10Result.value : { total_partner_loans_try: 0, partners: [] }
    const s11 = s11Result.status === 'fulfilled' ? s11Result.value : { total_partner_debt_try: 0, partners: [] }
    const s12 = s12Result.status === 'fulfilled' ? s12Result.value : { total_tranches_try: 0, tranches: [] }
    const s13 = s13Result.status === 'fulfilled' ? s13Result.value : { total_distributed_try: 0, pending_distributions_try: 0, distributable_profit_try: 0, retained_earnings_try: 0, history: [] }
    const s14 = s14Result.status === 'fulfilled' ? s14Result.value : { current_assets_try: 0, non_current_assets_try: 0, total_assets_try: 0, short_term_liabilities: 0, long_term_liabilities: 0, total_liabilities_try: 0, equity_try: 0, net_asset_position_try: 0, balanced: false, imbalance_try: 0 }
    const s15 = s15Result.status === 'fulfilled' ? s15Result.value : { revenue_try: 0, cogs_try: 0, gross_profit_try: 0, gross_margin_pct: 0, operating_expenses: 0, ebitda_try: 0, ebitda_margin_pct: 0, net_profit_try: 0, net_margin_pct: 0, period_label: asOfDate.slice(0, 4) + ' YTD' }

    const periodClosed = periodResult.status === 'fulfilled' && periodResult.value.data != null

    const s16 = buildSection16(s2, s3, s4, s5, s14, s7, s12, asOfDate)
    const s17 = buildSection17(s1.company_name, asOfDate, createdByEmail)
    const s18 = buildSection18()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s19Unwrapped = s19Result.status === 'fulfilled' ? s19Result.value : { section19: { required_count: 0, completed_count: 0, pending_count: 0, signoffs: [] } as any, partners: [] }
    const s19 = s19Unwrapped.section19

    // Enrich s13 with P&L data
    s13.distributable_profit_try = r2(Math.max(0, s15.net_profit_try))

    const { score, factors } = computeConfidenceScore(s3, s5, s14, s4, periodClosed)

    const sections = {
      section1:  s1,
      section2:  s2,
      section3:  s3,
      section4:  s4,
      section5:  s5,
      section6:  s6,
      section7:  s7,
      section8:  s8,
      section9:  s9,
      section10: s10,
      section11: s11,
      section12: s12,
      section13: s13,
      section14: s14,
      section15: s15,
      section16: s16,
      section17: s17,
      section18: s18,
      section19: s19,
    }

    const dataHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(sections))
      .digest('hex')

    return {
      ...sections,
      confidence_score:   score,
      confidence_factors: factors,
      computed_at:        new Date().toISOString(),
      data_hash:          dataHash,
    }
  }
}

// ── Engine 1: Financial Validation ───────────────────────────────────────────
export function runValidation(sections: ReconciliationData): FinancialValidation {
  const checks: ValidationCheck[] = []

  // 1. Balance sheet: Assets = Liabilities + Equity
  const s14 = sections.section14 as any
  const assets = s14?.total_assets ?? 0
  const liabEquity = (s14?.total_liabilities ?? 0) + (s14?.total_equity ?? 0)
  const bsVariance = Math.abs(assets - liabEquity)
  checks.push({
    id: 'balance_sheet',
    title: 'Bilanço Dengesi',
    result: bsVariance < 100 ? 'PASS' : bsVariance < 10000 ? 'WARNING' : 'FAIL',
    variance: r2(bsVariance),
    explanation: bsVariance < 100 ? 'Aktif = Pasif + Özkaynak dengesi sağlandı' : `₺${bsVariance.toLocaleString('tr-TR')} fark tespit edildi`,
    severity: bsVariance < 100 ? 'info' : bsVariance < 10000 ? 'warning' : 'critical',
  })

  // 2. Treasury: sum of bank accounts = total cash
  const s2 = sections.section2 as any
  const bankSum = (s2?.bank_accounts ?? []).reduce((a: number, b: any) => a + (b.balance_try ?? 0), 0)
  const cashTotal = s2?.total_cash_try ?? 0
  const treasVariance = Math.abs(bankSum - cashTotal)
  checks.push({
    id: 'treasury',
    title: 'Kasa/Banka Doğrulama',
    result: treasVariance < 1 ? 'PASS' : treasVariance < 1000 ? 'WARNING' : 'FAIL',
    variance: r2(treasVariance),
    explanation: treasVariance < 1 ? 'Banka hesapları toplamı hazine bakiyesiyle eşleşiyor' : `₺${treasVariance.toLocaleString('tr-TR')} fark`,
    severity: treasVariance < 1 ? 'info' : 'warning',
  })

  // 3. Inventory: sum of items = total
  const s5 = sections.section5 as any
  const itemSum = (s5?.top_items ?? []).reduce((a: number, b: any) => a + (b.total_value ?? 0), 0)
  const invTotal = s5?.total_inventory_try ?? 0
  const invVariance = Math.abs(itemSum - invTotal)
  const invResult: ValidationResult = itemSum === 0 ? 'WARNING' : invVariance < 1000 ? 'PASS' : 'WARNING'
  checks.push({
    id: 'inventory',
    title: 'Stok Doğrulama',
    result: invResult,
    variance: r2(invVariance),
    explanation: itemSum === 0 ? 'Stok kalemleri detayı eksik, manuel doğrulama gerekiyor' : invVariance < 1000 ? 'Stok kalemleri toplamı bilanço stok değeriyle uyumlu' : `₺${invVariance.toLocaleString('tr-TR')} fark`,
    severity: invResult === 'PASS' ? 'info' : 'warning',
  })

  // 4. Partner finance: receivables vs liabilities vs loans
  const s10total = (sections.section10 as any)?.total_partner_receivables ?? 0
  const s11total = (sections.section11 as any)?.total_partner_liabilities ?? 0
  const partnerLoans = (sections.section8 as any)?.partner_loans ?? 0
  const netPartner = Math.abs(s10total - s11total)
  const partnerResult: ValidationResult = netPartner < 10 ? 'PASS' : netPartner < partnerLoans * 0.1 + 1 ? 'WARNING' : 'WARNING'
  checks.push({
    id: 'partner_finance',
    title: 'Ortak Hesapları Dengesi',
    result: partnerResult,
    variance: r2(netPartner),
    explanation: partnerResult === 'PASS' ? 'Ortak alacak ve borçları dengede' : `Ortak alacak/borç farkı ₺${netPartner.toLocaleString('tr-TR')}`,
    severity: 'info',
  })

  // 5. Profit: gross margin > 0 (basic viability check)
  const s15 = sections.section15 as any
  const grossProfit = s15?.gross_profit_try ?? 0
  const revenue = s15?.revenue_try ?? 0
  const profitResult: ValidationResult = revenue === 0 ? 'WARNING' : grossProfit >= 0 ? 'PASS' : 'FAIL'
  checks.push({
    id: 'profit',
    title: 'Kârlılık Kontrolü',
    result: profitResult,
    variance: r2(grossProfit),
    explanation: revenue === 0 ? 'Gelir verisi mevcut değil' : grossProfit >= 0 ? `Brüt kâr pozitif (₺${grossProfit.toLocaleString('tr-TR')})` : `Brüt kâr negatif (₺${grossProfit.toLocaleString('tr-TR')})`,
    severity: profitResult === 'FAIL' ? 'critical' : profitResult === 'WARNING' ? 'warning' : 'info',
  })

  // 6. Distribution: YTD distributions <= net income
  const ytdDist = (sections.section13 as any)?.ytd_total ?? 0
  const netIncome = s15?.net_profit_try ?? 0
  const distResult: ValidationResult = ytdDist <= netIncome ? 'PASS' : ytdDist <= netIncome * 1.1 ? 'WARNING' : 'FAIL'
  checks.push({
    id: 'distribution',
    title: 'Kâr Dağıtım Dengesi',
    result: distResult,
    variance: r2(ytdDist - netIncome),
    explanation: distResult === 'PASS' ? 'Dağıtımlar net kâr içinde kalıyor' : `Dağıtımlar (₺${ytdDist.toLocaleString('tr-TR')}) net kârı (₺${netIncome.toLocaleString('tr-TR')}) aşıyor`,
    severity: distResult === 'FAIL' ? 'critical' : 'warning',
  })

  const passed = checks.filter(c => c.result === 'PASS').length
  const hasFail = checks.some(c => c.result === 'FAIL')
  const hasWarn = checks.some(c => c.result === 'WARNING')
  const overall: ValidationResult = hasFail ? 'FAIL' : hasWarn ? 'WARNING' : 'PASS'

  return {
    balance_sheet_check:   checks[0],
    treasury_check:        checks[1],
    inventory_check:       checks[2],
    partner_finance_check: checks[3],
    profit_check:          checks[4],
    distribution_check:    checks[5],
    overall_status:        overall,
    checks_passed:         passed,
    checks_total:          checks.length,
  }
}

// ── Engine 2: Shareholder Economic Positions ──────────────────────────────────
export function buildShareholderPositions(sections: ReconciliationData, asOfDate: string): ShareholderPositionSummary {
  const s9  = sections.section9  as any
  const s10 = sections.section10 as any
  const s11 = sections.section11 as any
  const s12 = sections.section12 as any
  const s13 = sections.section13 as any
  const s15 = sections.section15 as any

  const partners: Array<{name: string; ownership_pct: number; equity_value: number}> = s9?.partners ?? []
  const distributableNet = Math.max(0, (s15?.net_profit_try ?? 0) - (s13?.ytd_total ?? 0))

  const positions: ShareholderPosition[] = partners.map(p => {
    const recv = (s10?.partner_receivables ?? []).find((r: any) =>
      r.partner_name?.toLowerCase() === p.name?.toLowerCase()
    )?.balance ?? 0

    const liab = (s11?.partner_liabilities ?? []).find((l: any) =>
      l.partner_name?.toLowerCase() === p.name?.toLowerCase()
    )?.balance ?? 0

    const trancheExposure = (s12?.tranches ?? [])
      .filter((t: any) => t.partner_name?.toLowerCase() === p.name?.toLowerCase())
      .reduce((a: number, t: any) => a + (t.outstanding ?? 0), 0)

    const partnerDist = (s13?.per_partner ?? []).find((d: any) =>
      d.name?.toLowerCase() === p.name?.toLowerCase()
    )
    const accumulatedDist = (partnerDist?.huzur_hakki ?? 0) + (partnerDist?.temettu ?? 0)

    const distRight = r2(distributableNet * (p.ownership_pct / 100))
    const netPos = r2(p.equity_value + recv - liab + distRight)

    return {
      partner_name:              p.name,
      ownership_pct:             p.ownership_pct,
      paid_capital:              p.equity_value,
      capital_injections_ytd:    0,
      partner_receivables:       recv,
      partner_liabilities:       liab,
      debt_tranche_exposure:     trancheExposure,
      accumulated_distributions: accumulatedDist,
      current_distribution_right: distRight,
      net_economic_position:     netPos,
      economic_note: null,
    }
  })

  return {
    positions,
    total_equity:       s9?.total_equity ?? 0,
    total_distributable: distributableNet,
    as_of_date:         asOfDate,
  }
}

// ── Engine 6: Governance Executive Summary ────────────────────────────────────
export function buildExecutiveSummary(
  sections: ReconciliationData,
  validation: FinancialValidation,
  confidence: ConfidenceScoreV2,
): GovernanceExecutiveSummary {
  const s2  = sections.section2  as any
  const s3  = sections.section3  as any
  const s4  = sections.section4  as any
  const s5  = sections.section5  as any
  const s8  = sections.section8  as any
  const s9  = sections.section9  as any
  const s13 = sections.section13 as any
  const s15 = sections.section15 as any
  const s16 = sections.section16 as any

  const fmtCur = (n: number) => new Intl.NumberFormat('tr-TR', {style: 'currency', currency: 'TRY', maximumFractionDigits: 0}).format(n)

  const cash = s2?.total_cash_try ?? 0
  const receivables = s3?.total_receivables_try ?? 0
  const overdueRecv = s3?.overdue_receivables_try ?? 0
  const payables = s4?.total_payables_try ?? 0
  const inventory = s5?.total_inventory_try ?? 0
  const equity = s9?.total_equity ?? 0
  const netIncome = s15?.net_profit_try ?? 0
  const dsr = s8?.dsr ?? 0
  const distributable = Math.max(0, netIncome - (s13?.ytd_total ?? 0))

  // Working capital = current assets - current liabilities
  const workingCapital = (cash + receivables + inventory) - payables
  const netAssets = equity

  // Runway (months) — very rough: cash / avg monthly expense
  const avgMonthlyExpense = (s8?.monthly_interest_expense ?? 1) * 12 + (payables / 3)
  const runwayMonths = avgMonthlyExpense > 0 ? Math.floor(cash / (avgMonthlyExpense / 12)) : 99
  const runwayCapped = Math.min(runwayMonths, 24)

  const healthStatus = confidence.total >= 80 ? 'sağlıklı' : confidence.total >= 60 ? 'dikkat gerektirir' : 'kritik durumda'
  const headline = `Şirket finansal durumu ${healthStatus} — Güven Skoru: ${confidence.total}/100 (${confidence.grade})`

  const govIssues: string[] = (s16?.findings ?? [])
    .filter((f: any) => f.severity === 'critical')
    .slice(0, 5)
    .map((f: any) => f.title as string)

  if (validation.overall_status === 'FAIL') {
    govIssues.unshift('Finansal doğrulama başarısız — rakamlar tutarsız')
  }

  const overdueTopCustomer = (s3?.top_customers ?? []).length
  const receivableNote = overdueRecv > 0
    ? `${fmtCur(overdueRecv)} vadesi geçmiş alacak (${overdueTopCustomer} müşteri)`
    : 'Vadesi geçmiş alacak yok'

  const debtNote = dsr > 0.7 ? `Borç servis oranı kritik (${dsr.toFixed(2)})` : dsr > 0.4 ? `Borç servis oranı yüksek (${dsr.toFixed(2)})` : `Borç servis oranı normal (${dsr.toFixed(2)})`

  const recommendation = confidence.total >= 80 && validation.overall_status === 'PASS'
    ? 'Mutabakat onaya hazır. Hissedar imzaları toplanabilir.'
    : validation.overall_status === 'FAIL'
    ? 'Finansal tutarsızlıklar giderilmeden onay alınamaz.'
    : 'Eksik belgeler tamamlandıktan sonra onaya sunulabilir.'

  return {
    headline,
    treasury_position:    `${fmtCur(cash)} nakit${runwayCapped < 24 ? `, ~${runwayCapped} ay operasyonel runway` : ''}`,
    working_capital:      `${fmtCur(workingCapital)} (Dönen Varlık − Kısa Vadeli Borç)`,
    net_assets:           `${fmtCur(netAssets)} toplam özkaynak`,
    distributable_profit: distributable > 0 ? `${fmtCur(distributable)} dağıtılabilir kâr mevcut` : 'Dağıtılabilir kâr yok',
    receivable_risk:      receivableNote,
    debt_pressure:        debtNote,
    governance_issues:    govIssues,
    confidence_summary:   `${confidence.total}/100 — ${confidence.grade} — ${confidence.interpretation}`,
    recommendation,
  }
}

// ── Pure Helpers ──────────────────────────────────────────────────────────────

/**
 * Compute reconciliation match rate as a percentage.
 * Returns 0 if total is 0.
 */
export function computeMatchRate(matched: number, total: number): number {
  if (total === 0) return 0
  return (matched / total) * 100
}

/**
 * Classify reconciliation quality based on match rate.
 * complete: >=99, good: >=95, partial: >=80, poor: <80
 */
export function classifyReconciliationQuality(
  matchRate: number,
): 'complete' | 'good' | 'partial' | 'poor' {
  if (matchRate >= 99) return 'complete'
  if (matchRate >= 95) return 'good'
  if (matchRate >= 80) return 'partial'
  return 'poor'
}

const TURKISH_MONTHS: Record<number, string> = {
  1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan', 5: 'Mayıs', 6: 'Haziran',
  7: 'Temmuz', 8: 'Ağustos', 9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık',
}

/**
 * Build a reconciliation status message in Turkish.
 * e.g. "Nisan 2025: %98.5 eşleşme, 3 eşleşmeyen kayıt"
 * Period must be 'YYYY-MM'.
 */
export function buildReconciliationStatus(
  matchRate: number,
  unmatchedCount: number,
  period: string,
): string {
  const [year, month] = period.split('-').map(Number)
  const monthName = TURKISH_MONTHS[month] ?? period
  const rateFmt = Number.isInteger(matchRate)
    ? matchRate.toString()
    : matchRate.toFixed(1).replace('.', ',')
  return `${monthName} ${year}: %${rateFmt} eşleşme, ${unmatchedCount} eşleşmeyen kayıt`
}

/**
 * Classify a discrepancy between book and bank amounts.
 * matched:    difference < 1
 * timing:     0 < difference < 5000
 * error:      5000 <= difference < 50000
 * fraud_flag: difference >= 50000
 */
export function classifyDiscrepancyType(
  bookAmount: number,
  bankAmount: number,
): 'timing' | 'error' | 'fraud_flag' | 'matched' {
  const diff = Math.abs(bookAmount - bankAmount)
  if (diff < 1) return 'matched'
  if (diff < 5000) return 'timing'
  if (diff < 50000) return 'error'
  return 'fraud_flag'
}

// ── Engine 7: Confidence Score V2 ────────────────────────────────────────────
export function buildConfidenceV2(
  sections: ReconciliationData,
  validation: FinancialValidation,
): ConfidenceScoreV2 {
  const s3 = sections.section3 as any
  const s5 = sections.section5 as any
  const s7 = sections.section7 as any
  const s1 = sections.section1 as any

  type Factor = ConfidenceScoreV2['breakdown'][number]
  const breakdown: Factor[] = []

  // 1. Bank reconciliation (20%)
  const bankStatus = validation.treasury_check.result
  const bankScore = bankStatus === 'PASS' ? 20 : bankStatus === 'WARNING' ? 13 : 0
  breakdown.push({
    factor: 'Banka Mutabakatı', weight: 20, score: bankScore, max_score: 20,
    status: bankScore === 20 ? 'full' : bankScore > 0 ? 'partial' : 'none',
    detail: bankStatus === 'PASS' ? 'Banka hesapları mutabık' : 'Banka mutabakatı eksik veya tutarsız',
    deduction: 20 - bankScore,
  })

  // 2. Financial consistency (20%)
  const fcStatus = validation.overall_status
  const fcScore = fcStatus === 'PASS' ? 20 : fcStatus === 'WARNING' ? 12 : 0
  breakdown.push({
    factor: 'Finansal Tutarlılık', weight: 20, score: fcScore, max_score: 20,
    status: fcScore === 20 ? 'full' : fcScore > 0 ? 'partial' : 'none',
    detail: fcStatus === 'PASS' ? 'Tüm finansal kontroller geçti' : `${validation.checks_total - validation.checks_passed} kontrol başarısız`,
    deduction: 20 - fcScore,
  })

  // 3. Closed accounting period (15%)
  const hasPeriodData = (sections.section14 as any)?.total_assets > 0
  const periodScore = hasPeriodData ? 15 : 7
  breakdown.push({
    factor: 'Kapalı Muhasebe Dönemi', weight: 15, score: periodScore, max_score: 15,
    status: periodScore === 15 ? 'full' : 'partial',
    detail: hasPeriodData ? 'Dönem verileri mevcut' : 'Dönem kapanışı doğrulanamadı',
    deduction: 15 - periodScore,
  })

  // 4. Inventory verification (15%)
  const lastCountDate = s5?.last_count_date
  let invScore = 0
  let invDetail = 'Sayım tarihi bilinmiyor'
  if (lastCountDate) {
    const daysSince = Math.floor((Date.now() - new Date(lastCountDate).getTime()) / 86400000)
    invScore = daysSince <= 90 ? 15 : daysSince <= 180 ? 8 : 0
    invDetail = `Son sayım ${daysSince} gün önce`
  } else {
    invScore = 5
    invDetail = 'Sayım tarihi kayıt altına alınmamış'
  }
  breakdown.push({
    factor: 'Stok Sayımı', weight: 15, score: invScore, max_score: 15,
    status: invScore === 15 ? 'full' : invScore > 0 ? 'partial' : 'none',
    detail: invDetail,
    deduction: 15 - invScore,
  })

  // 5. Receivable quality (10%)
  const totalRecv = s3?.total_receivables_try ?? 0
  const overdue90 = s3?.aging?.bucket_90plus ?? 0
  const ovdRatio = totalRecv > 0 ? overdue90 / totalRecv : 0
  const recvScore = ovdRatio < 0.05 ? 10 : ovdRatio < 0.20 ? 6 : 0
  breakdown.push({
    factor: 'Alacak Kalitesi', weight: 10, score: recvScore, max_score: 10,
    status: recvScore === 10 ? 'full' : recvScore > 0 ? 'partial' : 'none',
    detail: ovdRatio < 0.05 ? '90+ gün vadesi geçmiş alacak ihmal edilebilir seviyede' : `Alacakların %${Math.round(ovdRatio * 100)}'i 90+ gün vadesi geçmiş`,
    deduction: 10 - recvScore,
  })

  // 6. Tax compliance (10%)
  const nextTaxDue = s7?.next_due_date
  let taxScore = 10
  let taxDetail = 'Vergi yükümlülükleri güncel'
  if (nextTaxDue) {
    const daysUntilDue = Math.floor((new Date(nextTaxDue).getTime() - Date.now()) / 86400000)
    if (daysUntilDue < 0) { taxScore = 0; taxDetail = 'Vadesi geçmiş vergi yükümlülüğü mevcut' }
    else if (daysUntilDue < 7) { taxScore = 5; taxDetail = `Vergi beyanı ${daysUntilDue} gün içinde` }
  }
  breakdown.push({
    factor: 'Vergi Uyumu', weight: 10, score: taxScore, max_score: 10,
    status: taxScore === 10 ? 'full' : taxScore > 0 ? 'partial' : 'none',
    detail: taxDetail,
    deduction: 10 - taxScore,
  })

  // 7. Documentation completeness (10%)
  const hasCompanyInfo = !!(s1?.tax_number && s1?.address)
  const hasContactInfo = !!(s1?.phone || s1?.email)
  const docScore = (hasCompanyInfo ? 6 : 3) + (hasContactInfo ? 2 : 0) + 2
  const docScoreCapped = Math.min(docScore, 10)
  breakdown.push({
    factor: 'Belge Tamlığı', weight: 10, score: docScoreCapped, max_score: 10,
    status: docScoreCapped === 10 ? 'full' : docScoreCapped > 5 ? 'partial' : 'none',
    detail: hasCompanyInfo ? 'Şirket bilgileri eksiksiz' : 'Şirket bilgileri eksik',
    deduction: 10 - docScoreCapped,
  })

  const total = Math.min(100, breakdown.reduce((a, b) => a + b.score, 0))
  const grade: ConfidenceScoreV2['grade'] = total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : total >= 40 ? 'D' : 'F'
  const interpretation = grade === 'A' ? 'Mükemmel — Onaya hazır'
    : grade === 'B' ? 'İyi — Küçük eksikler var'
    : grade === 'C' ? 'Orta — Dikkat gerektiren alanlar mevcut'
    : grade === 'D' ? 'Zayıf — Önemli eksikler giderilmeli'
    : 'Yetersiz — Onay verilmemeli'

  return { total, breakdown, grade, interpretation }
}
