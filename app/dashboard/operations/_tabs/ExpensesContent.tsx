// ── ExpensesContent — Operations hub / expenses tab ───────────────────────────

import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import type { Expense } from '@/types'
import ExpensesClient, { type RecurringRow } from '@/app/dashboard/expenses/ExpensesClient'
import { ExpensesCommandBar } from '@/app/dashboard/expenses/_components/ExpensesCommandBar'
import { fmtTRY as fmt }      from '@/lib/format'
import { detectExpenseAnomalies, type MonthlyExpense } from '@/lib/engines/anomaly.engine'
import { detectDuplicates, type ExpenseRow as DupExpenseRow } from '@/lib/engines/duplicate-detector'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded" />
      ))}
    </div>
  )
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

type ExpenseRow = Expense & { kdv?: number }

interface Props { companyId: string }

export async function ExpensesContent({ companyId }: Props) {
  const supabase = createClient()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10)

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

  const totalTRY = expenses.reduce((s, e) => s + Number(e.amount_try), 0)

  const catMap = new Map<string, number>()
  for (const e of expenses) {
    const key = e.category ?? 'other'
    catMap.set(key, (catMap.get(key) ?? 0) + Number(e.amount_try))
  }
  const categories = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([category, total]) => ({ category, label: CATEGORY_LABELS[category] ?? category, total }))
  const maxCatTotal = categories[0]?.total ?? 1

  const trendMap = new Map<string, number>()
  for (const e of expenses) {
    const ym = (e.expense_date ?? e.created_at ?? '').slice(0, 7)
    if (!ym) continue
    trendMap.set(ym, (trendMap.get(ym) ?? 0) + Number(e.amount_try))
  }
  const trend = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
    .map(([ym, total]) => ({ ym, total }))
  const maxTrendTotal = Math.max(...trend.map(t => t.total), 1)

  const monthlyBurden = recurring
    .filter(r => r.is_active !== false)
    .reduce((sum, r) => {
      const amt = Number(r.amount)
      if (r.frequency === 'monthly')   return sum + amt
      if (r.frequency === 'quarterly') return sum + amt / 3
      if (r.frequency === 'yearly')    return sum + amt / 12
      return sum + amt
    }, 0)
  const kdvDeductible = expenses.reduce((sum, e) => {
    const rate = Number(e.kdv ?? 0)
    return rate <= 0 ? sum : sum + Number(e.amount_try) * rate / 100
  }, 0)

  // ── Expense anomaly detection ──────────────────────────────────────────────
  const anomalyExpMap: Record<string, Record<string, number>> = {}
  for (const e of expenses) {
    const ym  = (e.expense_date ?? e.created_at ?? '').slice(0, 7)
    const cat = (e.category as string) ?? 'other'
    if (!ym) continue
    if (!anomalyExpMap[cat]) anomalyExpMap[cat] = {}
    anomalyExpMap[cat][ym] = (anomalyExpMap[cat][ym] ?? 0) + Number(e.amount_try)
  }
  const monthlyExpenses: MonthlyExpense[] = []
  for (const [category, byMonth] of Object.entries(anomalyExpMap)) {
    for (const [month, amount] of Object.entries(byMonth)) {
      monthlyExpenses.push({ month, category, amount })
    }
  }
  const expenseAnomalies = detectExpenseAnomalies(monthlyExpenses)
    .filter(a => a.severity === 'high')
    .slice(0, 3)

  // ── Duplicate expense detection (last 90 days) ────────────────────────────
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const dupCandidates: DupExpenseRow[] = expenses
    .filter(e => (e.expense_date ?? '') >= ninetyDaysAgo)
    .map(e => ({
      id:           e.id,
      expense_date: e.expense_date ?? '',
      expense_type: (e.expense_type as string) ?? 'general',
      amount_try:   Number(e.amount_try),
      vendor_name:  (e as unknown as { vendor_name?: string | null }).vendor_name ?? null,
      description:  e.description ?? null,
    }))
  const duplicateGroups = detectDuplicates(dupCandidates).filter(d => d.confidence === 'high')

  return (
    <div className="max-w-4xl space-y-6">
      <Suspense fallback={<CommandBarSkeleton />}>
        <ExpensesCommandBar companyId={companyId} />
      </Suspense>

      <p className="text-xs text-gray-400">Son 6 ay · {expenses.length} kayıt</p>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-100 rounded overflow-hidden shadow-sm">
        {[
          { label: 'Toplam Gider',    value: fmt(totalTRY),        sub: 'Son 6 ay (TRY)',                    color: 'text-red-600' },
          { label: 'Tek Seferlik',    value: String(expenses.length), sub: 'kayıt',                          color: 'text-gray-900' },
          { label: 'Aylık Sabit Yük', value: monthlyBurden > 0 ? fmt(monthlyBurden) : '—', sub: `${recurring.length} tekrarlayan şablon`, color: monthlyBurden > 0 ? 'text-orange-700' : 'text-gray-400' },
          { label: 'KDV İndirimi',    value: kdvDeductible > 0 ? fmt(kdvDeductible) : '—', sub: 'Tahmini indirilecek KDV', color: kdvDeductible > 0 ? 'text-emerald-700' : 'text-gray-400' },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Expense anomaly alerts */}
      {expenseAnomalies.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">⚠ Anormal Gider Artışı</span>
            <span className="text-[9px] text-amber-600">(istatistiksel eşik aşıldı)</span>
          </div>
          <div className="space-y-1">
            {expenseAnomalies.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[11px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded shrink-0">
                  {CATEGORY_LABELS[a.category] ?? a.category}
                </span>
                <span className="text-[10px] text-amber-700">{a.message}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-amber-600 mt-1.5">
            Detaylı analiz için Finans → Risk sekmesini inceleyin.
          </div>
        </div>
      )}

      {/* Duplicate expense alerts */}
      {duplicateGroups.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-red-700">⚠ Olası Kopya Gider — {duplicateGroups.length} Grup</span>
            <span className="text-[9px] text-red-500">son 90 gün · yüksek güven</span>
          </div>
          <div className="space-y-1.5">
            {duplicateGroups.map((grp, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[11px] bg-red-100 text-red-800 font-semibold px-2 py-0.5 rounded shrink-0">
                  {CATEGORY_LABELS[grp.expense_type] ?? grp.expense_type}
                </span>
                <span className="text-[10px] text-red-700 flex-1">{grp.message}</span>
                <span className="text-[10px] font-bold text-red-700 shrink-0 tabular-nums">
                  {grp.rows.map(r => r.expense_date).join(' · ')}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-red-600 mt-1.5">
            Finans → CFO sekmesinde gider denetimini tamamlayın.
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {categories.length > 0 && (
        <div className="bg-white border border-gray-100 rounded p-4 shadow-sm">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Kategori Analizi — Son 6 Ay</h3>
          <div className="space-y-2.5">
            {categories.map(cat => {
              const barPct   = (cat.total / maxCatTotal) * 100
              const sharePct = totalTRY > 0 ? (cat.total / totalTRY) * 100 : 0
              return (
                <div key={cat.category} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-gray-600 font-medium shrink-0 truncate">{cat.label}</div>
                  <div className="flex-1">
                    <div className="h-5 bg-gray-100 rounded overflow-hidden">
                      <div className="h-5 bg-red-400 rounded" style={{ width: `${barPct}%` }} />
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

      {/* Monthly trend */}
      {trend.length > 1 && (
        <div className="bg-white border border-gray-100 rounded p-4 shadow-sm">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Aylık Gider Trendi</h3>
          <div className="flex items-end gap-2 h-20">
            {trend.map(t => {
              const heightPct = Math.max(4, (t.total / maxTrendTotal) * 100)
              return (
                <div key={t.ym} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full bg-red-300 group-hover:bg-red-400 rounded-t transition-all" style={{ height: `${heightPct}%` }} />
                  <div className="text-[9px] text-gray-400 font-semibold">{fmtMonth(t.ym)}</div>
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-gray-900 text-white rounded px-2 py-1 text-[10px] whitespace-nowrap">
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

      <ExpensesClient
        initialExpenses={expenses}
        initialRecurring={recurring}
        initialPartners={partners}
      />

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Gider analizi P&amp;L ve nakit akışını doğrudan etkiler.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            href="/dashboard/finance?tab=pnl"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            P&amp;L Analizi →
          </Link>
          <span className="text-gray-200">|</span>
          <Link
            href="/dashboard/finance?tab=risks"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            Risk Analizi →
          </Link>
        </div>
      </div>
    </div>
  )
}
