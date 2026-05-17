// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/alerts/generate
//
// Generates actionable alerts for the authenticated company and inserts new
// (non-duplicate) rows into the alerts table.
//
// Architecture — three distinct phases:
//   1. FETCH   — parallel DB queries, no logic
//   2. DERIVE  — pure function (lib/alerts/derive.ts), no DB calls
//   3. INSERT  — de-dup against recent 7-day window, then batch insert
//
// This separation makes thresholds testable without mocking Supabase.
//
// Alert types:
//   overdue_payment     — per sale, unpaid/partial/overdue AND > 30 days old
//   low_stock           — per product, stock_qty ≤ stock_alert_qty
//   negative_cashflow   — company-level, projected next-month net < −1000 TRY
//   aged_60_plus        — company-level, 60+ day receivables exceed 5000 TRY
//
// De-duplication: entity_type::entity_id must not appear in alerts for this user
//                 within the last 7 days.
//
// Response: { generated: number }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  deriveAlerts,
  type AlertDeriveInput,
} from '@/lib/alerts/derive'
import { resolveApiAuth } from '@/lib/api-auth'

interface AlertInsert {
  actor_user_id: string
  company_id:    string
  entity_type:   string
  entity_id:     string
  message:       string
  severity:      'info' | 'warning' | 'critical'
  is_read:       boolean
}

const BURN_EXPENSE_TYPES = ['operational', 'fixed', 'variable']

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // ── PHASE 1: Fetch all required data in parallel ──────────────────────────

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const sevenDaysAgo  = new Date(Date.now() - 7  * 86_400_000).toISOString()

  // Next calendar month (YYYY-MM) — used for cashflow projection label
  const now      = new Date()
  const nextYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const nextMon  = String((now.getMonth() + 1) % 12 + 1).padStart(2, '0')
  const nextYM   = `${nextYear}-${nextMon}`

  const [
    recentAlertsRes,
    overdueSalesRes,
    stockProductsRes,
    outstandingRes,
    recurringRes,
    receivableAgingRes,
  ] = await Promise.all([

    // A. Recent alerts (7-day de-dup window)
    supabase
      .from('alerts')
      .select('entity_type, entity_id')
      .eq('actor_user_id', uid)
      .gte('created_at', sevenDaysAgo),

    // B. Overdue sales: unpaid/partial/overdue AND > 30 days old (max 50)
    supabase
      .from('sales')
      .select('id, customer_name, total_try, payment_status, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .lt('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: true })
      .limit(50),

    // C. Active products with stock alert thresholds set
    supabase
      .from('products')
      .select('id, name, stock_qty, stock_alert_qty')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .gt('stock_alert_qty', 0),

    // D. Outstanding sales (unpaid/partial) — for cashflow projection input
    supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial'])
      .limit(200),

    // E. Active recurring expenses — for monthly commitment (projected burn)
    //    monthly×1, quarterly×1/3, yearly×1/12
    supabase
      .from('recurring_expenses')
      .select('amount, fx_rate, frequency, start_date, end_date')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('expense_type', BURN_EXPENSE_TYPES),

    // F. Receivable aging: 60+ day outstanding (for aged_60_plus alert)
    supabase
      .from('sales')
      .select('total_try, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .lt('created_at', new Date(Date.now() - 60 * 86_400_000).toISOString()),
  ])

  // ── Build de-dup set ───────────────────────────────────────────────────────
  const recentKeys = new Set(
    (recentAlertsRes.data ?? []).map(a => `${a.entity_type}::${a.entity_id}`)
  )

  // ── Compute recurring monthly commitment ───────────────────────────────────
  // Only include recurring expenses whose date range covers the next month.
  const FREQ_FACTOR: Record<string, number> = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
  let recurringMonthlyTry = 0
  for (const rec of recurringRes.data ?? []) {
    const start = (rec.start_date as string).slice(0, 7)
    const end   = rec.end_date ? (rec.end_date as string).slice(0, 7) : null
    if (nextYM < start) continue
    if (end && nextYM > end) continue
    const amtTry = Number(rec.amount ?? 0) * Number(rec.fx_rate ?? 1)
    const factor = FREQ_FACTOR[rec.frequency as string] ?? 0
    recurringMonthlyTry += amtTry * factor
  }

  // ── Compute aged 60+ totals ────────────────────────────────────────────────
  const aged60PlusRows  = receivableAgingRes.data ?? []
  const aged60PlusTry   = aged60PlusRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const aged60PlusCount = aged60PlusRows.length

  const outstandingTotal = (outstandingRes.data ?? []).reduce(
    (s, r) => s + Number(r.total_try ?? 0),
    0,
  )

  // ── PHASE 2: Derive alert specs (pure — no DB) ────────────────────────────
  const deriveInput: AlertDeriveInput = {
    overdueSales:        (overdueSalesRes.data ?? []) as AlertDeriveInput['overdueSales'],
    stockProducts:       (stockProductsRes.data ?? []) as AlertDeriveInput['stockProducts'],
    recurringMonthlyTry,
    outstandingTotal,
    nextYM,
    aged60PlusTry,
    aged60PlusCount,
  }

  const specs = deriveAlerts(deriveInput)

  // ── PHASE 3: De-dup + insert ──────────────────────────────────────────────
  const toInsert: AlertInsert[] = specs
    .filter(s => !recentKeys.has(`${s.entity_type}::${s.entity_id}`))
    .map(s => ({
      actor_user_id: uid,
      company_id:    companyId,
      entity_type:   s.entity_type,
      entity_id:     s.entity_id,
      message:       s.message,
      severity:      s.severity,
      is_read:       false,
    }))

  if (toInsert.length === 0) {
    return NextResponse.json({ generated: 0 })
  }

  const { error: insertError } = await supabase
    .from('alerts')
    .insert(toInsert)

  if (insertError) {
    console.error('[alerts/generate] insert error:', insertError.message)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ generated: toInsert.length })
}
