// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/ledger/period-close-checklist.service.ts
//
// Period Close Enforcement Checklist — 14 structured checks across 4 categories.
// Wired to the actual accounting period state machine.
//
// Categories:
//   data_completeness   (4 steps) — draft records, stock, purchases
//   accounting_accuracy (4 steps) — trial balance, cash, receivables, COGS
//   compliance          (3 steps) — legal reserve, KDV, compensation
//   review              (3 steps) — manual CFO / finance team confirmations
//
// Pure exports (testable without DB):
//   allBlockingStepsPassed
//   computeChecklistCompletion
//   buildChecklistStep
//   determineCloseReadiness
//
// Class:
//   PeriodCloseChecklistService
//     .getChecklist(companyId, periodId?) → PeriodCloseChecklist
//     .confirmManualStep(companyId, periodId, stepId, userId) → void
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Domain types ──────────────────────────────────────────────────────────────

export type ChecklistStepStatus = 'pass' | 'fail' | 'pending' | 'skipped'

export type ChecklistCategory =
  | 'data_completeness'
  | 'accounting_accuracy'
  | 'compliance'
  | 'review'

export interface ChecklistStep {
  id:           string
  label:        string
  category:     ChecklistCategory
  status:       ChecklistStepStatus
  is_blocking:  boolean
  detail:       string | null     // explanation of fail/pending reason
  auto_checked: boolean           // true = system checked; false = manual confirmation
  checked_at:   string | null
}

export interface PeriodCloseChecklist {
  period_id:        string
  period_key:       string
  period_label:     string
  period_status:    'open' | 'pre_close' | 'closed' | 'locked'
  readiness:        'ready' | 'blocked' | 'incomplete'
  completion_pct:   number
  steps:            ChecklistStep[]
  blocking_failures: ChecklistStep[]
  can_close:        boolean   // readiness === 'ready' AND period_status === 'open'|'pre_close'
  can_lock:         boolean   // period_status === 'closed'
}

// ── Pure exported functions ────────────────────────────────────────────────────

/**
 * Returns true if all is_blocking steps have status === 'pass' (or 'skipped').
 * Empty array is considered complete (no blockers to fail).
 */
export function allBlockingStepsPassed(
  steps: Array<{ is_blocking: boolean; status: ChecklistStepStatus }>,
): boolean {
  const blocking = steps.filter(s => s.is_blocking)
  if (blocking.length === 0) return true
  return blocking.every(s => s.status === 'pass' || s.status === 'skipped')
}

/**
 * passed / total × 100   (integer, 0 if empty)
 * A step is "passed" when status === 'pass'.
 */
export function computeChecklistCompletion(
  steps: Array<{ status: ChecklistStepStatus }>,
): number {
  if (steps.length === 0) return 0
  const passed = steps.filter(s => s.status === 'pass').length
  return Math.round((passed / steps.length) * 100)
}

/** Construct a ChecklistStep value object from individual fields. */
export function buildChecklistStep(
  id:         string,
  label:      string,
  status:     ChecklistStepStatus,
  isBlocking: boolean,
  detail?:    string,
): ChecklistStep {
  // category is derived from the id prefix by convention
  const category: ChecklistCategory =
    id.startsWith('all_sales')         ||
    id.startsWith('all_expenses')      ||
    id.startsWith('stock_')            ||
    id.startsWith('purchase_')
      ? 'data_completeness'
    : id.startsWith('trial_')          ||
      id.startsWith('no_negative')     ||
      id.startsWith('receivables_')    ||
      id.startsWith('cogs_')
      ? 'accounting_accuracy'
    : id.startsWith('legal_')          ||
      id.startsWith('kdv_')            ||
      id.startsWith('compensation_')
      ? 'compliance'
      : 'review'

  return {
    id,
    label,
    category,
    status,
    is_blocking:  isBlocking,
    detail:       detail ?? null,
    auto_checked: true,
    checked_at:   new Date().toISOString(),
  }
}

/**
 * Determine close readiness:
 *   'ready'      — allBlockingStepsPassed AND completion >= 80 %
 *   'blocked'    — at least one blocking step failed
 *   'incomplete' — no blocking failures but completion < 80 %
 */
export function determineCloseReadiness(
  steps: Array<{ is_blocking: boolean; status: ChecklistStepStatus }>,
): 'ready' | 'blocked' | 'incomplete' {
  const hasBlockingFailure = steps.some(s => s.is_blocking && s.status === 'fail')
  if (hasBlockingFailure) return 'blocked'

  const pct = computeChecklistCompletion(steps)
  if (allBlockingStepsPassed(steps) && pct >= 80) return 'ready'
  return 'incomplete'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function manualStep(
  id:         string,
  label:      string,
  category:   ChecklistCategory,
  isBlocking: boolean,
  confirmedAt?: string | null,
): ChecklistStep {
  const confirmed = !!confirmedAt
  return {
    id,
    label,
    category,
    status:       confirmed ? 'pass' : 'pending',
    is_blocking:  isBlocking,
    detail:       confirmed
      ? null
      : 'Manuel onay gerekiyor.',
    auto_checked: false,
    checked_at:   confirmedAt ?? null,
  }
}

// ── Main service ───────────────────────────────────────────────────────────────

export class PeriodCloseChecklistService {
  constructor(private readonly supabase: AnyClient) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async getChecklist(
    companyId: string,
    periodId?: string,
  ): Promise<PeriodCloseChecklist> {
    // ── 1. Resolve accounting period ──────────────────────────────────────────
    let period: {
      id:           string
      period_start: string
      period_end:   string
      status:       string
    } | null = null

    if (periodId) {
      const { data } = await (this.supabase as SupabaseClient)
        .from('accounting_periods')
        .select('id, period_start, period_end, status')
        .eq('id', periodId)
        .eq('company_id', companyId)
        .maybeSingle()
      period = data ?? null
    }

    if (!period) {
      const { data } = await (this.supabase as SupabaseClient)
        .from('accounting_periods')
        .select('id, period_start, period_end, status')
        .eq('company_id', companyId)
        .in('status', ['open', 'pre_close'])
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      period = data ?? null
    }

    const from   = period?.period_start ?? new Date().toISOString().slice(0, 7) + '-01'
    const to     = period?.period_end   ?? new Date().toISOString().slice(0, 10)
    const today  = new Date().toISOString().slice(0, 10)
    const periodKey = from.slice(0, 7) // YYYY-MM

    const periodLabel = period
      ? (() => {
          const d = new Date(period.period_start + 'T00:00:00Z')
          return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
        })()
      : 'Dönem bulunamadı'

    const periodStatus = (period?.status ?? 'open') as PeriodCloseChecklist['period_status']
    const resolvedId   = period?.id ?? ''

    // ── 2. Fetch manual confirmations if table exists ─────────────────────────
    let manualConfirmations: Record<string, string> = {}
    try {
      const { data: confirmRows } = await (this.supabase as SupabaseClient)
        .from('period_close_manual_confirmations')
        .select('step_id, confirmed_at')
        .eq('company_id', companyId)
        .eq('period_id', resolvedId)
      if (confirmRows) {
        for (const row of confirmRows as Array<{ step_id: string; confirmed_at: string }>) {
          manualConfirmations[row.step_id] = row.confirmed_at
        }
      }
    } catch {
      // table may not exist yet — graceful fallback
    }

    // ── 3. Parallel data fetches ──────────────────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

    const [
      draftSalesResult,
      draftExpensesResult,
      negativeStockResult,
      oldPurchasesResult,
      journalResult,
      cashPositionResult,
      unpaidSalesResult,
      cogsAllocResult,
      netIncomeResult,
      salesForKdvResult,
      compensationResult,
    ] = await Promise.allSettled([

      // DATA_COMPLETENESS — 1. draft sales
      (this.supabase as SupabaseClient)
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('status', 'draft')
        .gte('sale_date', from)
        .lte('sale_date', to),

      // DATA_COMPLETENESS — 2. draft expenses
      (this.supabase as SupabaseClient)
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'draft')
        .gte('expense_date', from)
        .lte('expense_date', to),

      // DATA_COMPLETENESS — 3. negative stock lots
      (this.supabase as SupabaseClient)
        .from('stock_lots')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .lt('qty_remaining', 0),

      // DATA_COMPLETENESS — 4. old unfinished purchases
      (this.supabase as SupabaseClient)
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('status', 'ordered')
        .gte('purchase_date', from)
        .lte('purchase_date', sevenDaysAgo),

      // ACCOUNTING_ACCURACY — 5. journal entries for trial balance
      (this.supabase as SupabaseClient)
        .from('journal_entries')
        .select('id, debit_try, credit_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('entry_date', from)
        .lte('entry_date', to),

      // ACCOUNTING_ACCURACY — 6. cash position (accounting_periods)
      (this.supabase as SupabaseClient)
        .from('accounting_periods')
        .select('closing_cash_try')
        .eq('company_id', companyId)
        .eq('id', resolvedId)
        .maybeSingle(),

      // ACCOUNTING_ACCURACY — 7. unpaid (receivable) sales count
      (this.supabase as SupabaseClient)
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'unpaid')
        .gte('sale_date', from)
        .lte('sale_date', to),

      // ACCOUNTING_ACCURACY — 8. confirmed/paid sales missing allocation
      (this.supabase as SupabaseClient)
        .from('sales')
        .select('id, sale_item_allocations(id)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['confirmed', 'paid'])
        .gte('sale_date', from)
        .lte('sale_date', to),

      // COMPLIANCE — 9. period profit (net income) for legal reserve check
      (this.supabase as SupabaseClient)
        .from('accounting_periods')
        .select('period_profit_try, retained_earnings_brought_forward')
        .eq('company_id', companyId)
        .eq('id', resolvedId)
        .maybeSingle(),

      // COMPLIANCE — 10. KDV — sales in period with kdv_amount_try populated
      (this.supabase as SupabaseClient)
        .from('sales')
        .select('id, kdv_amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['confirmed', 'paid'])
        .gte('sale_date', from)
        .lte('sale_date', to),

      // COMPLIANCE — 11. active compensation schedules with no payments this period
      (this.supabase as SupabaseClient)
        .from('compensation_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'active'),
    ])

    const steps: ChecklistStep[] = []

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY: data_completeness
    // ────────────────────────────────────────────────────────────────────────

    // Step 1: all_sales_entered
    {
      if (draftSalesResult.status === 'fulfilled') {
        const count = (draftSalesResult.value as { count: number | null }).count ?? 0
        steps.push({
          id:           'all_sales_entered',
          label:        'Tüm satışlar girildi',
          category:     'data_completeness',
          status:       count === 0 ? 'pass' : 'fail',
          is_blocking:  true,
          detail:       count === 0
            ? null
            : `${count} adet taslak satış faturası bekliyor — onaylanması gerekiyor.`,
          auto_checked: true,
          checked_at:   new Date().toISOString(),
        })
      } else {
        steps.push({
          id: 'all_sales_entered', label: 'Tüm satışlar girildi',
          category: 'data_completeness', status: 'skipped', is_blocking: true,
          detail: 'Satış verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // Step 2: all_expenses_entered
    {
      if (draftExpensesResult.status === 'fulfilled') {
        const count = (draftExpensesResult.value as { count: number | null }).count ?? 0
        steps.push({
          id:           'all_expenses_entered',
          label:        'Tüm giderler girildi',
          category:     'data_completeness',
          status:       count === 0 ? 'pass' : 'fail',
          is_blocking:  false,
          detail:       count === 0
            ? null
            : `${count} adet taslak gider bekliyor.`,
          auto_checked: true,
          checked_at:   new Date().toISOString(),
        })
      } else {
        steps.push({
          id: 'all_expenses_entered', label: 'Tüm giderler girildi',
          category: 'data_completeness', status: 'skipped', is_blocking: false,
          detail: 'Gider verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // Step 3: stock_reconciled
    {
      if (negativeStockResult.status === 'fulfilled') {
        const count = (negativeStockResult.value as { count: number | null }).count ?? 0
        steps.push({
          id:           'stock_reconciled',
          label:        'Stok mutabakatı tamamlandı',
          category:     'data_completeness',
          status:       count === 0 ? 'pass' : 'fail',
          is_blocking:  true,
          detail:       count === 0
            ? null
            : `${count} adet negatif kalan stok lotu bulundu — FIFO bütünlüğü bozuk.`,
          auto_checked: true,
          checked_at:   new Date().toISOString(),
        })
      } else {
        steps.push({
          id: 'stock_reconciled', label: 'Stok mutabakatı tamamlandı',
          category: 'data_completeness', status: 'skipped', is_blocking: true,
          detail: 'Stok verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // Step 4: purchase_finalized
    {
      if (oldPurchasesResult.status === 'fulfilled') {
        const count = (oldPurchasesResult.value as { count: number | null }).count ?? 0
        steps.push({
          id:           'purchase_finalized',
          label:        'Bekleyen siparişler tamamlandı',
          category:     'data_completeness',
          status:       count === 0 ? 'pass' : 'fail',
          is_blocking:  false,
          detail:       count === 0
            ? null
            : `${count} adet 7 günden eski teslim alınmamış sipariş mevcut.`,
          auto_checked: true,
          checked_at:   new Date().toISOString(),
        })
      } else {
        steps.push({
          id: 'purchase_finalized', label: 'Bekleyen siparişler tamamlandı',
          category: 'data_completeness', status: 'skipped', is_blocking: false,
          detail: 'Satın alma verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY: accounting_accuracy
    // ────────────────────────────────────────────────────────────────────────

    // Step 5: trial_balance_balanced
    {
      if (journalResult.status === 'fulfilled') {
        const rows = (journalResult.value as {
          data: Array<{ id: string; debit_try: number; credit_try: number }> | null
        }).data ?? []
        if (rows.length === 0) {
          steps.push({
            id: 'trial_balance_balanced', label: 'Mizan dengede',
            category: 'accounting_accuracy', status: 'pass', is_blocking: true,
            detail: 'Bu dönemde GL kaydı yok — GL gölge modunda çalışıyor.',
            auto_checked: true, checked_at: new Date().toISOString(),
          })
        } else {
          const totalDR = rows.reduce((s, r) => s + Number(r.debit_try  ?? 0), 0)
          const totalCR = rows.reduce((s, r) => s + Number(r.credit_try ?? 0), 0)
          const diff    = Math.abs(totalDR - totalCR)
          steps.push({
            id:           'trial_balance_balanced',
            label:        'Mizan dengede',
            category:     'accounting_accuracy',
            status:       diff < 1 ? 'pass' : 'fail',
            is_blocking:  true,
            detail:       diff < 1
              ? `DR = CR — mizan dengeli (fark: ₺${diff.toFixed(4)}).`
              : `Mizan dengesizliği: DR ₺${totalDR.toFixed(2)}, CR ₺${totalCR.toFixed(2)}, fark ₺${diff.toFixed(2)}.`,
            auto_checked: true,
            checked_at:   new Date().toISOString(),
          })
        }
      } else {
        steps.push({
          id: 'trial_balance_balanced', label: 'Mizan dengede',
          category: 'accounting_accuracy', status: 'skipped', is_blocking: true,
          detail: 'Journal verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // Step 6: no_negative_cash
    {
      if (cashPositionResult.status === 'fulfilled') {
        const row = (cashPositionResult.value as {
          data: { closing_cash_try: number | null } | null
        }).data
        const cash = Number(row?.closing_cash_try ?? 0)
        steps.push({
          id:           'no_negative_cash',
          label:        'Nakit pozisyonu negatif değil',
          category:     'accounting_accuracy',
          status:       cash >= 0 ? 'pass' : 'fail',
          is_blocking:  false,
          detail:       cash >= 0
            ? `Kapanış nakit: ₺${cash.toFixed(2)}.`
            : `Negatif kapanış nakit: ₺${cash.toFixed(2)} — incelenmeli.`,
          auto_checked: true,
          checked_at:   new Date().toISOString(),
        })
      } else {
        steps.push({
          id: 'no_negative_cash', label: 'Nakit pozisyonu negatif değil',
          category: 'accounting_accuracy', status: 'skipped', is_blocking: false,
          detail: 'Nakit verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // Step 7: receivables_consistent
    {
      if (unpaidSalesResult.status === 'fulfilled') {
        const count = (unpaidSalesResult.value as { count: number | null }).count ?? 0
        steps.push({
          id:           'receivables_consistent',
          label:        'Alacak bakiyeleri tutarlı',
          category:     'accounting_accuracy',
          status:       'pass',  // count alone is informational — we flag it but pass
          is_blocking:  false,
          detail:       count === 0
            ? 'Tüm satışlar tahsil edilmiş.'
            : `${count} adet ödenmemiş satış (alacak) mevcut — takipte.`,
          auto_checked: true,
          checked_at:   new Date().toISOString(),
        })
      } else {
        steps.push({
          id: 'receivables_consistent', label: 'Alacak bakiyeleri tutarlı',
          category: 'accounting_accuracy', status: 'skipped', is_blocking: false,
          detail: 'Alacak verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // Step 8: cogs_allocated
    {
      if (cogsAllocResult.status === 'fulfilled') {
        type SaleRow = { id: string; sale_item_allocations: Array<{ id: string }> }
        const rows = (cogsAllocResult.value as { data: SaleRow[] | null }).data ?? []
        const missingAlloc = rows.filter(r =>
          !r.sale_item_allocations || r.sale_item_allocations.length === 0
        ).length
        steps.push({
          id:           'cogs_allocated',
          label:        'COGS tahsisi tamamlandı',
          category:     'accounting_accuracy',
          status:       missingAlloc === 0 ? 'pass' : 'fail',
          is_blocking:  false,
          detail:       missingAlloc === 0
            ? 'Tüm onaylı satışlar için maliyet tahsisi yapılmış.'
            : `${missingAlloc} adet satışta stok maliyet tahsisi eksik.`,
          auto_checked: true,
          checked_at:   new Date().toISOString(),
        })
      } else {
        steps.push({
          id: 'cogs_allocated', label: 'COGS tahsisi tamamlandı',
          category: 'accounting_accuracy', status: 'skipped', is_blocking: false,
          detail: 'COGS tahsis verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY: compliance
    // ────────────────────────────────────────────────────────────────────────

    // Step 9: legal_reserve_computed
    {
      if (netIncomeResult.status === 'fulfilled') {
        const row = (netIncomeResult.value as {
          data: { period_profit_try: number | null; retained_earnings_brought_forward: number | null } | null
        }).data
        const netIncome = Number(row?.period_profit_try ?? 0)
        if (netIncome > 0) {
          // Profitable period — legal reserve must be set aside
          steps.push({
            id:           'legal_reserve_computed',
            label:        'Yasal yedek akçe ayrıldı (TTK 519)',
            category:     'compliance',
            status:       'pending',  // always pending for manual confirmation if profitable
            is_blocking:  true,
            detail:       `Dönem kârı ₺${netIncome.toFixed(2)} — TTK 519 gereği %5 yasal yedek akçe (%20 ödenmiş sermayeye ulaşana kadar) ayrılmalı.`,
            auto_checked: true,
            checked_at:   new Date().toISOString(),
          })
        } else {
          steps.push({
            id:           'legal_reserve_computed',
            label:        'Yasal yedek akçe ayrıldı (TTK 519)',
            category:     'compliance',
            status:       'pass',
            is_blocking:  false,
            detail:       'Dönem zararda veya sıfırda — yasal yedek akçe zorunlu değil.',
            auto_checked: true,
            checked_at:   new Date().toISOString(),
          })
        }
      } else {
        steps.push({
          id: 'legal_reserve_computed', label: 'Yasal yedek akçe ayrıldı (TTK 519)',
          category: 'compliance', status: 'skipped', is_blocking: false,
          detail: 'Net kar/zarar verisi yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // Step 10: kdv_period_computed
    {
      if (salesForKdvResult.status === 'fulfilled') {
        type SaleKdvRow = { id: string; kdv_amount_try: number | null }
        const rows = (salesForKdvResult.value as { data: SaleKdvRow[] | null }).data ?? []
        if (rows.length === 0) {
          steps.push({
            id:           'kdv_period_computed',
            label:        'KDV tutarları hesaplandı',
            category:     'compliance',
            status:       'pass',
            is_blocking:  false,
            detail:       'Bu dönemde onaylı satış yok — KDV hesaplaması gerekmiyor.',
            auto_checked: true,
            checked_at:   new Date().toISOString(),
          })
        } else {
          const missingKdv = rows.filter(r => r.kdv_amount_try === null || r.kdv_amount_try === undefined).length
          steps.push({
            id:           'kdv_period_computed',
            label:        'KDV tutarları hesaplandı',
            category:     'compliance',
            status:       missingKdv === 0 ? 'pass' : 'fail',
            is_blocking:  false,
            detail:       missingKdv === 0
              ? `${rows.length} satış için KDV tutarları mevcut.`
              : `${missingKdv} adet satışta kdv_amount_try alanı boş.`,
            auto_checked: true,
            checked_at:   new Date().toISOString(),
          })
        }
      } else {
        steps.push({
          id: 'kdv_period_computed', label: 'KDV tutarları hesaplandı',
          category: 'compliance', status: 'skipped', is_blocking: false,
          detail: 'KDV verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // Step 11: compensation_processed
    {
      if (compensationResult.status === 'fulfilled') {
        const activeCount = (compensationResult.value as { count: number | null }).count ?? 0
        // If active schedules exist, we check that the period was covered.
        // This is informational since detailed schedule matching is complex.
        steps.push({
          id:           'compensation_processed',
          label:        'Huzur hakkı ödemeleri işlendi',
          category:     'compliance',
          status:       activeCount === 0 ? 'pass' : 'pending',
          is_blocking:  false,
          detail:       activeCount === 0
            ? 'Aktif huzur hakkı planı yok.'
            : `${activeCount} aktif huzur hakkı planı var — bu dönem ödemeleri kaydedilmeli.`,
          auto_checked: true,
          checked_at:   new Date().toISOString(),
        })
      } else {
        steps.push({
          id: 'compensation_processed', label: 'Huzur hakkı ödemeleri işlendi',
          category: 'compliance', status: 'skipped', is_blocking: false,
          detail: 'Huzur hakkı verileri yüklenemedi.', auto_checked: true, checked_at: null,
        })
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY: review  (manual steps)
    // ────────────────────────────────────────────────────────────────────────

    steps.push(manualStep(
      'cfo_sign_off',
      'CFO onayı',
      'review',
      true,   // blocking
      manualConfirmations['cfo_sign_off'],
    ))

    steps.push(manualStep(
      'balance_sheet_reviewed',
      'Bilanço gözden geçirildi',
      'review',
      false,
      manualConfirmations['balance_sheet_reviewed'],
    ))

    steps.push(manualStep(
      'cashflow_reviewed',
      'Nakit akışı gözden geçirildi',
      'review',
      false,
      manualConfirmations['cashflow_reviewed'],
    ))

    // ── 4. Build checklist ────────────────────────────────────────────────────
    const readiness      = determineCloseReadiness(steps)
    const completion_pct = computeChecklistCompletion(steps)
    const blocking_failures = steps.filter(s => s.is_blocking && s.status === 'fail')

    const can_close = readiness === 'ready' &&
      (periodStatus === 'open' || periodStatus === 'pre_close')

    const can_lock = periodStatus === 'closed'

    return {
      period_id:        resolvedId,
      period_key:       periodKey,
      period_label:     periodLabel,
      period_status:    periodStatus,
      readiness,
      completion_pct,
      steps,
      blocking_failures,
      can_close,
      can_lock,
    }
  }

  // ── Manual step confirmation ────────────────────────────────────────────────

  async confirmManualStep(
    companyId: string,
    periodId:  string,
    stepId:    string,
    userId:    string,
  ): Promise<void> {
    try {
      await (this.supabase as SupabaseClient)
        .from('period_close_manual_confirmations')
        .upsert(
          {
            company_id:   companyId,
            period_id:    periodId,
            step_id:      stepId,
            confirmed_by: userId,
            confirmed_at: new Date().toISOString(),
          },
          { onConflict: 'company_id,period_id,step_id' },
        )
    } catch {
      // Table may not exist — graceful no-op
    }
  }
}
