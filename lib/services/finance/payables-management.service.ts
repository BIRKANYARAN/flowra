// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/payables-management.service.ts
//
// Accounts Payable (AP) Management Service
//
// Provides a comprehensive view of outstanding payables with:
//   - Per-item tracking from expenses (payment_status != 'paid')
//   - Purchases tracking (status != 'finalized')
//   - Aging bucket analysis (5 buckets by overdue days)
//   - Vendor profiles aggregated by supplier
//   - DPO (Days Payable Outstanding) calculation
//   - Payment urgency scoring & schedule optimisation
//   - Turkish-language health narratives
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface PayableItem {
  id: string
  source: 'expense' | 'purchase'
  vendor_name: string | null
  category: string | null
  amount_try: number
  amount_paid_try: number
  outstanding_try: number
  due_date: string | null       // YYYY-MM-DD
  created_date: string          // YYYY-MM-DD
  payment_status: string        // 'unpaid' | 'partial' | 'overdue' | 'paid' | 'draft' etc.
  days_until_due: number | null // negative = overdue
  days_outstanding: number      // since created_date
}

export interface VendorPayableProfile {
  vendor_name: string
  total_outstanding: number
  overdue_amount: number
  upcoming_amount: number      // due in next 30 days
  payable_count: number
  oldest_payable_days: number
  avg_payment_terms: number | null  // avg days from creation to due_date
}

export interface PayablesManagementReport {
  as_of_date: string
  total_outstanding_try: number
  overdue_amount_try: number
  overdue_pct: number
  due_next_7_days: number
  due_next_30_days: number
  payable_items: PayableItem[]
  aging_buckets: ReturnType<typeof buildPayableAgingBuckets>
  vendor_profiles: VendorPayableProfile[]
  dpo: number | null
  dpo_health: ReturnType<typeof classifyDpoHealth>
  payables_health: ReturnType<typeof classifyPayablesHealth>
  narrative: string
  top_urgent_payables: Array<PayableItem & { urgency_score: number }>
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/** Returns (dueDate - asOfDate) in days. Negative = overdue. Null if dueDateStr is null. */
export function computeDaysUntilDue(
  dueDateStr: string | null,
  asOfDate: string,
): number | null {
  if (dueDateStr === null) return null
  const msPerDay = 86_400_000
  const due  = new Date(dueDateStr + 'T00:00:00Z').getTime()
  const asOf = new Date(asOfDate   + 'T00:00:00Z').getTime()
  return Math.round((due - asOf) / msPerDay)
}

/** Returns max(0, (asOfDate - createdDateStr) in days). */
export function computeDaysOutstanding(createdDateStr: string, asOfDate: string): number {
  const msPerDay = 86_400_000
  const created = new Date(createdDateStr + 'T00:00:00Z').getTime()
  const asOf    = new Date(asOfDate       + 'T00:00:00Z').getTime()
  return Math.max(0, Math.round((asOf - created) / msPerDay))
}

/** Returns max(0, amount - amountPaid). */
export function computeOutstandingAmount(amount: number, amountPaid: number): number {
  return Math.max(0, amount - amountPaid)
}

/**
 * Classifies a payable's status.
 * Priority order:
 *   paid         → outstandingAmount <= 0 OR originalStatus === 'paid'
 *   no_due_date  → daysUntilDue is null AND outstanding > 0
 *   overdue      → daysUntilDue < 0
 *   due_soon     → daysUntilDue <= 14
 *   current      → otherwise
 */
export function classifyPayableStatus(
  daysUntilDue: number | null,
  outstandingAmount: number,
  originalStatus: string,
): 'paid' | 'current' | 'due_soon' | 'overdue' | 'no_due_date' {
  if (outstandingAmount <= 0 || originalStatus === 'paid') return 'paid'
  if (daysUntilDue === null) return 'no_due_date'
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 14) return 'due_soon'
  return 'current'
}

/**
 * Computes DPO = totalPayables / avgDailyPurchases.
 * Returns null if avgDailyPurchases === 0.
 */
export function computeDpo(
  totalPayables: number,
  avgDailyPurchases: number, // purchases / 30
): number | null {
  if (avgDailyPurchases === 0) return null
  return round2(totalPayables / avgDailyPurchases)
}

/**
 * Classifies DPO health for Turkish SMEs (optimal 30-60 days).
 *   insufficient_data : null
 *   excellent         : 30-60 days (inclusive)
 *   good              : 15-30 OR 60-90 days
 *   adequate          : 7-15 OR 90-120 days
 *   slow              : > 120 days
 *   critical          : < 7 days (paying too fast, losing float)
 */
export function classifyDpoHealth(
  dpo: number | null,
): 'excellent' | 'good' | 'adequate' | 'slow' | 'critical' | 'insufficient_data' {
  if (dpo === null) return 'insufficient_data'
  if (dpo >= 30 && dpo <= 60) return 'excellent'
  if ((dpo >= 15 && dpo < 30) || (dpo > 60 && dpo <= 90)) return 'good'
  if ((dpo >= 7 && dpo < 15) || (dpo > 90 && dpo <= 120)) return 'adequate'
  if (dpo > 120) return 'slow'
  return 'critical' // < 7
}

/**
 * Builds 5 aging buckets based on how many days overdue each payable is.
 * Buckets:
 *   Not yet due  (days_until_due >= 0 or null)
 *   0-30 overdue (days_until_due in [-30, -1])
 *   31-60 overdue
 *   61-90 overdue
 *   90+ overdue
 */
export function buildPayableAgingBuckets(
  payables: PayableItem[],
): Array<{
  label: string
  min_days_overdue: number
  max_days_overdue: number | null
  count: number
  total_outstanding: number
  pct_of_total: number
}> {
  const buckets = [
    { label: 'Vadesi Gelmemiş', min_days_overdue: 0,   max_days_overdue: 0 as number | null,  count: 0, total_outstanding: 0 },
    { label: '0-30 Gün Gecikmiş', min_days_overdue: 1, max_days_overdue: 30,                   count: 0, total_outstanding: 0 },
    { label: '31-60 Gün Gecikmiş', min_days_overdue: 31, max_days_overdue: 60,                 count: 0, total_outstanding: 0 },
    { label: '61-90 Gün Gecikmiş', min_days_overdue: 61, max_days_overdue: 90,                 count: 0, total_outstanding: 0 },
    { label: '90+ Gün Gecikmiş',   min_days_overdue: 91, max_days_overdue: null,               count: 0, total_outstanding: 0 },
  ]

  const totalOutstanding = payables.reduce((s, p) => s + p.outstanding_try, 0)

  for (const p of payables) {
    if (p.outstanding_try <= 0) continue
    const { days_until_due } = p
    let idx: number
    if (days_until_due === null || days_until_due >= 0) {
      idx = 0 // not yet due
    } else {
      const daysOverdue = Math.abs(days_until_due)
      if (daysOverdue <= 30)       idx = 1
      else if (daysOverdue <= 60)  idx = 2
      else if (daysOverdue <= 90)  idx = 3
      else                         idx = 4
    }
    buckets[idx].count += 1
    buckets[idx].total_outstanding += p.outstanding_try
  }

  return buckets.map(b => ({
    label:             b.label,
    min_days_overdue:  b.min_days_overdue,
    max_days_overdue:  b.max_days_overdue,
    count:             b.count,
    total_outstanding: round2(b.total_outstanding),
    pct_of_total:      totalOutstanding > 0 ? round2((b.total_outstanding / totalOutstanding) * 100) : 0,
  }))
}

/** Aggregates all payables for a given vendor into a VendorPayableProfile. */
export function computeVendorProfile(
  payables: PayableItem[],
  vendorName: string,
  asOfDate: string,
): VendorPayableProfile {
  const vendorPayables = payables.filter(p => (p.vendor_name ?? 'Bilinmeyen Tedarikçi') === vendorName)

  let totalOutstanding = 0
  let overdueAmount = 0
  let upcomingAmount = 0
  let oldestDays = 0
  let paymentTermsSum = 0
  let paymentTermsCount = 0

  for (const p of vendorPayables) {
    totalOutstanding += p.outstanding_try

    if (p.days_until_due !== null && p.days_until_due < 0) {
      overdueAmount += p.outstanding_try
    }

    if (p.days_until_due !== null && p.days_until_due >= 0 && p.days_until_due <= 30) {
      upcomingAmount += p.outstanding_try
    }

    if (p.days_outstanding > oldestDays) {
      oldestDays = p.days_outstanding
    }

    if (p.due_date !== null) {
      const termDays = computeDaysUntilDue(p.due_date, p.created_date)
      if (termDays !== null) {
        paymentTermsSum   += termDays
        paymentTermsCount += 1
      }
    }
  }

  return {
    vendor_name:        vendorName,
    total_outstanding:  round2(totalOutstanding),
    overdue_amount:     round2(overdueAmount),
    upcoming_amount:    round2(upcomingAmount),
    payable_count:      vendorPayables.length,
    oldest_payable_days: oldestDays,
    avg_payment_terms:  paymentTermsCount > 0 ? round2(paymentTermsSum / paymentTermsCount) : null,
  }
}

/**
 * Groups payables by vendor, builds a profile for each.
 * Null vendor_name → "Bilinmeyen Tedarikçi".
 * Sorted by total_outstanding DESC.
 */
export function buildVendorProfiles(
  payables: PayableItem[],
  asOfDate: string,
): VendorPayableProfile[] {
  const vendorSet = new Set<string>()
  for (const p of payables) {
    vendorSet.add(p.vendor_name ?? 'Bilinmeyen Tedarikçi')
  }

  const profiles = Array.from(vendorSet).map(v =>
    computeVendorProfile(payables, v, asOfDate),
  )

  profiles.sort((a, b) => b.total_outstanding - a.total_outstanding)
  return profiles
}

/**
 * Computes urgency score 0-100 for payment priority.
 *   paid       : 0
 *   no_due_date: 20
 *   current    : 40
 *   due_soon (<=14 days): 60
 *   due_soon (<=7 days): 70
 *   overdue    : 90 + min(10, daysSinceDue / 3), capped at 100
 */
export function computePaymentUrgencyScore(payable: PayableItem): number {
  const status = classifyPayableStatus(
    payable.days_until_due,
    payable.outstanding_try,
    payable.payment_status,
  )

  if (status === 'paid') return 0
  if (status === 'no_due_date') return 20
  if (status === 'current') return 40

  if (status === 'due_soon') {
    if (payable.days_until_due !== null && payable.days_until_due <= 7) return 70
    return 60
  }

  // overdue
  const daysSinceDue = payable.days_until_due !== null ? Math.abs(payable.days_until_due) : 0
  const score = 90 + Math.min(10, daysSinceDue / 3)
  return Math.min(100, Math.round(score))
}

/**
 * Sorts payables by urgency score DESC and greedily selects until cash exhausted.
 * Does not partial-pay individual items — skips if can't fully cover.
 * Exception: if a single overdue item is the only outstanding item, include even if partial.
 */
export function optimizePaymentSchedule(
  payables: PayableItem[],
  availableCash: number,
): {
  prioritized: Array<PayableItem & { urgency_score: number; selected: boolean }>
  total_to_pay: number
  cash_remaining: number
  coverage_pct: number
} {
  const totalOutstanding = payables.reduce((s, p) => s + p.outstanding_try, 0)

  const withScores = payables.map(p => ({
    ...p,
    urgency_score: computePaymentUrgencyScore(p),
    selected: false as boolean,
  }))

  withScores.sort((a, b) => b.urgency_score - a.urgency_score)

  let cashRemaining = availableCash
  let totalToPay = 0

  // Check edge case: single overdue outstanding item
  const overdueItems = withScores.filter(
    p => p.outstanding_try > 0 &&
         classifyPayableStatus(p.days_until_due, p.outstanding_try, p.payment_status) === 'overdue',
  )
  const allOutstanding = withScores.filter(p => p.outstanding_try > 0)

  for (const p of withScores) {
    if (p.outstanding_try <= 0) {
      p.selected = false
      continue
    }
    if (cashRemaining >= p.outstanding_try) {
      p.selected = true
      cashRemaining -= p.outstanding_try
      totalToPay += p.outstanding_try
    } else {
      // Exception: single overdue item
      const isSingleOverdue =
        overdueItems.length === 1 &&
        allOutstanding.length === 1 &&
        overdueItems[0].id === p.id
      if (isSingleOverdue) {
        p.selected = true
        totalToPay += cashRemaining
        cashRemaining = 0
      } else {
        p.selected = false
      }
    }
  }

  const coveragePct = totalOutstanding > 0 ? round2((totalToPay / totalOutstanding) * 100) : 0

  return {
    prioritized:    withScores,
    total_to_pay:   round2(totalToPay),
    cash_remaining: round2(cashRemaining),
    coverage_pct:   coveragePct,
  }
}

/**
 * Sums outstanding for payables where 0 <= days_until_due <= days (i.e. due within N days).
 */
export function computeCashRequiredNextDays(payables: PayableItem[], days: number): number {
  const sum = payables
    .filter(p => p.days_until_due !== null && p.days_until_due >= 0 && p.days_until_due <= days)
    .reduce((s, p) => s + p.outstanding_try, 0)
  return round2(sum)
}

/**
 * Classifies overall payables health.
 *   critical : overduePct > 30 OR cashCoverageRatio < 0.5
 *   concern  : overduePct > 15 OR cashCoverageRatio < 1.0
 *   watch    : overduePct > 5 OR dpo > 120
 *   healthy  : otherwise
 */
export function classifyPayablesHealth(
  overduePct: number,
  dpo: number | null,
  cashCoverageRatio: number,
): 'healthy' | 'watch' | 'concern' | 'critical' {
  if (overduePct > 30 || cashCoverageRatio < 0.5) return 'critical'
  if (overduePct > 15 || cashCoverageRatio < 1.0) return 'concern'
  if (overduePct > 5 || (dpo !== null && dpo > 120)) return 'watch'
  return 'healthy'
}

/**
 * Generates a Turkish narrative for payables health.
 */
export function generatePayablesNarrative(
  health: ReturnType<typeof classifyPayablesHealth>,
  overdueAmount: number,
  dpo: number | null,
  totalOutstanding: number,
): string {
  switch (health) {
    case 'healthy':
      return 'Borç yönetimi sağlıklı — vadesi geçmiş ödeme bulunmuyor.'
    case 'watch':
      return 'Nakit akışı izlenmeli — bazı ödemeler gecikiyor.'
    case 'concern':
      return `₺${formatAmount(overdueAmount)} vadesi geçmiş ödeme — tedarikçi ilişkileri risk altında.`
    case 'critical':
      return 'Kritik: Ödeme gecikmeleri yüksek — acil nakit yönetimi gerekiyor.'
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── Service class ─────────────────────────────────────────────────────────────

export class PayablesManagementService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string): Promise<PayablesManagementReport> {
    const today = new Date().toISOString().slice(0, 10)

    // ── Fetch data concurrently with graceful fallback ─────────────────────
    const [
      expensesResult,
      purchasesResult,
      expenses30dResult,
      cashResult,
    ] = await Promise.allSettled([
      // 1. Unpaid/partial expenses
      this.supabase
        .from('expenses')
        .select('id, vendor_name, category, amount_try, payment_status, due_date, expense_date, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'paid')
        .order('created_at', { ascending: true }),

      // 2. Non-finalized purchases (no payment tracking but worth tracking)
      this.supabase
        .from('purchases')
        .select('id, supplier_name, purchase_date, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('status', 'eq', 'finalized')
        .not('status', 'eq', 'cancelled'),

      // 3. Last 30 days expenses for DPO denominator
      this.supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', subtractDays(today, 30)),

      // 4. Latest cash balance
      this.supabase
        .from('balance_sheet_snapshots')
        .select('cash_and_equivalents_try, as_of_date')
        .eq('company_id', companyId)
        .order('as_of_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // ── Build PayableItems from expenses ──────────────────────────────────
    const expenseRows =
      expensesResult.status === 'fulfilled' ? (expensesResult.value.data ?? []) : []

    const expenseItems: PayableItem[] = expenseRows.map((row: {
      id: string
      vendor_name: string | null
      category: string | null
      amount_try: number | null
      payment_status: string
      due_date: string | null
      expense_date: string | null
      created_at: string
    }) => {
      const amountTry   = round2(Number(row.amount_try) || 0)
      const amountPaid  = 0 // expenses don't have amount_paid column
      const outstanding = computeOutstandingAmount(amountTry, amountPaid)
      const createdDate = (row.expense_date ?? row.created_at ?? today).slice(0, 10)
      const daysUntilDue = computeDaysUntilDue(row.due_date, today)
      const daysOutstanding = computeDaysOutstanding(createdDate, today)

      return {
        id:               row.id,
        source:           'expense' as const,
        vendor_name:      row.vendor_name ?? null,
        category:         row.category ?? null,
        amount_try:       amountTry,
        amount_paid_try:  amountPaid,
        outstanding_try:  outstanding,
        due_date:         row.due_date ?? null,
        created_date:     createdDate,
        payment_status:   row.payment_status,
        days_until_due:   daysUntilDue,
        days_outstanding: daysOutstanding,
      }
    })

    // ── Build PayableItems from purchases ─────────────────────────────────
    const purchaseRows =
      purchasesResult.status === 'fulfilled' ? (purchasesResult.value.data ?? []) : []

    const purchaseItems: PayableItem[] = purchaseRows.map((row: {
      id: string
      supplier_name: string | null
      purchase_date: string | null
      created_at: string
    }) => {
      // Purchases have no amount on the header; they are draft/pending commitments
      const createdDate = (row.purchase_date ?? row.created_at ?? today).slice(0, 10)
      const daysOutstanding = computeDaysOutstanding(createdDate, today)

      return {
        id:               row.id,
        source:           'purchase' as const,
        vendor_name:      row.supplier_name ?? null,
        category:         null,
        amount_try:       0,
        amount_paid_try:  0,
        outstanding_try:  0,
        due_date:         null,
        created_date:     createdDate,
        payment_status:   'draft',
        days_until_due:   null,
        days_outstanding: daysOutstanding,
      }
    })

    const allPayables = [...expenseItems, ...purchaseItems]

    // ── Totals ─────────────────────────────────────────────────────────────
    const totalOutstanding = round2(allPayables.reduce((s, p) => s + p.outstanding_try, 0))

    const overdueItems = allPayables.filter(p => p.days_until_due !== null && p.days_until_due < 0 && p.outstanding_try > 0)
    const overdueAmount = round2(overdueItems.reduce((s, p) => s + p.outstanding_try, 0))
    const overduePct = totalOutstanding > 0 ? round2((overdueAmount / totalOutstanding) * 100) : 0

    const due7  = computeCashRequiredNextDays(allPayables, 7)
    const due30 = computeCashRequiredNextDays(allPayables, 30)

    // ── Aging buckets ──────────────────────────────────────────────────────
    const agingBuckets = buildPayableAgingBuckets(allPayables)

    // ── Vendor profiles ────────────────────────────────────────────────────
    const vendorProfiles = buildVendorProfiles(allPayables, today)

    // ── DPO ────────────────────────────────────────────────────────────────
    const expenses30dRows =
      expenses30dResult.status === 'fulfilled' ? (expenses30dResult.value.data ?? []) : []
    const totalPurchases30d = expenses30dRows.reduce(
      (s: number, r: { amount_try: number | null }) => s + (Number(r.amount_try) || 0),
      0,
    )
    const avgDailyPurchases = totalPurchases30d / 30
    const dpo = computeDpo(totalOutstanding, avgDailyPurchases)
    const dpoHealth = classifyDpoHealth(dpo)

    // ── Cash coverage ──────────────────────────────────────────────────────
    const cashRow =
      cashResult.status === 'fulfilled' ? cashResult.value.data : null
    const availableCash = cashRow ? (Number((cashRow as { cash_and_equivalents_try?: number | null }).cash_and_equivalents_try) || 0) : 0
    const cashCoverageRatio = totalOutstanding > 0 ? availableCash / totalOutstanding : 1

    // ── Health classification ──────────────────────────────────────────────
    const payablesHealth = classifyPayablesHealth(overduePct, dpo, cashCoverageRatio)
    const narrative = generatePayablesNarrative(payablesHealth, overdueAmount, dpo, totalOutstanding)

    // ── Top urgent payables ────────────────────────────────────────────────
    const withScores = allPayables
      .filter(p => p.outstanding_try > 0)
      .map(p => ({ ...p, urgency_score: computePaymentUrgencyScore(p) }))
      .sort((a, b) => b.urgency_score - a.urgency_score)
    const topUrgent = withScores.slice(0, 10)

    return {
      as_of_date:           today,
      total_outstanding_try: totalOutstanding,
      overdue_amount_try:    overdueAmount,
      overdue_pct:           overduePct,
      due_next_7_days:       due7,
      due_next_30_days:      due30,
      payable_items:         allPayables,
      aging_buckets:         agingBuckets,
      vendor_profiles:       vendorProfiles,
      dpo,
      dpo_health:            dpoHealth,
      payables_health:       payablesHealth,
      narrative,
      top_urgent_payables:   topUrgent,
    }
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
