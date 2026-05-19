// ─────────────────────────────────────────────────────────────────────────────
// lib/simulation/company-scenario.ts
//
// Operational Scenario Generator — TYPE E Real Company Simulation Engine
//
// PURPOSE:
//   Generate deterministic, realistic sequences of company transactions for
//   a given month or full year. Used to:
//     1. Stress-test API routes and financial state transitions
//     2. Discover edge cases in operational flows (FX exposure, overdue
//        escalation, partner repayment overshoot, period close with pending)
//     3. Seed development/staging environments with realistic data
//
// PRINCIPLES:
//   - Pure TypeScript, zero side effects. Produces ScenarioTransaction[] only.
//   - Deterministic given a seed (same seed → same scenario).
//   - No mocked intelligence. All values are operationally realistic for
//     Turkish SMEs (₺300K–₺2M monthly revenue range).
//   - Financial correctness: KDV calculations use round2(), amounts are
//     realistic multiples, FX rates track real corridor drift.
//
// USAGE:
//   const scenario = generateMonthScenario(profile, monthIndex, seed)
//   // Replay each transaction against the API to stress-test the system
//   for (const tx of scenario.transactions) { ... }
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

// ── Types ──────────────────────────────────────────────────────────────────

export type ScenarioEventKind =
  | 'sale_create'
  | 'sale_payment'            // full or partial collection
  | 'expense_create'
  | 'expense_payment'
  | 'stock_purchase'
  | 'partner_loan_disbursement'
  | 'partner_loan_repayment'
  | 'partner_equity_injection'
  | 'partner_compensation'
  | 'period_close_attempt'

export interface ScenarioTransaction {
  day:         number    // 1-31 within the month
  kind:        ScenarioEventKind
  description: string
  payload:     Record<string, unknown>
  stress_tag?: StressTag  // if this tx is designed to hit a known edge case
}

/** Tags that mark transactions designed to discover specific operational gaps. */
export type StressTag =
  | 'overdue_escalation'        // invoice left unpaid past due_date
  | 'partial_collection'        // payment < total_try
  | 'fx_exposure'               // non-TRY sale left uncollected
  | 'loan_overpayment_attempt'  // repayment > net outstanding (should be blocked)
  | 'period_close_with_pending' // close attempted while workflow approvals pending
  | 'stock_below_reorder'       // sale attempted when stock is critically low
  | 'concurrent_period_close'   // two close attempts in rapid succession
  | 'treasury_compression'      // cash drops below 30-day burn
  | 'delayed_fx_collection'     // FX sale collected at different rate than booked

export interface CompanyProfile {
  /** Display name for the simulated company. */
  name:           string
  /** 2-letter industry code: 'sw' | 'dist' | 'mfg' | 'svc' */
  industry:       'sw' | 'dist' | 'mfg' | 'svc'
  /** Monthly revenue baseline in TRY. */
  monthly_revenue_try: number
  /** Fraction of revenue that is FX-denominated (0–0.5). */
  fx_revenue_ratio:    number
  /** Number of partners (2–5). */
  partner_count:       2 | 3 | 4 | 5
  /** Total outstanding partner loans in TRY at simulation start. */
  partner_loan_total_try: number
  /** Monthly recurring expense total in TRY (rent + salary + software). */
  monthly_fixed_expense_try: number
  /** Average collection delay in calendar days (0 = immediate). */
  avg_collection_delay_days: number
  /** Fraction of sales that go overdue (0–0.3). */
  overdue_rate: number
}

export interface MonthScenario {
  month_index:  number       // 0 = January of simulation year
  year:         number
  month:        number       // 1-12
  transactions: ScenarioTransaction[]
  /** Summary of expected financial state at month end — used for assertion. */
  expected_state: {
    total_invoiced_try:       number
    total_collected_try:      number
    total_expenses_try:       number
    outstanding_receivables:  number
    stress_tags_present:      StressTag[]
  }
}

// ── Deterministic PRNG (xorshift32) ───────────────────────────────────────

function makeRng(seed: number) {
  let s = seed >>> 0 || 1
  return {
    next(): number {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5
      return ((s >>> 0) / 0x100000000)
    },
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min
    },
    pick<T>(arr: T[]): T {
      return arr[Math.floor(this.next() * arr.length)]
    },
    bool(prob: number): boolean {
      return this.next() < prob
    },
  }
}

// ── Reference Data ────────────────────────────────────────────────────────

const CUSTOMER_NAMES_TR = [
  'Anadolu Teknoloji A.Ş.', 'Karadeniz Sistemleri', 'Ege Bilişim Ltd.Şti.',
  'İstanbul Yazılım Çözümleri', 'Ankara Ticaret A.Ş.', 'Bursa Endüstri Çözümleri',
  'Marmara İletişim Ltd.', 'Akdeniz Proje Yönetimi', 'Boğaziçi Danışmanlık',
  'Güneydoğu Entegrasyon A.Ş.', 'Orta Anadolu Dağıtım', 'Trakya Lojistik Ltd.',
]

const PRODUCT_NAMES_TR = [
  'Sunucu Lisansı (Yıllık)', 'Destek Hizmet Paketi', 'Donanım Temin',
  'Yazılım Entegrasyon Hizmeti', 'Bulut Altyapı Kurulumu', 'Teknik Danışmanlık',
  'Ağ Güvenlik Çözümü', 'ERP Modül Lisansı', 'Veri Depolama Birimi',
]

const EXPENSE_DESCRIPTIONS: Record<string, string[]> = {
  salary:    ['Şubat Maaş Ödemeleri', 'Mart Maaş Ödemeleri', 'Nisan Maaş Ödemeleri'],
  rent:      ['Ofis Kira Bedeli', 'Depo Kira Ödemesi'],
  software:  ['Bulut Hizmet Aboneliği', 'Yazılım Lisans Yenileme', 'SaaS Abonelik Paketi'],
  utilities: ['Elektrik ve Doğalgaz', 'İnternet ve Telefon'],
  marketing: ['Dijital Reklam Kampanyası', 'Fuar Katılım Bedeli'],
  logistics: ['Kargo ve Dağıtım Giderleri', 'Lojistik Destek Hizmeti'],
}

const PARTNER_NAMES = ['Ahmet Yılmaz', 'Birkan Kaya', 'Canan Demir', 'Devrim Arslan', 'Elif Yıldız']

/** FX corridor: simulate USD/TRY drift over 12 months. */
function simulatedFxRate(monthIndex: number, rng: ReturnType<typeof makeRng>): number {
  // Baseline ₺32, drift +0.4/month with ±0.3 noise
  const base = 32 + monthIndex * 0.4
  const noise = (rng.next() - 0.5) * 0.6
  return round2(base + noise)
}

// ── Core Generators ───────────────────────────────────────────────────────

function generateSaleTransactions(
  profile:    CompanyProfile,
  year:       number,
  month:      number,   // 1-12
  rng:        ReturnType<typeof makeRng>,
  monthIndex: number,
): ScenarioTransaction[] {
  const txs: ScenarioTransaction[] = []

  // Number of sales this month (8-22 depending on revenue and industry)
  const baseSalesCount = Math.round(profile.monthly_revenue_try / 65_000)
  const salesCount = rng.int(Math.max(4, baseSalesCount - 3), baseSalesCount + 4)

  let totalInvoiced = 0

  for (let i = 0; i < salesCount; i++) {
    const isFxSale = rng.bool(profile.fx_revenue_ratio)
    const currency = isFxSale ? rng.pick(['USD', 'EUR'] as const) : 'TRY'
    const fxRate   = isFxSale ? simulatedFxRate(monthIndex, rng) : 1

    // Sale amount: distributed around monthly_revenue / salesCount with variance
    const baseAmount = profile.monthly_revenue_try / salesCount
    const variance   = rng.next() * 0.6 + 0.7  // 0.7x to 1.3x
    const amountNative = currency === 'TRY'
      ? round2(baseAmount * variance)
      : round2((baseAmount * variance) / fxRate)

    const amountTry = currency === 'TRY' ? amountNative : round2(amountNative * fxRate)
    const kdvRate   = rng.pick([20, 20, 20, 10, 0] as const)
    const saleDay   = rng.int(1, 25)

    // Due date: 15-45 days after sale
    const dueDaysOffset = rng.int(15, 45)
    const saleDate = `${year}-${String(month).padStart(2,'0')}-${String(saleDay).padStart(2,'0')}`
    const dueDate  = offsetDate(saleDate, dueDaysOffset)

    const items = [{
      description: rng.pick(PRODUCT_NAMES_TR),
      quantity:    rng.int(1, 5),
      unit_price:  round2(amountNative / rng.int(1, 5)),
      kdv_rate:    kdvRate,
    }]

    const stress: StressTag[] = []
    if (isFxSale) stress.push('fx_exposure')

    txs.push({
      day:         saleDay,
      kind:        'sale_create',
      description: `${currency !== 'TRY' ? `[FX ${currency}] ` : ''}Satış — ${rng.pick(CUSTOMER_NAMES_TR)}`,
      payload: {
        customer_name: rng.pick(CUSTOMER_NAMES_TR),
        currency,
        fx_rate:       isFxSale ? fxRate : undefined,
        sale_date:     saleDate,
        due_date:      dueDate,
        items,
        notes:         null,
        _amountTry:    amountTry,  // simulation-only metadata
      },
      stress_tag: stress[0],
    })

    totalInvoiced += amountTry

    // Collection behavior
    const isOverdue = rng.bool(profile.overdue_rate)
    if (!isOverdue) {
      const collectionDelay = rng.int(0, profile.avg_collection_delay_days)
      const isPartial       = rng.bool(0.15)
      const paymentDay      = Math.min(28, saleDay + collectionDelay)
      const paymentDate     = `${year}-${String(month).padStart(2,'0')}-${String(paymentDay).padStart(2,'0')}`
      const paidAmount      = isPartial ? round2(amountTry * rng.next() * 0.6 + 0.2) : amountTry

      txs.push({
        day:         paymentDay,
        kind:        'sale_payment',
        description: `Tahsilat — ${isPartial ? 'Kısmi ' : ''}${currency !== 'TRY' ? `[FX rate drift] ` : ''}`,
        payload: {
          _sale_ref:     i,  // simulation-only: index into sales list
          amount_paid:   paidAmount,
          payment_date:  paymentDate,
          _isFxSale:     isFxSale,
        },
        stress_tag: isPartial ? 'partial_collection'
          : (isFxSale ? 'delayed_fx_collection' : undefined),
      })
    } else {
      // Mark as overdue — no payment this month
      txs[txs.length - 1].stress_tag = 'overdue_escalation'
    }
  }

  return txs
}

function generateExpenseTransactions(
  profile:    CompanyProfile,
  year:       number,
  month:      number,
  rng:        ReturnType<typeof makeRng>,
): ScenarioTransaction[] {
  const txs: ScenarioTransaction[] = []
  const monthPad = String(month).padStart(2, '0')

  // Fixed recurring expenses always appear on day 1-5
  const fixedExpenses: Array<{ category: string; amount: number; day: number }> = [
    { category: 'salary',    amount: round2(profile.monthly_fixed_expense_try * 0.55), day: rng.int(1, 3) },
    { category: 'rent',      amount: round2(profile.monthly_fixed_expense_try * 0.25), day: rng.int(3, 5) },
    { category: 'software',  amount: round2(profile.monthly_fixed_expense_try * 0.08), day: rng.int(1, 5) },
    { category: 'utilities', amount: round2(profile.monthly_fixed_expense_try * 0.06), day: rng.int(8, 12) },
  ]

  for (const exp of fixedExpenses) {
    txs.push({
      day:         exp.day,
      kind:        'expense_create',
      description: `${exp.category} — ${rng.pick(EXPENSE_DESCRIPTIONS[exp.category] ?? ['Gider'])}`,
      payload: {
        amount:         exp.amount,
        currency:       'TRY',
        category:       exp.category,
        expense_date:   `${year}-${monthPad}-${String(exp.day).padStart(2,'0')}`,
        payment_status: 'paid',
      },
    })
  }

  // Variable operational expenses (1-3 this month)
  const varCount = rng.int(1, 3)
  for (let i = 0; i < varCount; i++) {
    const day      = rng.int(5, 28)
    const cat      = rng.pick(['marketing', 'logistics', 'general'] as const)
    const amount   = round2(rng.int(5_000, 45_000))
    txs.push({
      day,
      kind:        'expense_create',
      description: `Değişken Gider — ${rng.pick(EXPENSE_DESCRIPTIONS[cat] ?? ['Gider'])}`,
      payload: {
        amount,
        currency:       'TRY',
        category:       cat,
        expense_date:   `${year}-${monthPad}-${String(day).padStart(2,'0')}`,
        payment_status: rng.bool(0.7) ? 'paid' : 'pending',
      },
    })
  }

  return txs
}

function generatePartnerTransactions(
  profile:    CompanyProfile,
  year:       number,
  month:      number,
  monthIndex: number,
  rng:        ReturnType<typeof makeRng>,
  netLoanByPartner: number[],  // current net loan outstanding per partner
): ScenarioTransaction[] {
  const txs: ScenarioTransaction[] = []
  const monthPad = String(month).padStart(2, '0')

  // Occasional (25% chance) partner events this month
  if (!rng.bool(0.25)) return txs

  const partnerIdx  = rng.int(0, profile.partner_count - 1)
  const partnerName = PARTNER_NAMES[partnerIdx]
  const day         = rng.int(5, 25)
  const eventDate   = `${year}-${monthPad}-${String(day).padStart(2,'0')}`

  const eventChoice = rng.pick([
    'disbursement',
    'repayment',
    'repayment',  // weighted: repayments more common
    'equity',
  ] as const)

  if (eventChoice === 'disbursement') {
    const amount = round2(rng.int(100_000, 500_000))
    txs.push({
      day,
      kind:        'partner_loan_disbursement',
      description: `${partnerName} — Ortak Borç Girişi`,
      payload: {
        partner_name: partnerName,
        event_type:   'LOAN_DISBURSEMENT',
        amount_try:   amount,
        event_date:   eventDate,
        description:  `Ortak finansmanı — ${partnerName}`,
      },
    })
  } else if (eventChoice === 'repayment') {
    const outstanding = netLoanByPartner[partnerIdx] ?? 0
    if (outstanding > 10_000) {
      // Normal repayment: 10-40% of outstanding
      const normalPct = rng.next() * 0.3 + 0.1
      const normalAmt = round2(outstanding * normalPct)

      // Stress: occasionally attempt overpayment
      const isOverpaymentAttempt = rng.bool(0.12)
      const amount = isOverpaymentAttempt
        ? round2(outstanding * (rng.next() * 0.5 + 1.05))  // 105-155% of outstanding
        : normalAmt

      txs.push({
        day,
        kind:        'partner_loan_repayment',
        description: `${partnerName} — ${isOverpaymentAttempt ? '[STRESS: aşım denemesi] ' : ''}Geri Ödeme`,
        payload: {
          partner_name:  partnerName,
          event_type:    'LOAN_REPAYMENT',
          amount_try:    amount,
          event_date:    eventDate,
          description:   `Geri ödeme — ${partnerName}`,
          _outstanding:  outstanding,  // simulation metadata
        },
        stress_tag: isOverpaymentAttempt ? 'loan_overpayment_attempt' : undefined,
      })
    }
  } else if (eventChoice === 'equity') {
    const amount = round2(rng.int(50_000, 250_000))
    txs.push({
      day,
      kind:        'partner_equity_injection',
      description: `${partnerName} — Sermaye Ödemesi`,
      payload: {
        partner_name: partnerName,
        event_type:   'EQUITY_PAYMENT',
        amount_try:   amount,
        event_date:   eventDate,
        description:  `Sermaye ödemesi — ${partnerName}`,
      },
    })
  }

  return txs
}

// ── Period Close Attempt ───────────────────────────────────────────────────

function generatePeriodCloseAttempt(
  year:       number,
  month:      number,
  hasPendingWorkflows: boolean,
): ScenarioTransaction {
  const monthPad = String(month).padStart(2, '0')
  const lastDay  = new Date(year, month, 0).getDate()
  return {
    day:         lastDay,
    kind:        'period_close_attempt',
    description: `Dönem Kapanış Girişimi — ${month}/${year}${hasPendingWorkflows ? ' [onay bekleyen gider var]' : ''}`,
    payload: {
      _month: month,
      _year:  year,
      _close_date: `${year}-${monthPad}-${String(lastDay).padStart(2,'0')}`,
    },
    stress_tag: hasPendingWorkflows ? 'period_close_with_pending' : undefined,
  }
}

// ── Treasury Compression Detector ─────────────────────────────────────────

function tagTreasuryCompression(
  txs: ScenarioTransaction[],
  monthlyBurnEstimate: number,
): ScenarioTransaction[] {
  // Compute running cash estimate from transactions
  // If net cash after expenses < 30-day burn, tag treasury_compression
  const totalCollected = txs
    .filter(t => t.kind === 'sale_payment')
    .reduce((s, t) => s + Number(t.payload.amount_paid ?? 0), 0)
  const totalExpenses  = txs
    .filter(t => t.kind === 'expense_create')
    .reduce((s, t) => s + Number(t.payload.amount ?? 0), 0)
  const netCashFlow    = totalCollected - totalExpenses

  if (netCashFlow < monthlyBurnEstimate) {
    // Tag the last expense transaction as treasury_compression
    const lastExpense = [...txs].reverse().find(t => t.kind === 'expense_create')
    if (lastExpense) lastExpense.stress_tag = 'treasury_compression'
  }
  return txs
}

// ── Date Utilities ────────────────────────────────────────────────────────

function offsetDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a single month's worth of realistic company transactions.
 *
 * @param profile       Company profile parameters
 * @param monthIndex    0-based month index (0 = Jan of simulation year)
 * @param seed          Deterministic RNG seed (default: monthIndex + 1)
 * @param simYear       Calendar year for the simulation (default: 2026)
 * @param netLoanByPartner  Current net loan outstanding per partner, indexed by position
 */
export function generateMonthScenario(
  profile:          CompanyProfile,
  monthIndex:       number,
  seed?:            number,
  simYear?:         number,
  netLoanByPartner: number[] = [],
): MonthScenario {
  const year   = simYear ?? 2026
  const month  = (monthIndex % 12) + 1  // 1-12
  const rng    = makeRng(seed ?? (monthIndex * 1337 + 42))

  const saleTxs    = generateSaleTransactions(profile, year, month, rng, monthIndex)
  const expenseTxs = generateExpenseTransactions(profile, year, month, rng)
  const partnerTxs = generatePartnerTransactions(
    profile, year, month, monthIndex, rng, netLoanByPartner,
  )

  // Period close attempt at month end
  const hasPendingWorkflows = expenseTxs.some(
    t => t.kind === 'expense_create' && t.payload.payment_status === 'pending',
  )
  const periodCloseTx = generatePeriodCloseAttempt(year, month, hasPendingWorkflows)

  const allTxs = [
    ...saleTxs,
    ...expenseTxs,
    ...partnerTxs,
    periodCloseTx,
  ].sort((a, b) => a.day - b.day)

  // Tag treasury compression
  const finalTxs = tagTreasuryCompression(allTxs, profile.monthly_fixed_expense_try)

  // Compute expected state
  const totalInvoiced = saleTxs
    .filter(t => t.kind === 'sale_create')
    .reduce((s, t) => s + Number(t.payload._amountTry ?? 0), 0)
  const totalCollected = saleTxs
    .filter(t => t.kind === 'sale_payment')
    .reduce((s, t) => s + Number(t.payload.amount_paid ?? 0), 0)
  const totalExpenses = expenseTxs
    .reduce((s, t) => s + Number(t.payload.amount ?? 0), 0)
  const stressTags = [...new Set(
    finalTxs.map(t => t.stress_tag).filter((t): t is StressTag => t !== undefined),
  )]

  return {
    month_index:  monthIndex,
    year,
    month,
    transactions: finalTxs,
    expected_state: {
      total_invoiced_try:      round2(totalInvoiced),
      total_collected_try:     round2(totalCollected),
      total_expenses_try:      round2(totalExpenses),
      outstanding_receivables: round2(totalInvoiced - totalCollected),
      stress_tags_present:     stressTags,
    },
  }
}

/**
 * Generate a full 12-month simulation for a company.
 * Each month's net loan state is carried forward for partner transaction realism.
 */
export function generateYearScenario(
  profile: CompanyProfile,
  seed?:   number,
  year?:   number,
): MonthScenario[] {
  const months: MonthScenario[] = []
  // Track net loan per partner as months progress
  const netLoans: number[] = Array(profile.partner_count).fill(
    profile.partner_loan_total_try / profile.partner_count,
  )

  for (let m = 0; m < 12; m++) {
    const scenario = generateMonthScenario(profile, m, seed ? seed + m * 31 : undefined, year, [...netLoans])
    months.push(scenario)

    // Update net loans based on partner transactions
    for (const tx of scenario.transactions) {
      if (tx.kind === 'partner_loan_disbursement') {
        const pIdx = PARTNER_NAMES.indexOf(String(tx.payload.partner_name ?? ''))
        if (pIdx >= 0 && pIdx < netLoans.length) {
          netLoans[pIdx] = round2(netLoans[pIdx] + Number(tx.payload.amount_try ?? 0))
        }
      } else if (tx.kind === 'partner_loan_repayment') {
        const pIdx = PARTNER_NAMES.indexOf(String(tx.payload.partner_name ?? ''))
        if (pIdx >= 0 && pIdx < netLoans.length) {
          // Only applies if repayment was within bounds (stress_tag = loan_overpayment_attempt skipped)
          if (tx.stress_tag !== 'loan_overpayment_attempt') {
            netLoans[pIdx] = round2(Math.max(0, netLoans[pIdx] - Number(tx.payload.amount_try ?? 0)))
          }
        }
      }
    }
  }

  return months
}

/** Pre-built company profiles for common simulation archetypes. */
export const SCENARIO_PROFILES: Record<string, CompanyProfile> = {
  /** Mid-size Turkish B2B software distributor, heavy FX exposure */
  tech_distributor: {
    name:                     'Teknik Çözümler A.Ş.',
    industry:                 'dist',
    monthly_revenue_try:      950_000,
    fx_revenue_ratio:         0.30,
    partner_count:            3,
    partner_loan_total_try:   2_500_000,
    monthly_fixed_expense_try: 220_000,
    avg_collection_delay_days: 18,
    overdue_rate:              0.12,
  },
  /** Professional services firm, all TRY, tight margins */
  services_firm: {
    name:                     'Anadolu Danışmanlık Ltd.Şti.',
    industry:                 'svc',
    monthly_revenue_try:      480_000,
    fx_revenue_ratio:         0.05,
    partner_count:            2,
    partner_loan_total_try:   800_000,
    monthly_fixed_expense_try: 165_000,
    avg_collection_delay_days: 25,
    overdue_rate:              0.20,
  },
  /** Manufacturing company, high fixed costs, significant FX exposure */
  manufacturer: {
    name:                     'Marmara Üretim A.Ş.',
    industry:                 'mfg',
    monthly_revenue_try:      1_800_000,
    fx_revenue_ratio:         0.45,
    partner_count:            4,
    partner_loan_total_try:   5_500_000,
    monthly_fixed_expense_try: 680_000,
    avg_collection_delay_days: 30,
    overdue_rate:              0.08,
  },
}
