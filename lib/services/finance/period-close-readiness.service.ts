// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/period-close-readiness.service.ts
//
// Period Close Readiness Scorecard
//
// Evaluates 10 checks across data completeness, accounting accuracy, and
// compliance to produce a 0-100 readiness score plus blocking issue list.
//
// All pure functions are exported for unit testing.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckStatus = 'passed' | 'failed' | 'warning' | 'skipped'

export interface CloseCheck {
  id: string
  label: string           // Turkish label
  description: string     // Turkish description
  status: CheckStatus
  is_blocking: boolean    // if failed, blocks period close
  detail?: string         // additional info (e.g., "3 fatura girilmemiş")
  value?: number          // relevant number for display
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Compute readiness score 0-100.
 *   Start with 100.
 *   Blocking failure: -20 each
 *   Non-blocking failure: -8 each
 *   Warning: -3 each
 *   Skipped: -0 (neutral)
 * Clamped to [0, 100].
 */
export function computeCloseReadinessScore(checks: CloseCheck[]): number {
  let score = 100

  for (const check of checks) {
    if (check.status === 'failed') {
      score -= check.is_blocking ? 20 : 8
    } else if (check.status === 'warning') {
      score -= 3
    }
    // passed and skipped: no deduction
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Returns true if no blocking check has status='failed'.
 */
export function isReadyToClose(checks: CloseCheck[]): boolean {
  return !checks.some(c => c.is_blocking && c.status === 'failed')
}

/**
 * Count of checks where is_blocking=true AND status='failed'.
 */
export function computeBlockingIssueCount(checks: CloseCheck[]): number {
  return checks.filter(c => c.is_blocking && c.status === 'failed').length
}

/**
 * Classify readiness level.
 *   ready:      score >= 90 AND no blocking failures
 *   near_ready: score >= 70
 *   needs_work: score >= 50
 *   not_ready:  < 50
 */
export function classifyCloseReadiness(
  score: number,
  checks?: CloseCheck[],
): 'ready' | 'near_ready' | 'needs_work' | 'not_ready' {
  // If checks provided, verify no blocking failures for 'ready'
  if (score >= 90) {
    if (checks && !isReadyToClose(checks)) return 'needs_work'
    return 'ready'
  }
  if (score >= 70) return 'near_ready'
  if (score >= 50) return 'needs_work'
  return 'not_ready'
}

/**
 * Count checks by status.
 */
export function computeChecksPassed(
  checks: CloseCheck[],
): { passed: number; failed: number; warnings: number; total: number } {
  let passed   = 0
  let failed   = 0
  let warnings = 0

  for (const c of checks) {
    if (c.status === 'passed')  passed++
    else if (c.status === 'failed')  failed++
    else if (c.status === 'warning') warnings++
    // skipped: not counted
  }

  return { passed, failed, warnings, total: checks.length }
}

/**
 * Split checks into 4 buckets for display.
 */
export function buildCloseCheckSummary(checks: CloseCheck[]): {
  blocking_failures:     CloseCheck[]
  non_blocking_failures: CloseCheck[]
  warnings:              CloseCheck[]
  passed:                CloseCheck[]
} {
  return {
    blocking_failures:     checks.filter(c => c.is_blocking     && c.status === 'failed'),
    non_blocking_failures: checks.filter(c => !c.is_blocking    && c.status === 'failed'),
    warnings:              checks.filter(c => c.status === 'warning'),
    passed:                checks.filter(c => c.status === 'passed'),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Safe query — returns null on error instead of throwing.
 *  Accepts any thenable (including PostgREST builder chains).
 */
async function safeQuery<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: () => PromiseLike<{ data: T | null; error: any; count?: number | null }>,
): Promise<{ data: T | null; error: unknown; count?: number | null }> {
  try {
    return await fn()
  } catch {
    return { data: null, error: new Error('query_failed') }
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class PeriodCloseReadinessService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    checks: CloseCheck[]
    score: number
    readiness: ReturnType<typeof classifyCloseReadiness>
    is_ready: boolean
    blocking_count: number
    check_summary: ReturnType<typeof buildCloseCheckSummary>
    current_period: {
      id: string | null
      name: string | null
      status: string | null
      start_date: string | null
      end_date: string | null
    }
  }> {
    const now        = new Date()
    const year       = now.getFullYear()
    const month      = now.getMonth() + 1
    const monthStart = `${year}-${pad2(month)}-01`
    const monthEnd   = new Date(year, month, 0).toISOString().slice(0, 10)
    const today      = now.toISOString().slice(0, 10)

    // ── 1. Fetch current accounting period ─────────────────────────────────────
    const periodRes = await safeQuery(() =>
      this.supabase
        .from('accounting_periods')
        .select('id, period_start, period_end, status')
        .eq('company_id', companyId)
        .in('status', ['open', 'closed'])
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
    )

    type PeriodRow = { id: string; period_start: string; period_end: string; status: string } | null
    const period = (periodRes.data as PeriodRow) ?? null

    const currentPeriod = {
      id:         period?.id ?? null,
      name:       period ? `${period.period_start.slice(0, 7)}` : null,
      status:     period?.status ?? null,
      start_date: period?.period_start ?? null,
      end_date:   period?.period_end   ?? null,
    }

    // ── 2. Parallel data fetches ───────────────────────────────────────────────

    const [
      salesDraftRes,
      expensesPendingRes,
      stockNegativeRes,
      bankAccountsRes,
      journalEntriesRes,
      partnerLoanRes,
      manualConfirmRes,
      expensesUncategorizedRes,
    ] = await Promise.all([

      // Check 2: sales drafts this month
      safeQuery(() =>
        this.supabase
          .from('sales')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'draft')
          .gte('created_at', monthStart + 'T00:00:00.000Z')
          .lte('created_at', monthEnd   + 'T23:59:59.999Z')
      ),

      // Check 3: expenses pending approval
      safeQuery(() =>
        this.supabase
          .from('expenses')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', ['draft', 'submitted'])
          .gte('expense_date', monthStart)
          .lte('expense_date', monthEnd)
      ),

      // Check 5: negative stock lots
      safeQuery(() =>
        this.supabase
          .from('stock_lots')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .lt('qty_remaining', 0)
          .is('deleted_at', null)
      ),

      // Check 4: bank accounts — last updated this month
      safeQuery(() =>
        this.supabase
          .from('bank_accounts')
          .select('id, updated_at')
          .eq('company_id', companyId)
          .limit(10)
      ),

      // Check 1: journal entries — debit/credit balance
      safeQuery(() =>
        this.supabase
          .from('journal_entries')
          .select('debit_try, credit_try')
          .eq('company_id', companyId)
          .gte('entry_date', monthStart)
          .lte('entry_date', monthEnd)
      ),

      // Check 8: partner loan tranches due this month
      safeQuery(() =>
        this.supabase
          .from('partner_loan_tranches')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('due_date', monthStart)
          .lte('due_date', monthEnd)
          .not('status', 'eq', 'repaid')
          .is('deleted_at', null)
      ),

      // Check 9: manual confirmations
      safeQuery(() =>
        this.supabase
          .from('period_close_manual_confirmations')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
      ),

      // Check 10: uncategorized expenses this month
      safeQuery(() =>
        this.supabase
          .from('expenses')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .is('expense_type', null)
          .gte('expense_date', monthStart)
          .lte('expense_date', monthEnd)
      ),
    ])

    // ── 3. Build checks ────────────────────────────────────────────────────────

    const checks: CloseCheck[] = []

    // ── Check 1: Trial balance balanced ────────────────────────────────────────
    {
      type JeRow = { debit_try?: number | null; credit_try?: number | null }
      const jeRows: JeRow[] | null = journalEntriesRes.data as JeRow[] | null

      if (journalEntriesRes.error || jeRows === null) {
        checks.push({
          id:          'trial-balance-balanced',
          label:       'Mizan Dengesi',
          description: 'Dönem journal kayıtlarında borç = alacak dengesi',
          status:      'skipped',
          is_blocking: true,
          detail:      'journal_entries tablosu mevcut değil',
        })
      } else {
        const totalDebits  = jeRows.reduce((s, r) => s + Number(r.debit_try  ?? 0), 0)
        const totalCredits = jeRows.reduce((s, r) => s + Number(r.credit_try ?? 0), 0)
        const diff         = Math.abs(totalDebits - totalCredits)
        const isBalanced   = diff < 0.01 // tolerance for floating point

        checks.push({
          id:          'trial-balance-balanced',
          label:       'Mizan Dengesi',
          description: 'Dönem journal kayıtlarında borç = alacak dengesi',
          status:      isBalanced ? 'passed' : 'failed',
          is_blocking: true,
          detail:      isBalanced
            ? `Borç: ${totalDebits.toFixed(2)} = Alacak: ${totalCredits.toFixed(2)}`
            : `Fark: ₺${diff.toFixed(2)} — borç ve alacak eşit değil`,
          value:       diff,
        })
      }
    }

    // ── Check 2: All sales invoiced ─────────────────────────────────────────────
    {
      const count = (salesDraftRes as { count?: number | null }).count ?? 0
      checks.push({
        id:          'all-sales-invoiced',
        label:       'Satışlar Faturalı',
        description: 'Bu ayki taslak (draft) satış kalmamış olmalı',
        status:      count === 0 ? 'passed' : 'failed',
        is_blocking: true,
        detail:      count === 0
          ? 'Tüm satışlar faturalı'
          : `${count} taslak fatura girilmemiş`,
        value:       count,
      })
    }

    // ── Check 3: All expenses approved ─────────────────────────────────────────
    {
      const count = (expensesPendingRes as { count?: number | null }).count ?? 0
      checks.push({
        id:          'all-expenses-approved',
        label:       'Giderler Onaylı',
        description: 'Bu ayki taslak veya bekleyen gider kalmamış olmalı',
        status:      count === 0 ? 'passed' : 'failed',
        is_blocking: true,
        detail:      count === 0
          ? 'Tüm giderler onaylı'
          : `${count} gider onay bekliyor`,
        value:       count,
      })
    }

    // ── Check 4: Bank reconciliation ────────────────────────────────────────────
    {
      type BankRow = { id: string; updated_at?: string | null }
      const bankRows = bankAccountsRes.data as BankRow[] | null

      if (bankAccountsRes.error || bankRows === null) {
        checks.push({
          id:          'bank-reconciliation',
          label:       'Banka Mutabakatı',
          description: 'Banka hesapları bu ay güncellenmiş olmalı',
          status:      'skipped',
          is_blocking: false,
          detail:      'bank_accounts tablosu mevcut değil',
        })
      } else if (bankRows.length === 0) {
        checks.push({
          id:          'bank-reconciliation',
          label:       'Banka Mutabakatı',
          description: 'Banka hesapları bu ay güncellenmiş olmalı',
          status:      'skipped',
          is_blocking: false,
          detail:      'Banka hesabı tanımlanmamış',
        })
      } else {
        // Check if any bank account has been updated this month
        const anyUpdatedThisMonth = bankRows.some(r => {
          if (!r.updated_at) return false
          const updatedDate = r.updated_at.slice(0, 10)
          return updatedDate >= monthStart && updatedDate <= monthEnd
        })

        checks.push({
          id:          'bank-reconciliation',
          label:       'Banka Mutabakatı',
          description: 'Banka hesapları bu ay güncellenmiş olmalı',
          status:      anyUpdatedThisMonth ? 'passed' : 'warning',
          is_blocking: false,
          detail:      anyUpdatedThisMonth
            ? `${bankRows.length} banka hesabı güncel`
            : `${bankRows.length} banka hesabı bu ay güncellenmemiş`,
          value:       bankRows.length,
        })
      }
    }

    // ── Check 5: No negative stock ──────────────────────────────────────────────
    {
      const count = (stockNegativeRes as { count?: number | null }).count ?? 0
      checks.push({
        id:          'no-negative-stock',
        label:       'Negatif Stok Yok',
        description: 'Hiçbir stok lotunda negatif kalan miktar bulunmamalı',
        status:      count === 0 ? 'passed' : 'failed',
        is_blocking: true,
        detail:      count === 0
          ? 'Negatif stok lot yok'
          : `${count} stok lotunda negatif miktar`,
        value:       count,
      })
    }

    // ── Check 6: Period not locked / status check ───────────────────────────────
    {
      if (!period) {
        checks.push({
          id:          'period-not-locked',
          label:       'Dönem Durumu',
          description: 'Aktif muhasebe dönemi açık olmalı',
          status:      'warning',
          is_blocking: true,
          detail:      'Açık muhasebe dönemi bulunamadı',
        })
      } else if (period.status === 'locked') {
        checks.push({
          id:          'period-not-locked',
          label:       'Dönem Durumu',
          description: 'Aktif muhasebe dönemi açık olmalı',
          status:      'warning',
          is_blocking: true,
          detail:      'Dönem zaten kilitlenmiş — kapanış tamamlandı',
        })
      } else {
        checks.push({
          id:          'period-not-locked',
          label:       'Dönem Durumu',
          description: 'Aktif muhasebe dönemi açık olmalı',
          status:      'passed',
          is_blocking: true,
          detail:      `Dönem "${period.status}" durumunda — kapatılabilir`,
        })
      }
    }

    // ── Check 7: KDV preparation ────────────────────────────────────────────────
    {
      // KDV due date: 26th of next month
      let kdvDueYear  = year
      let kdvDueMonth = month + 1
      if (kdvDueMonth > 12) { kdvDueMonth = 1; kdvDueYear++ }
      const kdvDueDate = `${kdvDueYear}-${pad2(kdvDueMonth)}-26`

      const msPerDay     = 1000 * 60 * 60 * 24
      const todayMs      = new Date(today + 'T00:00:00Z').getTime()
      const dueDateMs    = new Date(kdvDueDate + 'T00:00:00Z').getTime()
      const daysUntilKdv = Math.round((dueDateMs - todayMs) / msPerDay)

      const isUrgent = daysUntilKdv <= 10 && daysUntilKdv >= 0
      const isOverdue = daysUntilKdv < 0

      checks.push({
        id:          'kdv-prepared',
        label:       'KDV Hazırlığı',
        description: 'KDV beyanname son tarihi yaklaşıyor mu?',
        status:      isOverdue ? 'failed' : isUrgent ? 'warning' : 'passed',
        is_blocking: false,
        detail:      isOverdue
          ? `KDV son tarihi ${Math.abs(daysUntilKdv)} gün önce geçti (${kdvDueDate})`
          : isUrgent
          ? `KDV son tarihi ${daysUntilKdv} gün sonra (${kdvDueDate})`
          : `KDV son tarihi: ${kdvDueDate} (${daysUntilKdv} gün)`,
        value:       daysUntilKdv,
      })
    }

    // ── Check 8: Partner loans current ─────────────────────────────────────────
    {
      const count = (partnerLoanRes as { count?: number | null }).count ?? 0

      if (partnerLoanRes.error) {
        checks.push({
          id:          'partner-loans-current',
          label:       'Ortak Kredileri',
          description: 'Bu ay vadesi gelen ortak kredi taksiti var mı?',
          status:      'skipped',
          is_blocking: false,
          detail:      'partner_loan_tranches tablosu mevcut değil',
        })
      } else {
        checks.push({
          id:          'partner-loans-current',
          label:       'Ortak Kredileri',
          description: 'Bu ay vadesi gelen ortak kredi taksiti var mı?',
          status:      count === 0 ? 'passed' : 'warning',
          is_blocking: false,
          detail:      count === 0
            ? 'Bu ay vadesi gelen ödenmemiş taksit yok'
            : `${count} taksit bu ay vadeli ve ödenmemiş`,
          value:       count,
        })
      }
    }

    // ── Check 9: Manual confirmations ───────────────────────────────────────────
    {
      const count = (manualConfirmRes as { count?: number | null }).count ?? 0

      if (manualConfirmRes.error) {
        checks.push({
          id:          'manual-confirmations',
          label:       'Manuel Onaylar',
          description: 'Dönem kapanış manuel onayları tamamlandı mı?',
          status:      'skipped',
          is_blocking: false,
          detail:      'period_close_manual_confirmations tablosu mevcut değil',
        })
      } else {
        checks.push({
          id:          'manual-confirmations',
          label:       'Manuel Onaylar',
          description: 'Dönem kapanış manuel onayları tamamlandı mı?',
          status:      count > 0 ? 'passed' : 'warning',
          is_blocking: false,
          detail:      count > 0
            ? `${count} manuel onay kaydedilmiş`
            : 'Henüz manuel onay kaydedilmemiş',
          value:       count,
        })
      }
    }

    // ── Check 10: Expenses categorized ─────────────────────────────────────────
    {
      const count = (expensesUncategorizedRes as { count?: number | null }).count ?? 0
      checks.push({
        id:          'expenses-categorized',
        label:       'Giderler Kategorize',
        description: 'Bu ayki tüm giderlere kategori atanmış olmalı',
        status:      count === 0 ? 'passed' : 'failed',
        is_blocking: false,
        detail:      count === 0
          ? 'Tüm giderler kategorize edilmiş'
          : `${count} gidere kategori atanmamış`,
        value:       count,
      })
    }

    // ── 4. Compute aggregate metrics ───────────────────────────────────────────

    const score         = computeCloseReadinessScore(checks)
    const readiness     = classifyCloseReadiness(score, checks)
    const is_ready      = isReadyToClose(checks)
    const blocking_count = computeBlockingIssueCount(checks)
    const check_summary = buildCloseCheckSummary(checks)

    return {
      checks,
      score,
      readiness,
      is_ready,
      blocking_count,
      check_summary,
      current_period: currentPeriod,
    }
  }
}
