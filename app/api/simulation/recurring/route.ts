// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/simulation/recurring
//
// Expands all active recurring expenses into monthly projections.
// Returns per-month totals for the next 12 months starting from today.
//
// Query params:
//   months   number   how many months to project (default 12, max 24)
//
// Response: Array<RecurringProjectionMonth>
//   Each element: { month: 'YYYY-MM', amount_try, items: [...] }
//
// Logic:
//   monthly   → one occurrence per projected month within [start_date, end_date]
//   quarterly → occurrence in months where (monthDiff from start_date) % 3 === 0
//   yearly    → occurrence in months where (monthDiff from start_date) % 12 === 0
//
// Amounts are NOT recalculated with current FX — the frozen fx_rate snapshot
// stored at creation time is used. This matches the simulation / budgeting intent:
// "what will I spend based on when I set this up?"
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }    from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import type { RecurringProjectionMonth } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a date string or Date to a YYYY-MM string. */
function toYM(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00Z') : d
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Add `n` months to a YYYY-MM string, return YYYY-MM. */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total  = (y * 12 + (m - 1)) + n
  const ny     = Math.floor(total / 12)
  const nm     = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** Month difference from ymA to ymB (positive if B is later). */
function monthDiff(ymA: string, ymB: string): number {
  const [ya, ma] = ymA.split('-').map(Number)
  const [yb, mb] = ymB.split('-').map(Number)
  return (yb * 12 + mb) - (ya * 12 + ma)
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 },
    )
  }

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED' }, { status: 409 }) }

  try {

  const url      = new URL(req.url)
  const months   = Math.min(Math.max(Number(url.searchParams.get('months') ?? 12), 1), 24)

  // Fetch all active recurring expenses for the company
  const { data: recurrings, error: fetchError } = await supabase
    .from('recurring_expenses')
    .select('id, description, category, amount, currency, fx_rate, frequency, start_date, end_date, is_deductible, kdv')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .is('deleted_at', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Build projection grid: current month through (current + months - 1)
  const nowYM   = toYM(new Date())
  const grid    = new Map<string, RecurringProjectionMonth>()

  for (let i = 0; i < months; i++) {
    const ym = addMonths(nowYM, i)
    grid.set(ym, { month: ym, amount_try: 0, items: [] })
  }

  // Expand each recurring expense into the grid
  for (const rec of recurrings ?? []) {
    const startYM  = toYM(rec.start_date as string)
    const endYM    = rec.end_date ? toYM(rec.end_date as string) : null
    const amtTry   = Number(rec.amount) * Number(rec.fx_rate)
    const freq     = rec.frequency as 'monthly' | 'quarterly' | 'yearly'
    const step     = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12

    for (const [ym, bucket] of grid) {
      // Must be on or after start_date
      if (monthDiff(startYM, ym) < 0) continue
      // Must be on or before end_date (if set)
      if (endYM && monthDiff(ym, endYM) < 0) continue
      // Must fall on a valid occurrence step from start_date
      const diff = monthDiff(startYM, ym)
      if (diff % step !== 0) continue

      bucket.amount_try += amtTry
      bucket.items.push({
        id:          rec.id as string,
        description: rec.description as string,
        category:    rec.category as string,
        amount_try:  amtTry,
        frequency:   rec.frequency as string,
      })
    }
  }

  const result = Array.from(grid.values())
  return NextResponse.json(result)

  } catch (err) {
    console.error('[simulation/recurring GET] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Tekrarlı gider projeksiyonu hesaplanamadı', code: 'INTERNAL_ERROR', type: 'SYSTEM' }, { status: 500 })
  }
}
