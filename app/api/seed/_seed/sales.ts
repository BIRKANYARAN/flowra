import type { SupabaseClient } from '@supabase/supabase-js'

interface Ctx { supabase: SupabaseClient; uid: string; companyId: string }

// ── Realistic Turkish-SME sales spread over the last ~6 months ────────────────
// Lights up: Satışlar, 6-month revenue trend, P&L / Cashflow (revenue side),
// Tahsilatlar pressure (unpaid + overdue), customer revenue attribution, MTD.
// KDV-inclusive totals; kdv_amount_try carries the 18% portion.

const CUSTOMERS = [
  'ABC Teknoloji A.Ş.',
  'XYZ Lojistik Ltd.',
  'Demo Müşteri A',
  'Örnek Şirket B',
  'Test Müşteri C',
]

// Date `m` months ago, on day `day`, as YYYY-MM-DD, relative to `now`.
function dayInMonth(now: Date, m: number, day: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - m, day)
  return d.toISOString().slice(0, 10)
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface SaleSpec {
  cust: number          // index into CUSTOMERS
  total: number         // KDV-inclusive TRY
  monthsAgo: number
  day: number
  status: 'paid' | 'pending' | 'partial' | 'overdue'
  paidPortion?: number  // for 'partial' — fraction already collected
  termDays?: number     // due_date = sale_date + termDays (default 30)
}

const SPEC: SaleSpec[] = [
  // ── Paid history → builds the 6-month revenue trend ──────────────────────
  { cust: 0, total: 48_500,  monthsAgo: 5, day: 8,  status: 'paid' },
  { cust: 1, total: 27_300,  monthsAgo: 5, day: 22, status: 'paid' },
  { cust: 3, total: 61_200,  monthsAgo: 4, day: 6,  status: 'paid' },
  { cust: 2, total: 18_900,  monthsAgo: 4, day: 19, status: 'paid' },
  { cust: 0, total: 92_400,  monthsAgo: 3, day: 11, status: 'paid' },
  { cust: 4, total: 14_750,  monthsAgo: 3, day: 27, status: 'paid' },
  { cust: 1, total: 53_800,  monthsAgo: 2, day: 9,  status: 'paid' },
  { cust: 3, total: 39_600,  monthsAgo: 2, day: 24, status: 'paid' },
  { cust: 0, total: 75_100,  monthsAgo: 1, day: 14, status: 'paid' },

  // ── Open receivables → Tahsilatlar pressure (near-due) ───────────────────
  { cust: 2, total: 31_500,  monthsAgo: 0, day: 5,  status: 'pending', termDays: 30 },
  { cust: 4, total: 22_100,  monthsAgo: 0, day: 3,  status: 'pending', termDays: 45 },
  { cust: 1, total: 44_900,  monthsAgo: 1, day: 26, status: 'partial', paidPortion: 0.4, termDays: 30 },

  // ── Overdue → 60g+ gecikmiş / kritik tahsilat ────────────────────────────
  { cust: 3, total: 58_700,  monthsAgo: 3, day: 4,  status: 'overdue', termDays: 30 },
  { cust: 0, total: 36_200,  monthsAgo: 2, day: 12, status: 'overdue', termDays: 30 },
  { cust: 2, total: 12_400,  monthsAgo: 4, day: 15, status: 'overdue', termDays: 15 },

  // ── Current-month win → MTD ──────────────────────────────────────────────
  { cust: 0, total: 67_800,  monthsAgo: 0, day: 2,  status: 'paid' },
]

export interface SeededSaleRow {
  company_id:     string
  user_id:        string
  customer_name:  string
  currency:       string
  total:          number
  kdv_amount_try: number
  fx_rate_try:    number | null
  sale_date:      string
  due_date:       string | null
  proforma_id:    string | null
  payment_status: string
  paid_amount:    number
  paid_at:        string | null
  notes:          string | null
}

/** Pure row builder — deterministic given `now`. Tested without a DB. */
export function buildSalesRows(companyId: string, uid: string, now: Date = new Date()): SeededSaleRow[] {
  return SPEC.map(s => {
    const saleDate = dayInMonth(now, s.monthsAgo, s.day)
    const net      = Math.round((s.total / 1.18) * 100) / 100
    const kdv      = Math.round((s.total - net) * 100) / 100
    const paid     = s.status === 'paid'    ? s.total
                   : s.status === 'partial' ? Math.round(s.total * (s.paidPortion ?? 0.4))
                   : 0
    return {
      company_id:     companyId,
      user_id:        uid,
      customer_name:  CUSTOMERS[s.cust],
      currency:       'TRY',
      total:          s.total,
      kdv_amount_try: kdv,
      fx_rate_try:    null,
      sale_date:      saleDate,
      due_date:       s.status === 'paid' ? null : addDays(saleDate, s.termDays ?? 30),
      proforma_id:    null,
      payment_status: s.status,
      paid_amount:    paid,
      paid_at:        s.status === 'paid' ? saleDate : null,
      notes:          null,
    }
  })
}

export async function seedSales({ supabase, uid, companyId }: Ctx) {
  const { error } = await supabase.from('sales').insert(buildSalesRows(companyId, uid))
  if (error) console.error('[seed] sales:', error.message)
}
