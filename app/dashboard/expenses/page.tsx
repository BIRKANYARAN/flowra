// ── /dashboard/expenses — Gider Analizi (server component) ───────────────────
//
// FAZ 9: Converted from 'use client' to server component.
//
// Server-rendered sections (static, no JS):
//   Zone 1 — KPI strip: total spend, one-off count, monthly recurring burden, KDV
//   Zone 2 — Kategori Analizi: top-spending categories (CSS bar chart)
//   Zone 3 — Aylık Trend: last 6 months of expenses
//
// Client island:
//   ExpensesClient — add-expense form + list with delete buttons
//
// Self-HTTP eliminated: reads go directly through Supabase server client.

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { Suspense }         from 'react'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { PageHeader }       from '@/components/ui'
import type { Expense }     from '@/types'
import ExpensesClient, { type RecurringRow } from './ExpensesClient'
import { ExpensesCommandBar } from './_components/ExpensesCommandBar'

// ── Loading skeleton for command bar ──────────────────────────────────────────

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded-xl" />
      ))}
    </div>
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmt(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${TRY_FMT.format(abs)}`
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[m - 1] ?? ym} ${String(y).slice(2)}`
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Genel', rent: 'Kira', salary: 'Maaş', utilities: 'Faturalar',
  marketing: 'Pazarlama', logistics: 'Lojistik', software: 'Yazılım',
  equipment: 'Ekipman', tax: 'Vergi', interest: 'Faiz', board_fee: 'Yönetim Ücreti',
  principal: 'Anapara', dividend: 'Kâr Payı', partner_loan: 'Ortak Finansmanı', other: 'Diğer',
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

type ExpenseRow = Expense & { kdv?: number }

function categoryBreakdown(expenses: ExpenseRow[]): { category: string; label: string; total: number }[] {
  const map = new Map<string, number>()
  for (const e of expenses) {
    const key = e.category ?? 'other'
    map.set(key, (map.get(key) ?? 0) + Number(e.amount_try))
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, total]) => ({ category, label: CATEGORY_LABELS[category] ?? category, total }))
}

function monthlyTrend(expenses: ExpenseRow[]): { ym: string; total: number }[] {
  const map = new Map<string, number>()
  for (const e of expenses) {
    const ym = (e.expense_date ?? e.created_at ?? '').slice(0, 7)
    if (!ym) continue
    map.set(ym, (map.get(ym) ?? 0) + Number(e.amount_try))
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6) // last 6 months
    .map(([ym, total]) => ({ ym, total }))
}

// Monthly TRY equivalent of recurring expenses
function recurringMonthlyBurden(recurring: RecurringRow[]): number {
  return recurring
    .filter(r => r.is_active !== false)
    .reduce((sum, r) => {
      const amt = Number(r.amount)
      if (r.frequency === 'monthly')   return sum + amt
      if (r.frequency === 'quarterly') return sum + amt / 3
      if (r.frequency === 'yearly')    return sum + amt / 12
      return sum + amt // default: treat as monthly
    }, 0)
}

// Estimated KDV deductible from one-off expenses
function kdvDeductibleTotal(expenses: ExpenseRow[]): number {
  return expenses.reduce((sum, e) => {
    const rate = Number(e.kdv ?? 0)
    if (rate <= 0) return sum
    // VAT = amount_try × rate / 100 (approximate — amount_try is the base)
    return sum + Number(e.amount_try) * rate / 100
  }, 0)
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ExpensesPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch { redirect('/auth') }

  // ── 6-month window for analytics ─────────────────────────────────────────
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10)

  // ── Parallel data fetch ─────────────────────────────────────────────────
  const [expensesRes, recurringRes, partnersRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', fromDate)
      .order('expense_date', { ascending: false })
      .order('created_at',   { ascending: false })
      .limit(200),

    supabase
      .from('recurring_expenses')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),

    supabase
      .from('partners')
      .select('id, name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name'),
  ])

  const expenses  = (expensesRes.data  ?? []) as ExpenseRow[]
  const recurring = (recurringRes.data ?? []) as RecurringRow[]
  const partners  = (partnersRes.data  ?? []) as { id: string; name: string }[]

  // ── Server-side analytics ─────────────────────────────────────────────────
  const totalTRY       = expenses.reduce((s, e) => s + Number(e.amount_try), 0)
  const categories     = categoryBreakdown(expenses)
  const trend          = monthlyTrend(expenses)
  const monthlyBurden  = recurringMonthlyBurden(recurring)
  const kdvDeductible  = kdvDeductibleTotal(expenses)
  const maxCatTotal    = categories[0]?.total ?? 1
  const maxTrendTotal  = Math.max(...trend.map(t => t.total), 1)

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── Intelligence strip ─────────────────────────────────────────────── */}
      <Suspense fallback={<CommandBarSkeleton />}>
        <ExpensesCommandBar companyId={companyId} />
      </Suspense>

      <PageHeader
        title="Gider Analizi"
        sub={`Son 6 ay · ${expenses.length} kayıt`}
      />

      {/* ── Zone 1: KPI strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
        {[
          {
            label: 'Toplam Gider',
            value: fmt(totalTRY),
            sub:   'Son 6 ay (TRY)',
            color: 'text-red-600',
          },
          {
            label: 'Tek Seferlik',
            value: String(expenses.length),
            sub:   'kayıt',
            color: 'text-gray-900',
          },
          {
            label: 'Aylık Sabit Yük',
            value: monthlyBurden > 0 ? fmt(monthlyBurden) : '—',
            sub:   `${recurring.length} tekrarlayan şablon`,
            color: monthlyBurden > 0 ? 'text-orange-700' : 'text-gray-400',
          },
          {
            label: 'KDV İndirimi',
            value: kdvDeductible > 0 ? fmt(kdvDeductible) : '—',
            sub:   'Tahmini indirilecek KDV',
            color: kdvDeductible > 0 ? 'text-emerald-700' : 'text-gray-400',
          },
        ].map((card, i) => (
          <div key={card.label}
            className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Zone 2: Category breakdown ───────────────────────────────────────── */}
      {categories.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
            Kategori Analizi — Son 6 Ay
          </h2>
          <div className="space-y-2.5">
            {categories.map(cat => {
              const barPct = (cat.total / maxCatTotal) * 100
              const sharePct = totalTRY > 0 ? (cat.total / totalTRY) * 100 : 0
              return (
                <div key={cat.category} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-gray-600 font-medium shrink-0 truncate">
                    {cat.label}
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-5 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className="h-5 bg-red-400 rounded-lg transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-24 text-right shrink-0">
                    <span className="text-xs font-bold tabular-nums text-red-600">{fmt(cat.total)}</span>
                    <span className="text-[10px] text-gray-400 ml-1">%{sharePct.toFixed(0)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Zone 3: Monthly trend ─────────────────────────────────────────────── */}
      {trend.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
            Aylık Gider Trendi
          </h2>
          <div className="flex items-end gap-2 h-20">
            {trend.map(t => {
              const heightPct = Math.max(4, (t.total / maxTrendTotal) * 100)
              return (
                <div key={t.ym} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className="w-full bg-red-300 group-hover:bg-red-400 rounded-t transition-all"
                    style={{ height: `${heightPct}%` }}
                  />
                  <div className="text-[9px] text-gray-400 font-semibold">{fmtMonth(t.ym)}</div>
                  {/* Hover tooltip */}
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-gray-900 text-white rounded-lg px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                    <div className="font-bold">{fmtMonth(t.ym)}</div>
                    <div className="text-red-300">{fmt(t.total)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
            <span>En düşük: {fmt(Math.min(...trend.map(t => t.total)))}</span>
            <span>En yüksek: {fmt(Math.max(...trend.map(t => t.total)))}</span>
          </div>
        </div>
      )}

      {/* ── Client island: list + form ────────────────────────────────────────── */}
      <ExpensesClient
        initialExpenses={expenses}
        initialRecurring={recurring}
        initialPartners={partners}
      />

    </div>
  )
}
