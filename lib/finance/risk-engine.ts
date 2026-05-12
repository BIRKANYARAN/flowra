// lib/finance/risk-engine.ts
// ──────────────────────────────────────────────────────────────────────────────
// Risk Engine — AR aging by customer + concentration analysis.
//
// Data source: sales table (outstanding = not fully collected)
// Output: customer-level aging buckets + concentration signals.

import { createClient } from '@/lib/supabase-server'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CustomerAging {
  customer_id:   string
  customer_name: string
  total_outstanding: number
  current:      number   // not yet 30d
  overdue_30d:  number   // 30-60d past due
  overdue_60d:  number   // 60-90d past due
  overdue_90d:  number   // 90d+ past due
  oldest_invoice_date: string | null
}

export interface ConcentrationSignal {
  top1_pct:    number   // % of total outstanding held by largest debtor
  top3_pct:    number   // % held by top 3 debtors
  hhi:         number   // Herfindahl–Hirschman index (0-10000)
  risk_level:  'low' | 'moderate' | 'high' | 'critical'
}

export interface RiskEngineResult {
  asOf:             string   // ISO date
  totalOutstanding: number
  customerCount:    number
  aging:            CustomerAging[]
  concentration:    ConcentrationSignal
  overdueTotal:     number
  overdue30Total:   number
  overdue60Total:   number
  overdue90Total:   number
}

// ── Computation ───────────────────────────────────────────────────────────────

function _daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function _concentration(amounts: number[], total: number): ConcentrationSignal {
  if (total <= 0 || amounts.length === 0) {
    return { top1_pct: 0, top3_pct: 0, hhi: 0, risk_level: 'low' }
  }
  const sorted = [...amounts].sort((a, b) => b - a)
  const top1   = sorted[0] ?? 0
  const top3   = (sorted[0] ?? 0) + (sorted[1] ?? 0) + (sorted[2] ?? 0)
  const top1_pct = top1 / total
  const top3_pct = Math.min(1, top3 / total)
  // HHI: sum of squared market shares (×10000)
  const hhi = amounts.reduce((s, a) => s + (a / total) ** 2, 0) * 10_000

  const risk_level: ConcentrationSignal['risk_level'] =
    top1_pct > 0.6 ? 'critical' :
    top1_pct > 0.4 ? 'high' :
    top1_pct > 0.2 ? 'moderate' : 'low'

  return { top1_pct, top3_pct, hhi, risk_level }
}

export async function getRiskEngineResult(
  companyId: string,
): Promise<RiskEngineResult> {
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  // Outstanding sales: invoiced but not (fully) collected
  // amount_outstanding_try = amount_try - collected_try
  const { data: rows } = await supabase
    .from('sales')
    .select(`
      id,
      created_at,
      amount_outstanding_try,
      customer:customers ( id, name )
    `)
    .eq('company_id', companyId)
    .gt('amount_outstanding_try', 0)
    .order('created_at', { ascending: true })

  const byCustomer = new Map<string, CustomerAging>()

  for (const row of (rows ?? [])) {
    const outstanding = Number(row.amount_outstanding_try ?? 0)
    if (outstanding <= 0) continue

    const saleDate = String(row.created_at ?? '').slice(0, 10)
    const age      = _daysBetween(saleDate, today)
    // Supabase may return array or single object for joins
    const custRaw  = row.customer as { id: string; name: string } | { id: string; name: string }[] | null
    const cust     = Array.isArray(custRaw) ? custRaw[0] ?? null : custRaw
    const custId   = cust?.id ?? 'unknown'
    const custName = cust?.name ?? 'Bilinmeyen Müşteri'

    let entry = byCustomer.get(custId)
    if (!entry) {
      entry = {
        customer_id:         custId,
        customer_name:       custName,
        total_outstanding:   0,
        current:             0,
        overdue_30d:         0,
        overdue_60d:         0,
        overdue_90d:         0,
        oldest_invoice_date: saleDate,
      }
      byCustomer.set(custId, entry)
    }

    entry.total_outstanding += outstanding
    if (age < 30)        entry.current    += outstanding
    else if (age < 60)   entry.overdue_30d += outstanding
    else if (age < 90)   entry.overdue_60d += outstanding
    else                 entry.overdue_90d += outstanding

    if (!entry.oldest_invoice_date || saleDate < entry.oldest_invoice_date) {
      entry.oldest_invoice_date = saleDate
    }
  }

  const aging = Array.from(byCustomer.values())
    .sort((a, b) => b.total_outstanding - a.total_outstanding)

  const totalOutstanding = aging.reduce((s, c) => s + c.total_outstanding, 0)
  const overdue30Total   = aging.reduce((s, c) => s + c.overdue_30d, 0)
  const overdue60Total   = aging.reduce((s, c) => s + c.overdue_60d, 0)
  const overdue90Total   = aging.reduce((s, c) => s + c.overdue_90d, 0)
  const overdueTotal     = overdue30Total + overdue60Total + overdue90Total

  const concentration = _concentration(
    aging.map(c => c.total_outstanding),
    totalOutstanding,
  )

  return {
    asOf:             today,
    totalOutstanding,
    customerCount:    aging.length,
    aging,
    concentration,
    overdueTotal,
    overdue30Total,
    overdue60Total,
    overdue90Total,
  }
}
