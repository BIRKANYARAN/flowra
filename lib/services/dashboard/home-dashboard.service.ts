// ─────────────────────────────────────────────────────────────────────────────
// lib/services/dashboard/home-dashboard.service.ts
//
// Chart-shaped aggregations for the role home dashboards (CEO / CFO / Sales):
//   • 12-month revenue / expense / net trend
//   • expense breakdown by category (donut)
//   • top customers by revenue (last 12 months)
//   • open proforma pipeline (count, total, recent)
//
// Read-only, company-scoped. KPIs/alerts/partners come from
// ExecutiveSummaryComputeService; this service only adds the time-series + lists
// the charts need. All money figures use the existing *_try columns.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

export interface MonthlyPoint {
  label:   string  // "Oca", "Şub" …
  ym:      string  // "2026-01"
  revenue: number
  expense: number
  net:     number
}
export interface NamedValue { name: string; value: number }
export interface PipelineItem {
  id:            string
  customer_name: string
  total:         number
  status:        string
  valid_until:   string | null
}

export interface HomeCharts {
  monthly:          MonthlyPoint[]
  expenseBreakdown: NamedValue[]
  topCustomers:     NamedValue[]
  pipeline:         { open_count: number; open_total: number; items: PipelineItem[] }
}

function startOfMonthsAgo(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

export class HomeDashboardService {
  static async getCharts(companyId: string, supabase: AnyClient): Promise<HomeCharts> {
    const from = startOfMonthsAgo(11) // 12 buckets incl. current month

    const [salesRes, expRes, pipeRes] = await Promise.all([
      supabase
        .from('sales')
        .select('sale_date, revenue_try, total_try, customer_name')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from),
      supabase
        .from('expenses')
        .select('expense_date, amount_try, category')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', from),
      supabase
        .from('proformas')
        .select('id, customer_name, total, fx_try, status, valid_until')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['sent', 'draft'])
        .order('valid_until', { ascending: true }),
    ])

    const sales = (salesRes.data ?? []) as { sale_date: string; revenue_try: number | null; total_try: number | null; customer_name: string | null }[]
    const exps  = (expRes.data ?? []) as { expense_date: string; amount_try: number | null; category: string | null }[]
    const pros  = (pipeRes.data ?? []) as { id: string; customer_name: string | null; total: number | null; fx_try: number | null; status: string; valid_until: string | null }[]

    // ── 12-month buckets ───────────────────────────────────────────────────────
    const buckets = new Map<string, MonthlyPoint>()
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.set(ym, { label: TR_MONTHS[d.getMonth()], ym, revenue: 0, expense: 0, net: 0 })
    }
    for (const s of sales) {
      const ym = (s.sale_date ?? '').slice(0, 7)
      const b = buckets.get(ym)
      if (b) b.revenue += Number(s.revenue_try ?? s.total_try ?? 0)
    }
    for (const e of exps) {
      const ym = (e.expense_date ?? '').slice(0, 7)
      const b = buckets.get(ym)
      if (b) b.expense += Number(e.amount_try ?? 0)
    }
    const monthly = Array.from(buckets.values()).map(b => ({
      ...b,
      revenue: round2(b.revenue),
      expense: round2(b.expense),
      net:     round2(b.revenue - b.expense),
    }))

    // ── Expense breakdown (top 6 + Diğer) ───────────────────────────────────────
    const byCat = new Map<string, number>()
    for (const e of exps) {
      const k = (e.category ?? 'Diğer').trim() || 'Diğer'
      byCat.set(k, (byCat.get(k) ?? 0) + Number(e.amount_try ?? 0))
    }
    const expenseBreakdown = topNWithOther(byCat, 6)

    // ── Top customers by revenue ────────────────────────────────────────────────
    const byCust = new Map<string, number>()
    for (const s of sales) {
      const k = (s.customer_name ?? '—').trim() || '—'
      byCust.set(k, (byCust.get(k) ?? 0) + Number(s.revenue_try ?? s.total_try ?? 0))
    }
    const topCustomers = Array.from(byCust.entries())
      .map(([name, value]) => ({ name, value: round2(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)

    // ── Open proforma pipeline ──────────────────────────────────────────────────
    const proTry = (p: { fx_try: number | null; total: number | null }) => Number(p.fx_try ?? p.total ?? 0)
    const open_total = round2(pros.reduce((s, p) => s + proTry(p), 0))
    const pipeline = {
      open_count: pros.length,
      open_total,
      items: pros.slice(0, 6).map(p => ({
        id:            p.id,
        customer_name: p.customer_name ?? '—',
        total:         round2(proTry(p)),
        status:        p.status,
        valid_until:   p.valid_until,
      })),
    }

    return { monthly, expenseBreakdown, topCustomers, pipeline }
  }
}

function topNWithOther(m: Map<string, number>, n: number): NamedValue[] {
  const sorted = Array.from(m.entries())
    .map(([name, value]) => ({ name, value: round2(value) }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value)
  if (sorted.length <= n) return sorted
  const head = sorted.slice(0, n)
  const rest = sorted.slice(n).reduce((s, x) => s + x.value, 0)
  if (rest > 0) head.push({ name: 'Diğer', value: round2(rest) })
  return head
}
