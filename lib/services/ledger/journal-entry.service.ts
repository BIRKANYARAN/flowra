// Journal Entry Service — atomic creation via Supabase RPC
// All journal entries go through this service; never raw inserts from app layer.

import { getAccount, EXPENSE_TYPE_TO_ACCOUNT } from '@/lib/accounting/chart-of-accounts'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface JournalLine {
  account_code: string
  account_name: string
  debit_try?:   number
  credit_try?:  number
  description?: string
}

export interface CreateJournalEntryParams {
  company_id:    string
  period_id?:    string | null
  source_type:   string
  source_id?:    string | null
  entry_date:    string      // YYYY-MM-DD
  description:   string
  reference?:    string | null
  is_adjustment?: boolean
  created_by?:   string | null
  lines:         JournalLine[]
}

export interface JournalEntryResult {
  id:    string
  lines: JournalLine[]
}

export class JournalEntryService {
  // Core: create one balanced journal entry (uses DB RPC for atomicity)
  static async create(
    params: CreateJournalEntryParams,
    supabase: AnySupabaseClient,
  ): Promise<string> {
    const { company_id, period_id, source_type, source_id, entry_date,
            description, reference, is_adjustment, created_by, lines } = params

    // Pre-flight balance check (also enforced at DB level)
    const totalDr = round2(lines.reduce((s, l) => s + (l.debit_try  ?? 0), 0))
    const totalCr = round2(lines.reduce((s, l) => s + (l.credit_try ?? 0), 0))
    if (Math.abs(totalDr - totalCr) > 0.01) {
      throw new Error(`Unbalanced journal entry: DR=${totalDr} CR=${totalCr}`)
    }

    const { data, error } = await supabase.rpc('create_journal_entry', {
      p_company_id:    company_id,
      p_period_id:     period_id    ?? null,
      p_source_type:   source_type,
      p_source_id:     source_id    ?? null,
      p_entry_date:    entry_date,
      p_description:   description,
      p_reference:     reference    ?? null,
      p_is_adjustment: is_adjustment ?? false,
      p_created_by:    created_by   ?? null,
      p_lines: lines.map(l => ({
        account_code: l.account_code,
        account_name: l.account_name,
        debit_try:    round2(l.debit_try  ?? 0),
        credit_try:   round2(l.credit_try ?? 0),
        description:  l.description ?? null,
      })),
    })

    if (error) throw new Error(`Journal entry creation failed: ${error.message}`)
    return data as string
  }

  // Create a reversal entry (offsets a previous incorrect entry)
  static async createReversal(
    originalEntryId: string,
    params: Pick<CreateJournalEntryParams, 'company_id' | 'period_id' | 'entry_date' | 'created_by'>,
    supabase: AnySupabaseClient,
  ): Promise<string> {
    const { data: orig, error } = await supabase
      .from('journal_entries')
      .select('*, journal_entry_lines(*)')
      .eq('id', originalEntryId)
      .single()

    if (error || !orig) throw new Error('Original entry not found')

    const reversalLines: JournalLine[] = (orig.journal_entry_lines as JournalLine[]).map(l => ({
      account_code: l.account_code,
      account_name: l.account_name,
      debit_try:    l.credit_try,   // swap
      credit_try:   l.debit_try,
      description:  `Reversal: ${l.description ?? ''}`,
    }))

    return JournalEntryService.create({
      ...params,
      source_type:   'reversal',
      source_id:     originalEntryId,
      description:   `Reversal of entry ${originalEntryId.slice(0, 8)}`,
      is_adjustment: true,
      lines: reversalLines,
    }, supabase)
  }

  // ── Entry generators for each operational event ────────────────────────────

  static buildSaleEntry(sale: {
    id:              string
    sale_date:       string
    invoice_no?:     string | null
    revenue_try:     number
    kdv_amount_try:  number
    total_try:       number
    description?:    string
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const revenue = round2(sale.revenue_try)
    const kdv     = round2(sale.kdv_amount_try)
    const total   = round2(sale.total_try)

    const rev = getAccount('600')
    const rec = getAccount('120')
    const vat = getAccount('391')

    return {
      source_type: 'sale',
      source_id:   sale.id,
      entry_date:  sale.sale_date,
      description: sale.description ?? `Satış ${sale.invoice_no ?? sale.id.slice(0, 8)}`,
      reference:   sale.invoice_no ?? null,
      lines: [
        { account_code: rec.code, account_name: rec.name_tr, debit_try:  total   },
        { account_code: rev.code, account_name: rev.name_tr, credit_try: revenue },
        ...(kdv > 0 ? [{ account_code: vat.code, account_name: vat.name_tr, credit_try: kdv }] : []),
      ],
    }
  }

  static buildSalePaymentEntry(payment: {
    sale_id:     string
    payment_date: string
    amount_try:  number
    description?: string
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const amount = round2(payment.amount_try)
    const bank = getAccount('102')
    const rec  = getAccount('120')

    return {
      source_type: 'sale_payment',
      source_id:   payment.sale_id,
      entry_date:  payment.payment_date,
      description: payment.description ?? 'Satış tahsilatı',
      lines: [
        { account_code: bank.code, account_name: bank.name_tr, debit_try:  amount },
        { account_code: rec.code,  account_name: rec.name_tr,  credit_try: amount },
      ],
    }
  }

  static buildExpenseEntry(expense: {
    id:              string
    expense_date:    string
    expense_type:    string
    amount_try:      number
    kdv_amount_try?: number
    paid_from_bank:  boolean
    description?:    string
    reference?:      string | null
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const expCode   = EXPENSE_TYPE_TO_ACCOUNT[expense.expense_type] ?? '770'
    const expAcc    = getAccount(expCode)
    const vatIn     = round2(expense.kdv_amount_try ?? 0)
    const netAmount = round2(expense.amount_try)
    const total     = round2(netAmount + vatIn)
    const creditAcc = expense.paid_from_bank ? getAccount('102') : getAccount('320')
    const vatAcc    = getAccount('191')

    return {
      source_type: 'expense',
      source_id:   expense.id,
      entry_date:  expense.expense_date,
      description: expense.description ?? `Masraf: ${expense.expense_type}`,
      reference:   expense.reference ?? null,
      lines: [
        { account_code: expAcc.code,    account_name: expAcc.name_tr,    debit_try:  netAmount },
        ...(vatIn > 0 ? [{ account_code: vatAcc.code, account_name: vatAcc.name_tr, debit_try: vatIn }] : []),
        { account_code: creditAcc.code, account_name: creditAcc.name_tr, credit_try: total },
      ],
    }
  }

  static buildPurchaseEntry(purchase: {
    id:           string
    received_date: string
    cost_try:     number
    paid_from_bank: boolean
    description?: string
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const cost      = round2(purchase.cost_try)
    const inventory = getAccount('153')
    const creditAcc = purchase.paid_from_bank ? getAccount('102') : getAccount('320')

    return {
      source_type: 'purchase',
      source_id:   purchase.id,
      entry_date:  purchase.received_date,
      description: purchase.description ?? 'Stok alımı',
      lines: [
        { account_code: inventory.code, account_name: inventory.name_tr, debit_try:  cost },
        { account_code: creditAcc.code, account_name: creditAcc.name_tr, credit_try: cost },
      ],
    }
  }

  static buildCogsEntry(sale: {
    id:        string
    sale_date: string
    cogs_try:  number
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const cogs      = round2(sale.cogs_try)
    const cogsAcc   = getAccount('620')
    const inventory = getAccount('153')

    return {
      source_type: 'purchase_cogs',
      source_id:   sale.id,
      entry_date:  sale.sale_date,
      description: 'COGS — satış maliyeti',
      lines: [
        { account_code: cogsAcc.code,   account_name: cogsAcc.name_tr,   debit_try:  cogs },
        { account_code: inventory.code, account_name: inventory.name_tr, credit_try: cogs },
      ],
    }
  }

  static buildPartnerLoanEntry(loan: {
    partner_transaction_id: string
    tx_date:                string
    amount_try:             number
    partner_name:           string
    is_long_term:           boolean
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const amount     = round2(loan.amount_try)
    const bank       = getAccount('102')
    const liabilityAcc = loan.is_long_term ? getAccount('421') : getAccount('321')

    return {
      source_type: 'partner_loan',
      source_id:   loan.partner_transaction_id,
      entry_date:  loan.tx_date,
      description: `Ortak borç girişi — ${loan.partner_name}`,
      lines: [
        { account_code: bank.code,         account_name: bank.name_tr,         debit_try:  amount },
        { account_code: liabilityAcc.code, account_name: liabilityAcc.name_tr, credit_try: amount },
      ],
    }
  }

  static buildPartnerRepaymentEntry(repayment: {
    partner_transaction_id: string
    tx_date:                string
    amount_try:             number
    partner_name:           string
    is_long_term:           boolean
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const amount     = round2(repayment.amount_try)
    const bank       = getAccount('102')
    const liabilityAcc = repayment.is_long_term ? getAccount('421') : getAccount('321')

    return {
      source_type: 'partner_repayment',
      source_id:   repayment.partner_transaction_id,
      entry_date:  repayment.tx_date,
      description: `Ortak borç geri ödemesi — ${repayment.partner_name}`,
      lines: [
        { account_code: liabilityAcc.code, account_name: liabilityAcc.name_tr, debit_try:  amount },
        { account_code: bank.code,         account_name: bank.name_tr,         credit_try: amount },
      ],
    }
  }

  static buildDividendDeclaredEntry(div: {
    source_id:      string
    declared_date:  string
    gross_try:      number
    withholding_try: number
    net_try:        number
    partner_name:   string
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const retained = getAccount('570')
    const taxPayable = getAccount('360')
    const partnerPayable = getAccount('335')

    return {
      source_type: 'dividend_declared',
      source_id:   div.source_id,
      entry_date:  div.declared_date,
      description: `Temettü beyanı — ${div.partner_name}`,
      lines: [
        { account_code: retained.code,      account_name: retained.name_tr,      debit_try:  round2(div.gross_try)       },
        { account_code: taxPayable.code,    account_name: taxPayable.name_tr,    credit_try: round2(div.withholding_try) },
        { account_code: partnerPayable.code,account_name: partnerPayable.name_tr,credit_try: round2(div.net_try)         },
      ],
    }
  }

  static buildPeriodCloseEntry(period: {
    period_id:         string
    close_date:        string
    period_profit_try: number
    legal_reserve_try: number
    retained_transfer_try: number
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const currentProfit = getAccount('590')
    const retained      = getAccount('570')
    const legalReserve  = getAccount('542')

    const lines: JournalLine[] = [
      { account_code: currentProfit.code, account_name: currentProfit.name_tr, debit_try: round2(period.period_profit_try) },
      { account_code: retained.code,      account_name: retained.name_tr,      credit_try: round2(period.retained_transfer_try) },
    ]
    if (period.legal_reserve_try > 0) {
      lines.push({ account_code: legalReserve.code, account_name: legalReserve.name_tr, credit_try: round2(period.legal_reserve_try) })
    }

    return {
      source_type: 'period_close',
      source_id:   period.period_id,
      entry_date:  period.close_date,
      description: 'Dönem kapanışı — kâr devri',
      is_adjustment: false,
      lines,
    }
  }
}
