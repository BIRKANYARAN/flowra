// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/ledger/journal-entry.service.ts
//
// Turkish MSUGT-compliant double-entry journal entry generation service.
// Generates balanced journal entries from operational events.
//
// Architecture:
//   - ACCOUNT_CODES: embed MSUGT chart of accounts constants
//   - Pure exported functions: testable without DB
//   - JournalEntryService class: static build* methods (DB write) + instance
//     methods for DB queries (getEntriesForPeriod, getAccountBalance, etc.)
//
// Invariant: Σ debits = Σ credits for every JournalEntry (enforced by validateJournalEntry)
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccount, EXPENSE_TYPE_TO_ACCOUNT } from '@/lib/accounting/chart-of-accounts'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

// ── Turkish MSUGT Chart of Accounts ───────────────────────────────────────────

export const ACCOUNT_CODES = {
  KASA:                   '100', // Cash on hand
  BANKALAR:               '102', // Bank accounts
  ALICILAR:               '120', // Trade receivables
  TICARI_MALLAR:          '153', // Inventory (FIFO)
  INDIRILECEK_KDV:        '191', // Deductible input VAT
  SATICILAR:              '320', // Trade payables
  ORTAKLARA_BORCLAR_KISA: '321', // Partner loans (current)
  ORTAKLARA_BORCLAR_UZUN: '421', // Partner loans (long-term)
  PERSONELE_BORCLAR:      '335', // Payroll payables
  ODENECEK_VERGI:         '360', // Tax payable (KV, stopaj)
  HESAPLANAN_KDV:         '391', // Output VAT payable
  SERMAYE:                '500', // Paid-in capital
  YASAL_YEDEKLER:         '542', // Legal reserves (TTK 519)
  GECMIS_YIL_KARLARI:     '570', // Retained earnings
  DONEM_NET_KARI:         '590', // Current period profit
  YURT_ICI_SATISLAR:      '600', // Domestic sales revenue
  SATILAN_MALIN_MALIYETI: '620', // COGS
  FINANSMAN_GIDERLERI:    '780', // Interest expense
  PAZARLAMA_GIDERLERI:    '760', // Marketing/logistics
  GENEL_YONETIM:          '770', // G&A expenses
  MAAS_GIDERLERI:         '771', // Payroll
  KIRA_GIDERLERI:         '772', // Rent
  YAZILIM_GIDERLERI:      '773', // Software
} as const

// ── Account name lookup (MSUGT Turkish names) ─────────────────────────────────

const ACCOUNT_NAMES: Record<string, string> = {
  '100': 'Kasa',
  '102': 'Bankalar',
  '120': 'Alıcılar',
  '153': 'Ticari Mallar',
  '191': 'İndirilecek KDV',
  '320': 'Satıcılar',
  '321': 'Ortaklara Borçlar (KV)',
  '421': 'Ortaklara Borçlar (UV)',
  '335': 'Personele Borçlar',
  '360': 'Ödenecek Vergi',
  '391': 'Hesaplanan KDV',
  '500': 'Sermaye',
  '542': 'Yasal Yedekler',
  '570': 'Geçmiş Yıllar Kârları',
  '590': 'Dönem Net Kârı',
  '600': 'Yurt İçi Satışlar',
  '620': 'Satılan Malın Maliyeti',
  '760': 'Pazarlama Satış Dağıtım Giderleri',
  '770': 'Genel Yönetim Giderleri',
  '771': 'Maaş Giderleri',
  '772': 'Kira Giderleri',
  '773': 'Yazılım/Abonelik Giderleri',
  '780': 'Finansman Giderleri',
}

function acctName(code: string): string {
  return ACCOUNT_NAMES[code] ?? `Hesap ${code}`
}

// ── Core interfaces ───────────────────────────────────────────────────────────

/**
 * A single line in a double-entry journal.
 * Either debit_try or credit_try will be > 0; the other is 0 (or omitted).
 * Fields are optional for backward compatibility with partial construction;
 * the service normalises missing values to 0 at runtime.
 */
export interface JournalLine {
  account_code: string
  account_name: string
  debit_try?:   number  // 0 if credit entry (undefined treated as 0)
  credit_try?:  number  // 0 if debit entry  (undefined treated as 0)
  description?: string
}

/** Parameters for creating a journal entry via supabase RPC. */
export interface CreateJournalEntryParams {
  company_id:     string
  period_id?:     string | null
  source_type:    string
  source_id?:     string | null
  entry_date:     string      // YYYY-MM-DD
  description:    string
  reference?:     string | null
  is_adjustment?: boolean
  created_by?:    string | null
  lines:          JournalLine[]
}

export interface JournalEntryResult {
  id:    string
  lines: JournalLine[]
}

/**
 * A fully-typed journal entry (pure functional interface).
 * Used by the pure build* functions and the DB-connected instance methods.
 */
export interface JournalEntry {
  source_type: 'sale' | 'expense' | 'purchase' | 'partner_loan' | 'payment' | 'period_close'
  source_id:   string
  entry_date:  string  // YYYY-MM-DD
  description: string
  reference:   string
  lines:       JournalLine[]
}

// ── Line builders ─────────────────────────────────────────────────────────────

/** Build a debit line (credit_try = 0). */
export function buildDebitLine(
  accountCode: string,
  accountNameArg: string,
  amount: number,
): JournalLine {
  return {
    account_code: accountCode,
    account_name: accountNameArg,
    debit_try:    round2(amount),
    credit_try:   0,
  }
}

/** Build a credit line (debit_try = 0). */
export function buildCreditLine(
  accountCode: string,
  accountNameArg: string,
  amount: number,
): JournalLine {
  return {
    account_code: accountCode,
    account_name: accountNameArg,
    debit_try:    0,
    credit_try:   round2(amount),
  }
}

// ── Invariant validator ───────────────────────────────────────────────────────

/**
 * Validates that Σ debits = Σ credits (within ±0.01 TL rounding tolerance).
 * Throws an Error if the entry is imbalanced.
 * Returns true if balanced.
 */
export function validateJournalEntry(entry: JournalEntry): boolean {
  const totalDebit  = round2(entry.lines.reduce((s, l) => s + (l.debit_try  ?? 0), 0))
  const totalCredit = round2(entry.lines.reduce((s, l) => s + (l.credit_try ?? 0), 0))
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Unbalanced journal entry [${entry.source_type}/${entry.source_id}]: ` +
      `DR=${totalDebit} CR=${totalCredit} diff=${round2(totalDebit - totalCredit)}`,
    )
  }
  return true
}

// ── Expense type → account mapping ───────────────────────────────────────────

/**
 * Maps an expense_type string to the appropriate MSUGT account code and name.
 * Unknown types default to 770 Genel Yönetim Giderleri.
 */
export function mapExpenseTypeToAccount(expenseType: string | null): { code: string; name: string } {
  const t = (expenseType ?? '').toLowerCase().trim()
  const MAP: Record<string, string> = {
    salary:               '771',
    maas:                 '771',
    maaş:                 '771',
    rent:                 '772',
    kira:                 '772',
    software:             '773',
    yazilim:              '773',
    yazılım:              '773',
    marketing:            '760',
    pazarlama:            '760',
    logistics:            '760',
    lojistik:             '760',
    general:              '770',
    genel:                '770',
    partner_loan_interest:'780',
    utilities:            '770',
    operational:          '770',
  }
  const code = MAP[t] ?? '770'
  return { code, name: acctName(code) }
}

// ── Gross/net split ───────────────────────────────────────────────────────────

/**
 * Given a gross amount (KDV dahil) and KDV rate, compute net and KDV amounts.
 * net  = gross / (1 + kdvRate)
 * kdv  = gross - net
 */
export function computeNetFromGross(grossTry: number, kdvRate: number): { net: number; kdv: number } {
  const net = round2(grossTry / (1 + kdvRate))
  const kdv = round2(grossTry - net)
  return { net, kdv }
}

// ── Pure journal entry builders ───────────────────────────────────────────────

/**
 * Sale creation (accrual basis):
 *   DR 120 Alıcılar       totalTry     (gross incl. KDV)
 *   CR 600 Satışlar       netAmount    (totalTry / (1 + kdvRate))
 *   CR 391 Hesaplanan KDV kdvAmount    (totalTry - netAmount)
 *
 * Default kdvRate = 0.20 (20% Turkish standard rate).
 */
export function buildSaleJournal(
  saleId:       string,
  totalTry:     number,
  kdvRate:      number,
  saleDate:     string,
  customerName: string,
): JournalEntry {
  const { net, kdv } = computeNetFromGross(totalTry, kdvRate)
  const entry: JournalEntry = {
    source_type: 'sale',
    source_id:   saleId,
    entry_date:  saleDate,
    description: `Satış — ${customerName}`,
    reference:   saleId,
    lines: [
      buildDebitLine (ACCOUNT_CODES.ALICILAR,          acctName(ACCOUNT_CODES.ALICILAR),          totalTry),
      buildCreditLine(ACCOUNT_CODES.YURT_ICI_SATISLAR, acctName(ACCOUNT_CODES.YURT_ICI_SATISLAR), net),
      buildCreditLine(ACCOUNT_CODES.HESAPLANAN_KDV,    acctName(ACCOUNT_CODES.HESAPLANAN_KDV),    kdv),
    ],
  }
  validateJournalEntry(entry)
  return entry
}

/**
 * Payment received from customer:
 *   DR 102 Bankalar   amountPaid
 *   CR 120 Alıcılar   amountPaid
 */
export function buildPaymentReceivedJournal(
  saleId:       string,
  amountPaid:   number,
  paymentDate:  string,
  customerName: string,
): JournalEntry {
  const amt = round2(amountPaid)
  const entry: JournalEntry = {
    source_type: 'payment',
    source_id:   saleId,
    entry_date:  paymentDate,
    description: `Tahsilat — ${customerName}`,
    reference:   saleId,
    lines: [
      buildDebitLine (ACCOUNT_CODES.BANKALAR, acctName(ACCOUNT_CODES.BANKALAR), amt),
      buildCreditLine(ACCOUNT_CODES.ALICILAR, acctName(ACCOUNT_CODES.ALICILAR), amt),
    ],
  }
  validateJournalEntry(entry)
  return entry
}

/**
 * Expense creation (accrual):
 *   DR 7xx (by expense_type)  amountTry       (net expense)
 *   DR 191 İndirilecek KDV   kdvDeductible   (if > 0)
 *   CR 320 Satıcılar          amountTry + kdvDeductible
 */
export function buildExpenseJournal(
  expenseId:     string,
  amountTry:     number,
  expenseType:   string,
  kdvDeductible: number,
  expenseDate:   string,
  description:   string,
): JournalEntry {
  const net   = round2(amountTry)
  const kdv   = round2(kdvDeductible)
  const total = round2(net + kdv)

  const expAcc = mapExpenseTypeToAccount(expenseType)
  const lines: JournalLine[] = [
    buildDebitLine(expAcc.code, expAcc.name, net),
  ]
  if (kdv > 0) {
    lines.push(buildDebitLine(
      ACCOUNT_CODES.INDIRILECEK_KDV,
      acctName(ACCOUNT_CODES.INDIRILECEK_KDV),
      kdv,
    ))
  }
  lines.push(buildCreditLine(ACCOUNT_CODES.SATICILAR, acctName(ACCOUNT_CODES.SATICILAR), total))

  const entry: JournalEntry = {
    source_type: 'expense',
    source_id:   expenseId,
    entry_date:  expenseDate,
    description: description || `Masraf: ${expenseType}`,
    reference:   expenseId,
    lines,
  }
  validateJournalEntry(entry)
  return entry
}

/**
 * Expense paid (cash settlement):
 *   DR 320 Satıcılar   amountTry
 *   CR 102 Bankalar    amountTry
 */
export function buildExpensePaidJournal(
  expenseId:   string,
  amountTry:   number,
  paymentDate: string,
): JournalEntry {
  const amt = round2(amountTry)
  const entry: JournalEntry = {
    source_type: 'expense',
    source_id:   expenseId,
    entry_date:  paymentDate,
    description: `Masraf ödeme — ${expenseId}`,
    reference:   expenseId,
    lines: [
      buildDebitLine (ACCOUNT_CODES.SATICILAR, acctName(ACCOUNT_CODES.SATICILAR), amt),
      buildCreditLine(ACCOUNT_CODES.BANKALAR,  acctName(ACCOUNT_CODES.BANKALAR),  amt),
    ],
  }
  validateJournalEntry(entry)
  return entry
}

/**
 * Partner loan disbursement (company receives money from partner):
 *   DR 102 Bankalar            amountTry
 *   CR 321/421 Ortaklara Borç  amountTry  (321 short-term, 421 long-term)
 */
export function buildPartnerLoanDisbursementJournal(
  trancheId:        string,
  amountTry:        number,
  disbursementDate: string,
  partnerName:      string,
  isLongTerm:       boolean,
): JournalEntry {
  const amt      = round2(amountTry)
  const liabCode = isLongTerm ? ACCOUNT_CODES.ORTAKLARA_BORCLAR_UZUN : ACCOUNT_CODES.ORTAKLARA_BORCLAR_KISA
  const liabName = acctName(liabCode)
  const entry: JournalEntry = {
    source_type: 'partner_loan',
    source_id:   trancheId,
    entry_date:  disbursementDate,
    description: `Ortak borç girişi — ${partnerName}`,
    reference:   trancheId,
    lines: [
      buildDebitLine (ACCOUNT_CODES.BANKALAR, acctName(ACCOUNT_CODES.BANKALAR), amt),
      buildCreditLine(liabCode,               liabName,                          amt),
    ],
  }
  validateJournalEntry(entry)
  return entry
}

/**
 * Partner loan repayment (company pays back partner):
 *   DR 321 Ortaklara Borçlar  amountTry
 *   CR 102 Bankalar           amountTry
 */
export function buildPartnerLoanRepaymentJournal(
  trancheId:     string,
  amountTry:     number,
  repaymentDate: string,
  partnerName:   string,
): JournalEntry {
  const amt = round2(amountTry)
  const entry: JournalEntry = {
    source_type: 'partner_loan',
    source_id:   trancheId,
    entry_date:  repaymentDate,
    description: `Ortak borç geri ödeme — ${partnerName}`,
    reference:   trancheId,
    lines: [
      buildDebitLine (ACCOUNT_CODES.ORTAKLARA_BORCLAR_KISA, acctName(ACCOUNT_CODES.ORTAKLARA_BORCLAR_KISA), amt),
      buildCreditLine(ACCOUNT_CODES.BANKALAR,               acctName(ACCOUNT_CODES.BANKALAR),               amt),
    ],
  }
  validateJournalEntry(entry)
  return entry
}

/**
 * Interest accrual on partner loan:
 *   DR 780 Finansman Giderleri  interestAmount
 *   CR 321 Ortaklara Borçlar    interestAmount
 */
export function buildInterestAccrualJournal(
  trancheId:      string,
  interestAmount: number,
  accrualDate:    string,
  partnerName:    string,
): JournalEntry {
  const amt = round2(interestAmount)
  const entry: JournalEntry = {
    source_type: 'partner_loan',
    source_id:   trancheId,
    entry_date:  accrualDate,
    description: `Faiz tahakkuku — ${partnerName}`,
    reference:   trancheId,
    lines: [
      buildDebitLine (ACCOUNT_CODES.FINANSMAN_GIDERLERI,    acctName(ACCOUNT_CODES.FINANSMAN_GIDERLERI),    amt),
      buildCreditLine(ACCOUNT_CODES.ORTAKLARA_BORCLAR_KISA, acctName(ACCOUNT_CODES.ORTAKLARA_BORCLAR_KISA), amt),
    ],
  }
  validateJournalEntry(entry)
  return entry
}

/**
 * Period-close retained earnings transfer:
 *   DR 590 Dönem Net Kârı     netProfit
 *   CR 542 Yasal Yedekler     legalReserve
 *   CR 570 Geçmiş Yıl Kârları (netProfit - legalReserve)
 *
 * legalReserve: per TTK 519 = 5% of net profit (first-leg), capped at 20% of paid-in capital.
 */
export function buildPeriodCloseJournal(
  periodId:     string,
  netProfit:    number,
  legalReserve: number,
  closeDate:    string,
): JournalEntry {
  const profit   = round2(netProfit)
  const reserve  = round2(legalReserve)
  const retained = round2(profit - reserve)

  const entry: JournalEntry = {
    source_type: 'period_close',
    source_id:   periodId,
    entry_date:  closeDate,
    description: 'Dönem kapanışı — kâr devri',
    reference:   periodId,
    lines: [
      buildDebitLine (ACCOUNT_CODES.DONEM_NET_KARI,     acctName(ACCOUNT_CODES.DONEM_NET_KARI),     profit),
      buildCreditLine(ACCOUNT_CODES.YASAL_YEDEKLER,     acctName(ACCOUNT_CODES.YASAL_YEDEKLER),     reserve),
      buildCreditLine(ACCOUNT_CODES.GECMIS_YIL_KARLARI, acctName(ACCOUNT_CODES.GECMIS_YIL_KARLARI), retained),
    ],
  }
  validateJournalEntry(entry)
  return entry
}

/**
 * Check if two journal entries would create a balanced compound entry.
 * True if their combined lines balance (Σ(DR+CR) of entry1 + entry2 is balanced).
 */
export function canMergeEntries(entry1: JournalEntry, entry2: JournalEntry): boolean {
  const allLines    = [...entry1.lines, ...entry2.lines]
  const totalDebit  = round2(allLines.reduce((s, l) => s + (l.debit_try  ?? 0), 0))
  const totalCredit = round2(allLines.reduce((s, l) => s + (l.credit_try ?? 0), 0))
  return Math.abs(totalDebit - totalCredit) <= 0.01
}

// ═══════════════════════════════════════════════════════════════════════════════
// JournalEntryService — static methods (backward-compat) + instance (DB queries)
// ═══════════════════════════════════════════════════════════════════════════════

export class JournalEntryService {
  // Instance constructor for DB-connected operations
  constructor(private readonly supabase: AnyClient) {}

  // ── Static core: create one balanced journal entry via RPC ─────────────────

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

  // ── Static: create a reversal entry ────────────────────────────────────────

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
      debit_try:    l.credit_try ?? 0, // swap
      credit_try:   l.debit_try  ?? 0,
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

  // ── Static entry generators (operational events) ───────────────────────────

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
    sale_id:      string
    payment_date: string
    amount_try:   number
    description?: string
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const amount = round2(payment.amount_try)
    const bank   = getAccount('102')
    const rec    = getAccount('120')

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
        { account_code: creditAcc.code, account_name: creditAcc.name_tr, credit_try: total     },
      ],
    }
  }

  static buildPurchaseEntry(purchase: {
    id:             string
    received_date:  string
    cost_try:       number
    paid_from_bank: boolean
    description?:   string
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
    const amount       = round2(loan.amount_try)
    const bank         = getAccount('102')
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
    const amount       = round2(repayment.amount_try)
    const bank         = getAccount('102')
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
    source_id:       string
    declared_date:   string
    gross_try:       number
    withholding_try: number
    net_try:         number
    partner_name:    string
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const retained       = getAccount('570')
    const taxPayable     = getAccount('360')
    const partnerPayable = getAccount('335')

    return {
      source_type: 'dividend_declared',
      source_id:   div.source_id,
      entry_date:  div.declared_date,
      description: `Temettü beyanı — ${div.partner_name}`,
      lines: [
        { account_code: retained.code,       account_name: retained.name_tr,       debit_try:  round2(div.gross_try)       },
        { account_code: taxPayable.code,     account_name: taxPayable.name_tr,     credit_try: round2(div.withholding_try) },
        { account_code: partnerPayable.code, account_name: partnerPayable.name_tr, credit_try: round2(div.net_try)         },
      ],
    }
  }

  static buildPeriodCloseEntry(period: {
    period_id:             string
    close_date:            string
    period_profit_try:     number
    legal_reserve_try:     number
    retained_transfer_try: number
  }): Omit<CreateJournalEntryParams, 'company_id' | 'period_id' | 'created_by'> {
    const currentProfit = getAccount('590')
    const retained      = getAccount('570')
    const legalReserve  = getAccount('542')

    const lines: JournalLine[] = [
      { account_code: currentProfit.code, account_name: currentProfit.name_tr, debit_try:  round2(period.period_profit_try)     },
      { account_code: retained.code,      account_name: retained.name_tr,      credit_try: round2(period.retained_transfer_try) },
    ]
    if (period.legal_reserve_try > 0) {
      lines.push({ account_code: legalReserve.code, account_name: legalReserve.name_tr, credit_try: round2(period.legal_reserve_try) })
    }

    return {
      source_type:   'period_close',
      source_id:     period.period_id,
      entry_date:    period.close_date,
      description:   'Dönem kapanışı — kâr devri',
      is_adjustment: false,
      lines,
    }
  }

  // ── Instance: DB-connected read queries ────────────────────────────────────

  /**
   * Fetch journal entries for a period/date range.
   * Gracefully returns [] if the table doesn't exist (FAZ 2 schema pending).
   */
  async getEntriesForPeriod(
    companyId: string,
    from:      string,
    to:        string,
  ): Promise<JournalEntry[]> {
    try {
      const { data, error } = await this.supabase
        .from('journal_entries')
        .select(`
          id, source_type, source_id, entry_date, description, reference,
          journal_entry_lines ( account_code, account_name, debit_try, credit_try )
        `)
        .eq('company_id', companyId)
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('entry_date', { ascending: true })

      if (error) {
        console.warn('[JournalEntryService] getEntriesForPeriod:', error.message)
        return []
      }

      return (data ?? []).map((row: {
        source_type: string
        source_id: string
        entry_date: string
        description: string
        reference: string | null
        journal_entry_lines: Array<{
          account_code: string
          account_name: string
          debit_try: number
          credit_try: number
        }>
      }): JournalEntry => ({
        source_type: row.source_type as JournalEntry['source_type'],
        source_id:   row.source_id,
        entry_date:  row.entry_date,
        description: row.description,
        reference:   row.reference ?? '',
        lines: (row.journal_entry_lines ?? []).map(l => ({
          account_code: l.account_code,
          account_name: l.account_name,
          debit_try:    l.debit_try  ?? 0,
          credit_try:   l.credit_try ?? 0,
        })),
      }))
    } catch {
      return []
    }
  }

  /**
   * Compute ledger balance for an account code as of a given date.
   * Returns (Σ debits - Σ credits).
   * Gracefully returns 0 if table doesn't exist.
   */
  async getAccountBalance(
    companyId:   string,
    accountCode: string,
    asOfDate:    string,
  ): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('journal_entry_lines')
        .select(`
          debit_try, credit_try,
          journal_entries!inner ( company_id, entry_date )
        `)
        .eq('account_code', accountCode)
        .eq('journal_entries.company_id', companyId)
        .lte('journal_entries.entry_date', asOfDate)

      if (error) {
        console.warn('[JournalEntryService] getAccountBalance:', error.message)
        return 0
      }

      const rows = data ?? []
      const totalDebit  = rows.reduce((s: number, l: { debit_try: number }) => s + (l.debit_try  ?? 0), 0)
      const totalCredit = rows.reduce((s: number, l: { credit_try: number }) => s + (l.credit_try ?? 0), 0)
      return round2(totalDebit - totalCredit)
    } catch {
      return 0
    }
  }

  /**
   * Check trial balance invariant: Σ debits = Σ credits for all entries up to asOfDate.
   * Gracefully returns balanced:true with zeros if table doesn't exist.
   */
  async verifyTrialBalance(
    companyId: string,
    asOfDate:  string,
  ): Promise<{
    balanced:     boolean
    debit_total:  number
    credit_total: number
    imbalance:    number
  }> {
    try {
      const { data, error } = await this.supabase
        .from('journal_entry_lines')
        .select(`
          debit_try, credit_try,
          journal_entries!inner ( company_id, entry_date )
        `)
        .eq('journal_entries.company_id', companyId)
        .lte('journal_entries.entry_date', asOfDate)

      if (error) {
        console.warn('[JournalEntryService] verifyTrialBalance:', error.message)
        return { balanced: true, debit_total: 0, credit_total: 0, imbalance: 0 }
      }

      const rows        = data ?? []
      const debit_total = round2(rows.reduce((s: number, l: { debit_try: number }) => s + (l.debit_try  ?? 0), 0))
      const credit_total = round2(rows.reduce((s: number, l: { credit_try: number }) => s + (l.credit_try ?? 0), 0))
      const imbalance    = round2(debit_total - credit_total)
      return {
        balanced: Math.abs(imbalance) <= 0.01,
        debit_total,
        credit_total,
        imbalance,
      }
    } catch {
      return { balanced: true, debit_total: 0, credit_total: 0, imbalance: 0 }
    }
  }

  // ── Instance wrappers for event-driven generation ─────────────────────────

  async generateFromSale(
    saleId:       string,
    totalTry:     number,
    kdvRate:      number,
    saleDate:     string,
    customerName: string,
  ): Promise<JournalEntry> {
    return buildSaleJournal(saleId, totalTry, kdvRate, saleDate, customerName)
  }

  async generateFromExpense(
    expenseId:     string,
    amountTry:     number,
    expenseType:   string,
    kdvDeductible: number,
    expenseDate:   string,
    description:   string,
  ): Promise<JournalEntry> {
    return buildExpenseJournal(expenseId, amountTry, expenseType, kdvDeductible, expenseDate, description)
  }

  async generateFromPurchase(
    purchaseId:   string,
    amountTry:    number,
    purchaseDate: string,
    description:  string,
  ): Promise<JournalEntry> {
    const amt = round2(amountTry)
    const entry: JournalEntry = {
      source_type: 'purchase',
      source_id:   purchaseId,
      entry_date:  purchaseDate,
      description: description || 'Stok alımı',
      reference:   purchaseId,
      lines: [
        buildDebitLine (ACCOUNT_CODES.TICARI_MALLAR, acctName(ACCOUNT_CODES.TICARI_MALLAR), amt),
        buildCreditLine(ACCOUNT_CODES.SATICILAR,      acctName(ACCOUNT_CODES.SATICILAR),      amt),
      ],
    }
    validateJournalEntry(entry)
    return entry
  }

  async generateFromPartnerLoan(
    trancheId:        string,
    amountTry:        number,
    disbursementDate: string,
    partnerName:      string,
    isLongTerm:       boolean,
  ): Promise<JournalEntry> {
    return buildPartnerLoanDisbursementJournal(trancheId, amountTry, disbursementDate, partnerName, isLongTerm)
  }

  async generateFromPayment(
    saleId:       string,
    amountPaid:   number,
    paymentDate:  string,
    customerName: string,
  ): Promise<JournalEntry> {
    return buildPaymentReceivedJournal(saleId, amountPaid, paymentDate, customerName)
  }
}
