// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/invoice-aging.service.ts
//
// Invoice Aging Tracker with Collection Urgency Scoring
//
// Computes per-invoice aging days, bucket assignment, urgency scores, and
// an overall portfolio risk score. Builds a prioritised collection queue
// with estimated collection timelines based on customer payment reliability.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { PaymentBehaviorService } from './payment-behavior.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export type AgingBucket = 'current' | 'overdue_30' | 'overdue_60' | 'overdue_90' | 'overdue_90plus'

export interface InvoiceAgingEntry {
  sale_id: string
  customer_name: string | null
  customer_id: string | null
  invoice_date: string
  due_date: string | null
  amount_try: number
  amount_paid_try: number
  remaining_try: number              // amount_try - amount_paid_try
  aging_days: number
  bucket: AgingBucket
  urgency_score: number
  estimated_collection_days: number
  customer_reliability_score: number | null
}

export interface AgingBucketSummary {
  bucket: string
  count: number
  total_try: number
  pct_of_total: number
}

export interface InvoiceAgingReport {
  as_of_date: string
  total_outstanding_try: number
  total_current_try: number
  total_overdue_try: number
  portfolio_risk_score: number
  collection_priority: InvoiceAgingEntry[]   // top 10 by urgency_score DESC
  bucket_summary: AgingBucketSummary[]
  overdue_90plus_count: number               // high-risk count
  all_invoices: InvoiceAgingEntry[]          // sorted by urgency desc
}

// ── Pure helpers (exported for tests) ─────────────────────────────────────────

/**
 * Compute aging days relative to asOf.
 * If due_date is provided: days since due_date (negative = not yet due).
 * If no due_date: days since created_at.
 */
export function computeAgingDays(
  createdAt: string,
  dueDate: string | null,
  asOf: string,
): number {
  const asOfMs = new Date(asOf.slice(0, 10)).getTime()
  const refStr = dueDate ?? createdAt
  const refMs  = new Date(refStr.slice(0, 10)).getTime()
  return Math.round((asOfMs - refMs) / 86_400_000)
}

/**
 * Assign an aging bucket from aging days.
 * ≤0: 'current', 1-30: 'overdue_30', 31-60: 'overdue_60',
 * 61-90: 'overdue_90', >90: 'overdue_90plus'
 */
export function assignAgingBucket(agingDays: number): AgingBucket {
  if (agingDays <= 0)  return 'current'
  if (agingDays <= 30) return 'overdue_30'
  if (agingDays <= 60) return 'overdue_60'
  if (agingDays <= 90) return 'overdue_90'
  return 'overdue_90plus'
}

/**
 * Compute urgency score 0-100 for a single invoice.
 * Base: agingDays × 0.5 (capped at 50)
 * + amount factor: min(amount_try / 100000 × 10, 30)
 * + reliability penalty: if reliabilityScore < 60 → +20
 * Capped at 100.
 */
export function computeInvoiceUrgency(
  agingDays: number,
  amountTry: number,
  customerReliabilityScore: number,
): number {
  const agingComponent  = Math.min(Math.max(agingDays, 0) * 0.5, 50)
  const amountComponent = Math.min((amountTry / 100_000) * 10, 30)
  const reliabilityPenalty = customerReliabilityScore < 60 ? 20 : 0
  return Math.min(Math.round(agingComponent + amountComponent + reliabilityPenalty), 100)
}

/**
 * Compute weighted portfolio risk score 0-100.
 * Σ(urgency × amount) / Σ(amount)
 */
export function computePortfolioRisk(
  invoices: Array<{ urgency: number; amount_try: number }>,
): number {
  if (invoices.length === 0) return 0
  const totalAmount = invoices.reduce((s, i) => s + i.amount_try, 0)
  if (totalAmount === 0) return 0
  const weighted = invoices.reduce((s, i) => s + i.urgency * i.amount_try, 0)
  return Math.min(Math.round((weighted / totalAmount) * 10) / 10, 100)
}

/**
 * Estimate collection days based on customer reliability score.
 * excellent (≥80): avg 15 days
 * good (65-79): avg 25 days
 * average (50-64): avg 45 days
 * poor (<50): avg 75 days
 */
export function estimateCollectionDays(reliabilityScore: number): number {
  if (reliabilityScore >= 80) return 15
  if (reliabilityScore >= 65) return 25
  if (reliabilityScore >= 50) return 45
  return 75
}

// ── Service class ──────────────────────────────────────────────────────────────

export class InvoiceAgingService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string, asOfDate?: string): Promise<InvoiceAgingReport> {
    const asOf = asOfDate ?? new Date().toISOString().slice(0, 10)

    // ── Fetch open sales ───────────────────────────────────────────────────────
    const { data: rawSales } = await this.supabase
      .from('sales')
      .select('id, customer_id, customer_name, total, paid_amount, sale_date, created_at, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['unpaid', 'partial', 'overdue'])
      .order('created_at', { ascending: false })
      .limit(1000)

    const sales = (rawSales ?? []) as Array<{
      id: string
      customer_id: string | null
      customer_name: string | null
      total: number
      paid_amount: number | null
      sale_date: string | null
      created_at: string
      due_date: string | null
      payment_status: string
    }>

    // ── Fetch payment behavior for reliability scores ──────────────────────────
    let reliabilityMap = new Map<string, number>()
    try {
      const behaviorReport = await PaymentBehaviorService.getReport(
        companyId,
        this.supabase,
        { today: asOf },
      )
      for (const profile of behaviorReport.profiles) {
        const key = (profile.customer_name ?? '').trim().toLowerCase()
        reliabilityMap.set(key, profile.reliability_score)
        if (profile.customer_id) {
          reliabilityMap.set(profile.customer_id, profile.reliability_score)
        }
      }
    } catch {
      // Non-fatal — proceed without reliability data
      reliabilityMap = new Map()
    }

    // ── Build invoice entries ─────────────────────────────────────────────────
    const allInvoices: InvoiceAgingEntry[] = []

    for (const s of sales) {
      const amountTry    = s.total ?? 0
      const amountPaid   = s.paid_amount ?? 0
      const remainingTry = Math.max(0, amountTry - amountPaid)

      if (remainingTry <= 0) continue

      const invoiceDate = s.sale_date ?? s.created_at
      const agingDays   = computeAgingDays(invoiceDate, s.due_date, asOf)
      const bucket      = assignAgingBucket(agingDays)

      // Resolve reliability score: try customer_id first, then name key
      let reliabilityScore: number | null = null
      if (s.customer_id && reliabilityMap.has(s.customer_id)) {
        reliabilityScore = reliabilityMap.get(s.customer_id)!
      } else if (s.customer_name) {
        const nameKey = s.customer_name.trim().toLowerCase()
        if (reliabilityMap.has(nameKey)) {
          reliabilityScore = reliabilityMap.get(nameKey)!
        }
      }

      // Default reliability for unknown customers: 100 (not penalized)
      const effectiveReliability = reliabilityScore ?? 100

      const urgencyScore             = computeInvoiceUrgency(agingDays, remainingTry, effectiveReliability)
      const estimatedCollectionDays  = estimateCollectionDays(effectiveReliability)

      allInvoices.push({
        sale_id:                    s.id,
        customer_name:              s.customer_name,
        customer_id:                s.customer_id,
        invoice_date:               invoiceDate,
        due_date:                   s.due_date,
        amount_try:                 amountTry,
        amount_paid_try:            amountPaid,
        remaining_try:              Math.round(remainingTry * 100) / 100,
        aging_days:                 agingDays,
        bucket,
        urgency_score:              urgencyScore,
        estimated_collection_days:  estimatedCollectionDays,
        customer_reliability_score: reliabilityScore,
      })
    }

    // Sort by urgency DESC
    allInvoices.sort((a, b) => b.urgency_score - a.urgency_score)

    // ── Totals ────────────────────────────────────────────────────────────────
    const totalOutstandingTry = allInvoices.reduce((s, i) => s + i.remaining_try, 0)
    const totalCurrentTry     = allInvoices
      .filter(i => i.bucket === 'current')
      .reduce((s, i) => s + i.remaining_try, 0)
    const totalOverdueTry     = totalOutstandingTry - totalCurrentTry

    // ── Portfolio risk ────────────────────────────────────────────────────────
    const portfolioRiskScore = computePortfolioRisk(
      allInvoices.map(i => ({ urgency: i.urgency_score, amount_try: i.remaining_try })),
    )

    // ── Bucket summary ────────────────────────────────────────────────────────
    const bucketOrder: AgingBucket[] = ['current', 'overdue_30', 'overdue_60', 'overdue_90', 'overdue_90plus']
    const bucketAccum = new Map<AgingBucket, { count: number; total_try: number }>(
      bucketOrder.map(b => [b, { count: 0, total_try: 0 }]),
    )
    for (const inv of allInvoices) {
      const acc = bucketAccum.get(inv.bucket)!
      acc.count     += 1
      acc.total_try += inv.remaining_try
    }
    const bucketSummary: AgingBucketSummary[] = bucketOrder.map(b => {
      const acc = bucketAccum.get(b)!
      return {
        bucket:       b,
        count:        acc.count,
        total_try:    Math.round(acc.total_try * 100) / 100,
        pct_of_total: totalOutstandingTry > 0
          ? Math.round((acc.total_try / totalOutstandingTry) * 1000) / 10
          : 0,
      }
    })

    const overdue90plusCount = allInvoices.filter(i => i.bucket === 'overdue_90plus').length

    return {
      as_of_date:             asOf,
      total_outstanding_try:  Math.round(totalOutstandingTry * 100) / 100,
      total_current_try:      Math.round(totalCurrentTry * 100) / 100,
      total_overdue_try:      Math.round(totalOverdueTry * 100) / 100,
      portfolio_risk_score:   portfolioRiskScore,
      collection_priority:    allInvoices.slice(0, 10),
      bucket_summary:         bucketSummary,
      overdue_90plus_count:   overdue90plusCount,
      all_invoices:           allInvoices,
    }
  }
}
