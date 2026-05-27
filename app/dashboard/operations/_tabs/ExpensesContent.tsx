// ── ExpensesContent — Expense Intelligence Surface ─────────────────────────────
// Sprint 4: Burn Intelligence Strip, anomaly detection, approval queue,
//           category view with anomaly badges, slide-over expense form

import { Suspense } from 'react'
import { NarrativeFooter } from '@/components/ds'
import { createClient } from '@/lib/supabase-server'
import type { Expense } from '@/types'
import ExpensesIntelligenceClient from '@/app/dashboard/expenses/ExpensesIntelligenceClient'
import type { RecurringRow } from '@/app/dashboard/expenses/ExpensesClient'
import { ExpensesCommandBar } from '@/app/dashboard/expenses/_components/ExpensesCommandBar'
import { ObservationRail } from '@/app/dashboard/_shared/ObservationRail'
import { fmtTRY as fmt, fmtMonthShort as fmtMonth } from '@/lib/format'
import { detectExpenseAnomalies, type MonthlyExpense } from '@/lib/engines/anomaly.engine'
import { detectDuplicates, type ExpenseRow as DupExpenseRow } from '@/lib/engines/duplicate-detector'
import {
  ExpenseIntelligenceService,
  type ExpenseIntelligenceReport,
} from '@/lib/services/finance/expense-intelligence.service'
import {
  ExpenseAnomalyService,
  type ExpenseAnomalyReport,
} from '@/lib/services/finance/expense-anomaly.service'
import { SupplierAnalyticsPanel } from './_supplier-analytics/SupplierAnalyticsPanel'
import { PayablesAgingSection } from './_ap-aging/PayablesAgingSection'
import { SupplierPaymentTermsClient } from './_supplier-terms/SupplierPaymentTermsClient'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-[#f1f5f9] rounded" />
      ))}
    </div>
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Genel', rent: 'Kira', salary: 'Maaş', utilities: 'Faturalar',
  marketing: 'Pazarlama', logistics: 'Lojistik', software: 'Yazılım',
  equipment: 'Ekipman', tax: 'Vergi', interest: 'Faiz', board_fee: 'Yönetim Ücreti',
  principal: 'Anapara', dividend: 'Kâr Payı', partner_loan: 'Ortak Finansmanı', other: 'Diğer',
}

type ExpenseRow = Expense & { kdv?: number; workflow_instance?: string | null; title?: string }

interface Props { companyId: string }

export async function ExpensesContent({ companyId }: Props) {
  const supabase = createClient()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10)

  // Previous month date for burn comparison
  const prevMonthStart = new Date()
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
  prevMonthStart.setDate(1)
  const prevMonthEnd = new Date()
  prevMonthEnd.setDate(0)
  const currentMonthStart = new Date()
  currentMonthStart.setDate(1)
  const currentYM  = new Date().toISOString().slice(0, 7)
  const prevYM     = prevMonthStart.toISOString().slice(0, 7)

  // Intelligence period: current month
  const intelligencePeriod = {
    from: `${currentYM}-01`,
    to:   new Date().toISOString().slice(0, 10),
  }

  const [expensesRes, recurringRes, partnersRes, expenseIntelligence, anomalyReport] = await Promise.all([
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
    ExpenseIntelligenceService.getReport(companyId, supabase, intelligencePeriod)
      .catch(() => null as ExpenseIntelligenceReport | null),
    ExpenseAnomalyService.getReport(companyId, supabase)
      .catch(() => null as ExpenseAnomalyReport | null),
  ])

  const expenses  = (expensesRes.data  ?? []) as ExpenseRow[]
  const recurring = (recurringRes.data ?? []) as RecurringRow[]
  const partners  = (partnersRes.data  ?? []) as { id: string; name: string }[]

  // ── Burn Intelligence ──────────────────────────────────────────────────────
  const currentMonthExpenses = expenses.filter(e =>
    (e.expense_date ?? '').slice(0, 7) === currentYM
  )
  const prevMonthExpenses = expenses.filter(e =>
    (e.expense_date ?? '').slice(0, 7) === prevYM
  )
  const currentBurn = currentMonthExpenses.reduce((s, e) => s + Number(e.amount_try), 0)
  const prevBurn    = prevMonthExpenses.reduce((s, e) => s + Number(e.amount_try), 0)
  const burnDelta   = currentBurn - prevBurn
  const burnDeltaPct = prevBurn > 0 ? (burnDelta / prevBurn) * 100 : 0

  // ── Current month by category ──────────────────────────────────────────────
  const currentCatMap = new Map<string, number>()
  for (const e of currentMonthExpenses) {
    const key = e.category ?? 'other'
    currentCatMap.set(key, (currentCatMap.get(key) ?? 0) + Number(e.amount_try))
  }

  // ── Anomaly detection (current month vs trailing 6) ────────────────────────
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
    .slice(0, 5)

  // ── Approval queue (pending + has workflow_instance) ───────────────────────
  const approvalQueue = expenses.filter(e =>
    e.payment_status === 'pending' && e.workflow_instance
  )
  const approvalTotal = approvalQueue.reduce((s, e) => s + Number(e.amount_try), 0)

  // ── Full 6-month category breakdown ───────────────────────────────────────
  const totalTRY = expenses.reduce((s, e) => s + Number(e.amount_try), 0)
  const catMap   = new Map<string, number>()
  for (const e of expenses) {
    const key = e.category ?? 'other'
    catMap.set(key, (catMap.get(key) ?? 0) + Number(e.amount_try))
  }
  const categories = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([category, total]) => ({ category, label: CATEGORY_LABELS[category] ?? category, total }))
  const maxCatTotal = categories[0]?.total ?? 1

  // Build anomaly ratio lookup for badge display
  const anomalyRatioMap: Record<string, { current: number; avg: number; ratio: number }> = {}
  for (const a of expenseAnomalies) {
    const currentVal = anomalyExpMap[a.category]?.[currentYM] ?? 0
    if (a.mean > 0 && currentVal > 0) {
      anomalyRatioMap[a.category] = {
        current: currentVal,
        avg:     a.mean,
        ratio:   currentVal / a.mean,
      }
    }
  }

  // ── Monthly trend ──────────────────────────────────────────────────────────
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

  // ── Duplicate detection ────────────────────────────────────────────────────
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
    <div className="max-w-4xl space-y-4">
      <ObservationRail context="expenses" maxItems={3} />

      <Suspense fallback={<CommandBarSkeleton />}>
        <ExpensesCommandBar companyId={companyId} />
      </Suspense>

      {/* ── Burn Intelligence Strip ───────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
        {/* Row 1: This month vs last */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-b border-[#f1f5f9]">
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Bu Ay</span>
            <span className="text-sm font-black tabular-nums text-neg">{fmt(currentBurn)}</span>
          </div>
          {prevBurn > 0 && (
            <>
              <span className="text-[#94a3b8] text-xs">·</span>
              <span className="text-xs text-[#64748b]">Geçen ay: {fmt(prevBurn)}</span>
              {burnDelta !== 0 && (
                <span className={`text-xs font-semibold ${burnDelta > 0 ? 'text-neg' : 'text-pos-text'}`}>
                  {burnDelta > 0 ? '↑' : '↓'}{fmt(Math.abs(burnDelta))} ({burnDeltaPct > 0 ? '+' : ''}{Math.round(burnDeltaPct)}%)
                </span>
              )}
            </>
          )}
        </div>

        {/* Row 2: Top categories this month with anomaly flags */}
        {currentBurn > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-b border-[#f1f5f9] text-xs">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kategori</span>
            {Array.from(currentCatMap.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([cat, total]) => {
                const anomaly = anomalyRatioMap[cat]
                return (
                  <span key={cat} className="flex items-center gap-1 text-[#334155]">
                    <span>{CATEGORY_LABELS[cat] ?? cat}: {fmt(total)}</span>
                    {anomaly && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-warn-light text-warn-text border border-warn/30">
                        ⚠ ANOMALİ {anomaly.ratio.toFixed(1)}×
                      </span>
                    )}
                  </span>
                )
              })}
          </div>
        )}

        {/* Row 3: Approval queue */}
        {approvalQueue.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 bg-warn-light/30 text-xs">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-warn-text">Onay</span>
            <span className="font-semibold text-warn-text">
              {approvalQueue.length} masraf onay bekliyor — {fmt(approvalTotal)}
            </span>
            <span className="text-[#94a3b8] text-[10px]">Aşağıdan onaylayabilirsiniz</span>
          </div>
        )}
      </div>

      <p className="text-xs text-[#94a3b8]">Son 6 ay · {expenses.length} kayıt</p>

      {/* ── KPI Strip ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        {[
          { label: 'Toplam Gider',    value: fmt(totalTRY),        sub: 'Son 6 ay (TRY)',                    color: 'text-neg' },
          { label: 'Tek Seferlik',    value: String(expenses.length), sub: 'kayıt',                          color: 'text-[#0f172a]' },
          { label: 'Aylık Sabit Yük', value: monthlyBurden > 0 ? fmt(monthlyBurden) : '—', sub: `${recurring.length} tekrarlayan şablon`, color: monthlyBurden > 0 ? 'text-warn-text' : 'text-[#94a3b8]' },
          { label: 'KDV İndirimi',    value: kdvDeductible > 0 ? fmt(kdvDeductible) : '—', sub: 'Tahmini indirilecek KDV', color: kdvDeductible > 0 ? 'text-pos-text' : 'text-[#94a3b8]' },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Gider Analizi (expense-intelligence) ─────────────────────────────── */}
      {expenseIntelligence && expenseIntelligence.categories.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Gider Analizi
            </span>
            {expenseIntelligence.fastest_growing && (
              <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-neg-light text-neg-text">
                En Hızlı Büyüyen: {expenseIntelligence.fastest_growing}
                {expenseIntelligence.fastest_growing_pct !== null && (
                  <span> +%{expenseIntelligence.fastest_growing_pct.toFixed(0)}</span>
                )}
              </span>
            )}
          </div>

          {/* Category breakdown table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 pr-2">Kategori</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">Tutar</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">% Pay</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 pl-2">Değişim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {expenseIntelligence.categories.slice(0, 8).map(cat => {
                  const isGrowing  = cat.trend === 'up'
                  const isDeclining = cat.trend === 'down'
                  const isNew      = cat.trend === 'new'
                  const changePctAbs = cat.change_pct !== null ? Math.abs(cat.change_pct) : null
                  const changeColor =
                    isGrowing && cat.change_pct !== null && cat.change_pct > 10
                      ? 'text-neg font-bold'
                      : isDeclining && cat.change_pct !== null && cat.change_pct < -10
                        ? 'text-pos-text font-bold'
                        : 'text-[#64748b]'
                  const trendArrow = isNew ? '★' : isGrowing ? '↑' : isDeclining ? '↓' : '—'
                  const trendColor = isNew ? 'text-info-text' : isGrowing ? 'text-neg' : isDeclining ? 'text-pos-text' : 'text-[#94a3b8]'
                  return (
                    <tr key={cat.expense_type} className="hover:bg-[#f8fafc]/60">
                      <td className="py-1.5 pr-2 font-medium text-[#334155]">{cat.label}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-[#1e293b] font-semibold">{fmt(cat.current_try)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-[#64748b]">%{cat.current_pct_of_total.toFixed(0)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">
                        {isNew ? (
                          <span className="text-info-text text-[10px] font-bold">YENİ</span>
                        ) : cat.change_pct !== null ? (
                          <span className={`${changeColor} flex items-center justify-end gap-0.5`}>
                            <span className={trendColor}>{trendArrow}</span>
                            <span>{cat.change_pct > 0 ? '+' : ''}{changePctAbs !== null ? changePctAbs.toFixed(0) : '0'}%</span>
                          </span>
                        ) : (
                          <span className="text-[#94a3b8]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Total summary */}
          <div className="flex items-center justify-between pt-1 border-t border-[#f1f5f9] text-xs text-[#64748b]">
            <span>Toplam: <strong className="text-[#1e293b]">{fmt(expenseIntelligence.total_expenses_try)}</strong></span>
            {expenseIntelligence.total_change_pct !== null && (
              <span className={expenseIntelligence.total_change_pct > 0 ? 'text-neg font-semibold' : 'text-pos-text font-semibold'}>
                {expenseIntelligence.total_change_pct > 0 ? '+' : ''}{expenseIntelligence.total_change_pct.toFixed(0)}% önceki döneme göre
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Expense anomaly alerts ─────────────────────────────────────────────── */}
      {expenseAnomalies.length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-warn-text">Anormal Gider Artışı</span>
            <span className="text-[9px] text-warn-text">(istatistiksel eşik aşıldı)</span>
          </div>
          <div className="space-y-1">
            {expenseAnomalies.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[11px] bg-warn-light text-warn-text font-semibold px-2 py-0.5 rounded shrink-0">
                  {CATEGORY_LABELS[a.category] ?? a.category}
                </span>
                <span className="text-[10px] text-warn-text">{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Duplicate expense alerts ───────────────────────────────────────────── */}
      {duplicateGroups.length > 0 && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-neg-text">Olası Kopya Gider — {duplicateGroups.length} Grup</span>
            <span className="text-[9px] text-neg">son 90 gün · yüksek güven</span>
          </div>
          <div className="space-y-1.5">
            {duplicateGroups.map((grp, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[11px] bg-neg-light text-neg-text font-semibold px-2 py-0.5 rounded shrink-0">
                  {CATEGORY_LABELS[grp.expense_type] ?? grp.expense_type}
                </span>
                <span className="text-[10px] text-neg-text flex-1">{grp.message}</span>
                <span className="text-[10px] font-bold text-neg-text shrink-0 tabular-nums">
                  {grp.rows.map(r => r.expense_date).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Category breakdown (collapsible) — with anomaly badges ───────────── */}
      {categories.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">Kategori Özeti — Son 6 Ay</h3>
          <div className="space-y-2.5">
            {categories.map(cat => {
              const barPct    = (cat.total / maxCatTotal) * 100
              const sharePct  = totalTRY > 0 ? (cat.total / totalTRY) * 100 : 0
              const anomaly   = anomalyRatioMap[cat.category]
              const currentMo = currentCatMap.get(cat.category) ?? 0

              // Trend indicator vs previous month
              const prevMoCatVal = (anomalyExpMap[cat.category]?.[prevYM] ?? 0)
              const trendDir = currentMo > prevMoCatVal ? '↑' :
                               currentMo < prevMoCatVal ? '↓' : '→'
              const trendColor = currentMo > prevMoCatVal * 1.1 ? 'text-neg' :
                                 currentMo < prevMoCatVal * 0.9 ? 'text-pos-text' : 'text-[#94a3b8]'

              return (
                <div key={cat.category} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-[#64748b] font-medium shrink-0 truncate">{cat.label}</div>
                  <div className="flex-1">
                    <div className="h-5 bg-[#f1f5f9] rounded overflow-hidden">
                      <div
                        className={`h-5 rounded ${anomaly ? 'bg-warn' : 'bg-neg'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 w-48 text-right shrink-0 justify-end flex-wrap">
                    <span className="text-xs font-bold tabular-nums text-neg">{fmt(cat.total)}</span>
                    <span className="text-[10px] text-[#94a3b8]">%{sharePct.toFixed(0)}</span>
                    <span className={`text-[10px] font-semibold ${trendColor}`}>{trendDir} {anomaly ? 'ANOMALİ' : trendDir === '→' ? 'sabit' : 'normal'}</span>
                    {anomaly && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-warn-light text-warn-text border border-warn/30">
                        ort. {fmt(anomaly.avg)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 text-[9px] text-[#cbd5e1]">
            Turuncu bar = mevcut ay anormalisi · trend ok = bu ay vs geçen ay
          </div>
        </div>
      )}

      {/* ── Monthly trend ─────────────────────────────────────────────────────── */}
      {trend.length > 1 && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">Aylık Gider Trendi</h3>
          <div className="flex items-end gap-2 h-20">
            {trend.map(t => {
              const heightPct    = Math.max(4, (t.total / maxTrendTotal) * 100)
              const isCurrent    = t.ym === currentYM
              return (
                <div key={t.ym} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className={`w-full rounded-t transition-all ${isCurrent ? 'bg-neg' : 'bg-neg-light group-hover:bg-neg'}`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <div className={`text-[9px] font-semibold ${isCurrent ? 'text-neg' : 'text-[#94a3b8]'}`}>{fmtMonth(t.ym)}</div>
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-[#0f172a] text-white rounded px-2 py-1 text-[10px] whitespace-nowrap">
                    <div className="font-bold">{fmtMonth(t.ym)}</div>
                    <div className="text-neg/70">{fmt(t.total)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-[#94a3b8]">
            <span>En düşük: {fmt(Math.min(...trend.map(t => t.total)))}</span>
            <span>En yüksek: {fmt(Math.max(...trend.map(t => t.total)))}</span>
          </div>
        </div>
      )}

      {/* ── Client: expense list + approval queue + slide-over add form ─────────── */}
      <ExpensesIntelligenceClient
        initialExpenses={expenses}
        initialRecurring={recurring}
        initialPartners={partners}
        approvalQueue={approvalQueue.map(e => ({
          id:          e.id,
          title:       (e as ExpenseRow).title ?? e.description ?? 'Masraf',
          amount_try:  Number(e.amount_try),
          category:    e.category ?? 'other',
          expense_date: e.expense_date,
          workflow_instance: (e as ExpenseRow).workflow_instance ?? null,
        }))}
      />

      {/* ── Borç Yaşlandırma (AP Aging) ──────────────────────────────────────── */}
      <PayablesAgingSection />

      {/* ── Anormal Gider Tespiti ──────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#f1f5f9]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Anormal Gider Tespiti
          </span>
          {anomalyReport && (anomalyReport.high_count + anomalyReport.medium_count + anomalyReport.low_count) > 0 && (
            <div className="flex items-center gap-1.5">
              {anomalyReport.high_count > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-[#fee2e2] text-[#b91c1c] border border-[#fca5a5]">
                  Yüksek {anomalyReport.high_count}
                </span>
              )}
              {anomalyReport.medium_count > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-warn-light text-warn-text border border-warn/30">
                  Orta {anomalyReport.medium_count}
                </span>
              )}
              {anomalyReport.low_count > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-[#fefce8] text-[#a16207] border border-[#fde047]/50">
                  Düşük {anomalyReport.low_count}
                </span>
              )}
            </div>
          )}
        </div>

        {!anomalyReport || anomalyReport.anomalies.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[#94a3b8]">
            Son 30 günde anormal gider tespit edilmedi
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-4 py-2">Tarih</th>
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-2 py-2">Tedarikçi</th>
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-2 py-2">Tür</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-2 py-2">Tutar</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-2 py-2">Sapma</th>
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-2 py-2">Tip</th>
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-2 py-2">Açıklama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {anomalyReport.anomalies.map(a => {
                  const severityStyle =
                    a.severity === 'high'   ? 'bg-[#fee2e2] text-[#b91c1c] border-[#fca5a5]' :
                    a.severity === 'medium' ? 'bg-warn-light text-warn-text border-warn/30'   :
                                             'bg-[#fefce8] text-[#a16207] border-[#fde047]/50'
                  const typeLabel =
                    a.anomaly_type === 'spike'             ? 'Ani Artış'   :
                    a.anomaly_type === 'new_vendor'        ? 'Yeni Tedarikçi' :
                    a.anomaly_type === 'unusual_category'  ? 'Alışılmadık Kategori' :
                                                             'Kopya Şüphesi'
                  const devSign = a.deviation_pct > 0 ? '+' : ''
                  return (
                    <tr key={a.expense_id} className="hover:bg-[#f8fafc]/60">
                      <td className="px-4 py-2 tabular-nums text-[#64748b] whitespace-nowrap">{a.expense_date}</td>
                      <td className="px-2 py-2 text-[#334155] max-w-[120px] truncate">
                        {a.supplier_name ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-[#334155]">
                        {CATEGORY_LABELS[a.expense_type] ?? a.expense_type}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-neg">
                        {fmt(a.amount_try)}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums font-bold whitespace-nowrap ${
                        a.deviation_pct > 50 ? 'text-[#b91c1c]' :
                        a.deviation_pct > 25 ? 'text-warn-text' : 'text-[#64748b]'
                      }`}>
                        {devSign}{a.deviation_pct.toFixed(0)}%
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border ${severityStyle}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[#64748b] max-w-[200px]">{a.description}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-[#f1f5f9] flex items-center justify-between text-[10px] text-[#94a3b8]">
              <span>Son 30 gün analizi · {anomalyReport.analysis_window_days} günlük pencere</span>
              <span>Toplam anormal tutar: <strong className="text-neg">{fmt(anomalyReport.total_anomaly_amount_try)}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* ── Tedarikçi Analizi ─────────────────────────────────────────────────── */}
      <SupplierAnalyticsPanel />

      {/* ── Tedarikçi Ödeme Koşulları ─────────────────────────────────────────── */}
      <SupplierPaymentTermsClient companyId={companyId} />

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="Gider artışı brüt marjı düşürür ve runway'ı kısaltır — gider trendi satış hızıyla birlikte değerlendirilmeli."
        links={[
          { label: 'P&L Analizi',   href: '/dashboard/finance?tab=pnl' },
          { label: 'Risk Analizi',  href: '/dashboard/finance?tab=risks' },
        ]}
      />
    </div>
  )
}
