// ── GET /api/expenses/anomalies ───────────────────────────────────────────────
// Compares current month per-category total vs trailing 6-month average.
// Returns categories where current_month > trailing_avg × 2.0 (threshold).
// Response: Array<{ category: string; current_try: number; avg_try: number; ratio: number }>

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

const ANOMALY_RATIO_THRESHOLD = 2.0

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  try {
    // Fetch last 7 months so we have 6 trailing + current
    const sevenMonthsAgo = new Date()
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7)
    const fromDate = sevenMonthsAgo.toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('expenses')
      .select('category, amount_try, expense_date, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', fromDate)
      .order('expense_date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data ?? []
    const currentYM = new Date().toISOString().slice(0, 7)

    // Aggregate per category per month
    const catMonthMap: Record<string, Record<string, number>> = {}
    for (const row of rows) {
      const ym  = (row.expense_date ?? row.created_at ?? '').slice(0, 7)
      const cat = (row.category as string) ?? 'other'
      if (!ym) continue
      if (!catMonthMap[cat]) catMonthMap[cat] = {}
      catMonthMap[cat][ym] = (catMonthMap[cat][ym] ?? 0) + Number(row.amount_try ?? 0)
    }

    const anomalies: { category: string; current_try: number; avg_try: number; ratio: number }[] = []

    for (const [category, byMonth] of Object.entries(catMonthMap)) {
      const currentTry = byMonth[currentYM] ?? 0
      if (currentTry <= 0) continue

      // Trailing 6 months (exclude current)
      const trailingValues = Object.entries(byMonth)
        .filter(([ym]) => ym < currentYM)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 6)
        .map(([, v]) => v)

      if (trailingValues.length < 2) continue

      const avgTry = trailingValues.reduce((s, v) => s + v, 0) / trailingValues.length
      if (avgTry <= 0) continue

      const ratio = currentTry / avgTry
      if (ratio >= ANOMALY_RATIO_THRESHOLD) {
        anomalies.push({
          category,
          current_try: Math.round(currentTry),
          avg_try:     Math.round(avgTry),
          ratio:       Math.round(ratio * 10) / 10,
        })
      }
    }

    // Sort by ratio DESC (most extreme first)
    anomalies.sort((a, b) => b.ratio - a.ratio)

    return NextResponse.json(anomalies)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
