// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/ledger/period-close-enhanced.service.ts
//
// Enhanced Period Close Readiness — 16-point auto+manual checklist
// Queries all relevant systems in parallel to compute live readiness.
//
// 12 auto-verified checks + 4 manual confirmations.
// Blocking failures prevent close.  Warnings do NOT prevent close.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { AuditReadinessService } from '@/lib/services/governance/audit-readiness.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface PeriodCloseCheck {
  key:         string
  label:       string                              // Turkish
  category:    'accounting' | 'compliance' | 'partner' | 'documents'
  is_auto:     boolean                             // true = system verified
  status:      'pass' | 'fail' | 'warn' | 'pending' | 'skip'
  detail:      string
  blocking:    boolean                             // if true, prevents close
  action_url?: string
}

export interface PeriodCloseReadiness {
  period_id:           string | null
  period_label:        string
  can_close:           boolean
  checks:              PeriodCloseCheck[]
  blocking_count:      number
  warning_count:       number
  auto_passed_count:   number
  manual_pending_count: number
  computed_at:         string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function pass(key: string, label: string, category: PeriodCloseCheck['category'], detail: string, blocking: boolean, actionUrl?: string, isAuto = true): PeriodCloseCheck {
  return { key, label, category, is_auto: isAuto, status: 'pass', detail, blocking, action_url: actionUrl }
}
function fail(key: string, label: string, category: PeriodCloseCheck['category'], detail: string, blocking: boolean, actionUrl?: string, isAuto = true): PeriodCloseCheck {
  return { key, label, category, is_auto: isAuto, status: 'fail', detail, blocking, action_url: actionUrl }
}
function warn(key: string, label: string, category: PeriodCloseCheck['category'], detail: string, blocking: boolean, actionUrl?: string, isAuto = true): PeriodCloseCheck {
  return { key, label, category, is_auto: isAuto, status: 'warn', detail, blocking, action_url: actionUrl }
}
function skip(key: string, label: string, category: PeriodCloseCheck['category'], detail: string, blocking: boolean, isAuto = true): PeriodCloseCheck {
  return { key, label, category, is_auto: isAuto, status: 'skip', detail, blocking }
}
function pending(key: string, label: string, category: PeriodCloseCheck['category'], detail: string, blocking: boolean): PeriodCloseCheck {
  return { key, label, category, is_auto: false, status: 'pending', detail, blocking }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class PeriodCloseEnhancedService {
  static async getReadiness(
    companyId: string,
    uid:       string,
    supabase:  AnyClient,
    periodId?: string,
  ): Promise<PeriodCloseReadiness> {

    // ── Resolve period ─────────────────────────────────────────────────────────
    let period: { id: string; period_start: string; period_end: string } | null = null

    if (periodId) {
      const { data } = await (supabase as SupabaseClient)
        .from('accounting_periods')
        .select('id, period_start, period_end')
        .eq('id', periodId)
        .eq('company_id', companyId)
        .maybeSingle()
      period = data ?? null
    }

    if (!period) {
      const { data } = await (supabase as SupabaseClient)
        .from('accounting_periods')
        .select('id, period_start, period_end')
        .eq('company_id', companyId)
        .in('status', ['open', 'pre_close'])
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      period = data ?? null
    }

    const periodLabel = period
      ? (() => {
          const d = new Date(period.period_start + 'T00:00:00Z')
          return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
        })()
      : 'Dönem bulunamadı'

    const from = period?.period_start ?? new Date().toISOString().slice(0, 7) + '-01'
    const to   = period?.period_end   ?? new Date().toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const periodYM = from.slice(0, 7)  // YYYY-MM of the period

    // ── Parallel data fetches (all resilient to failure) ──────────────────────
    const [
      journalResult,
      draftSalesResult,
      draftExpensesResult,
      balanceSheetResult,
      bankLinesResult,
      taxCalendarResult,
      compensationResult,
      auditResult,
      dividendWorkflowResult,
      loanTranchesResult,
      capitalCommitmentsResult,
      bankStatementDocResult,
    ] = await Promise.allSettled([

      // 1. Journal entries for period: check DR = CR
      (supabase as SupabaseClient)
        .from('journal_entries')
        .select('debit_try, credit_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('entry_date', from)
        .lte('entry_date', to),

      // 2. Draft sales in period
      (supabase as SupabaseClient)
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('status', 'draft')
        .gte('sale_date', from)
        .lte('sale_date', to),

      // 3. Draft expenses in period
      (supabase as SupabaseClient)
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'draft')
        .gte('expense_date', from)
        .lte('expense_date', to),

      // 4. Balance sheet for cash position
      (supabase as SupabaseClient)
        .from('accounting_periods')
        .select('opening_cash_try, closing_cash_try')
        .eq('company_id', companyId)
        .eq('id', period?.id ?? '')
        .maybeSingle(),

      // 5. Bank statement lines for period: matched vs total
      (supabase as SupabaseClient)
        .from('bank_statement_lines')
        .select('id, match_status')
        .eq('company_id', companyId)
        .gte('transaction_date', from)
        .lte('transaction_date', to),

      // 6. Tax calendar: check KDV due date for period
      (supabase as SupabaseClient)
        .from('tax_obligations')
        .select('id, obligation_type, due_date, status')
        .eq('company_id', companyId)
        .eq('obligation_type', 'kdv_declaration')
        .like('id', `%${periodYM}%`)
        .maybeSingle(),

      // 7. Pending compensation payments
      (supabase as SupabaseClient)
        .from('partner_compensation_payments')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .lte('period_end', to),

      // 8. Audit readiness
      AuditReadinessService.compute(companyId, supabase),

      // 9. Pending dividend workflow instances (older than 7 days)
      (supabase as SupabaseClient)
        .from('workflow_instances')
        .select('id, created_at')
        .eq('company_id', companyId)
        .eq('workflow_type', 'dividend_declaration')
        .in('status', ['pending', 'in_progress'])
        .lt('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),

      // 10. Partner loan tranches with overdue expected_repayment_date
      (supabase as SupabaseClient)
        .from('partner_loan_tranches')
        .select('id, expected_repayment_date, outstanding_try')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .lt('expected_repayment_date', today)
        .not('expected_repayment_date', 'is', null),

      // 11. Overdue capital commitments
      (supabase as SupabaseClient)
        .from('partner_capital_commitments')
        .select('id, committed_try, paid_try, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lt('due_date', today)
        .not('due_date', 'is', null),

      // 12. Bank statement document for this period
      (supabase as SupabaseClient)
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('document_type', 'bank_statement')
        .gte('document_date', from)
        .lte('document_date', to),
    ])

    const checks: PeriodCloseCheck[] = []

    // ── Check 1: trial_balance_balanced ───────────────────────────────────────
    {
      const key = 'trial_balance_balanced'
      const label = 'Mizan dengesi kontrol edildi'
      if (journalResult.status === 'fulfilled') {
        const rows = (journalResult.value as { data: Array<{ debit_try: number; credit_try: number }> | null }).data ?? []
        if (rows.length === 0) {
          checks.push(pass(key, label, 'accounting', 'Bu dönemde journal kaydı bulunmuyor — mizan dengeli sayılır.', true, '/dashboard/cfo/journal-entries'))
        } else {
          const totalDR = rows.reduce((s, r) => s + Number(r.debit_try ?? 0), 0)
          const totalCR = rows.reduce((s, r) => s + Number(r.credit_try ?? 0), 0)
          const diff = Math.abs(totalDR - totalCR)
          if (diff < 0.01) {
            checks.push(pass(key, label, 'accounting', `DR = CR = ₺${totalDR.toFixed(2)} — mizan dengeli.`, true, '/dashboard/cfo/trial-balance'))
          } else {
            checks.push(fail(key, label, 'accounting', `Mizan dengesizliği: DR ₺${totalDR.toFixed(2)}, CR ₺${totalCR.toFixed(2)}, fark ₺${diff.toFixed(2)}.`, true, '/dashboard/cfo/trial-balance'))
          }
        }
      } else {
        checks.push(warn(key, label, 'accounting', 'Journal verileri yüklenemedi — lütfen mizan kontrolü yapın.', true, '/dashboard/cfo/trial-balance'))
      }
    }

    // ── Check 2: no_unposted_sales ────────────────────────────────────────────
    {
      const key = 'no_unposted_sales'
      const label = 'Tüm satış faturaları kaydedildi'
      if (draftSalesResult.status === 'fulfilled') {
        const count = (draftSalesResult.value as { count: number | null }).count ?? 0
        if (count === 0) {
          checks.push(pass(key, label, 'accounting', 'Bu dönemde taslak satış faturası bulunmuyor.', true))
        } else {
          checks.push(fail(key, label, 'accounting', `${count} adet taslak satış faturası var — bunların onaylanması gerekiyor.`, true, '/dashboard/commercial/sales'))
        }
      } else {
        checks.push(warn(key, label, 'accounting', 'Satış verileri yüklenemedi — lütfen manuel kontrol edin.', true, '/dashboard/commercial/sales'))
      }
    }

    // ── Check 3: no_unposted_expenses ─────────────────────────────────────────
    {
      const key = 'no_unposted_expenses'
      const label = 'Tüm masraflar kaydedildi'
      if (draftExpensesResult.status === 'fulfilled') {
        const count = (draftExpensesResult.value as { count: number | null }).count ?? 0
        if (count === 0) {
          checks.push(pass(key, label, 'accounting', 'Bu dönemde taslak masraf bulunmuyor.', true))
        } else {
          checks.push(fail(key, label, 'accounting', `${count} adet taslak masraf var — bunların onaylanması gerekiyor.`, true, '/dashboard/finance?tab=expenses'))
        }
      } else {
        checks.push(warn(key, label, 'accounting', 'Masraf verileri yüklenemedi — lütfen manuel kontrol edin.', true, '/dashboard/finance?tab=expenses'))
      }
    }

    // ── Check 4: cash_position_positive ──────────────────────────────────────
    {
      const key = 'cash_position_positive'
      const label = 'Nakit pozisyonu pozitif'
      if (balanceSheetResult.status === 'fulfilled') {
        const row = (balanceSheetResult.value as { data: { closing_cash_try?: number | null } | null }).data
        const cash = Number(row?.closing_cash_try ?? 0)
        if (cash > 0) {
          checks.push(pass(key, label, 'accounting', `Dönem kapanış nakit: ₺${cash.toFixed(2)}.`, false))
        } else if (cash === 0) {
          checks.push(warn(key, label, 'accounting', 'Nakit pozisyonu sıfır — kasayı kontrol edin.', false, '/dashboard/finance?tab=cashflow'))
        } else {
          checks.push(warn(key, label, 'accounting', `Nakit pozisyonu negatif: ₺${cash.toFixed(2)} — bu dönem kapatılabilir ancak likidite riski var.`, false, '/dashboard/finance?tab=cashflow'))
        }
      } else {
        checks.push(skip(key, label, 'accounting', 'Nakit verisi hesaplanamadı.', false))
      }
    }

    // ── Check 5: bank_reconciliation_status ──────────────────────────────────
    {
      const key = 'bank_reconciliation_status'
      const label = 'Banka mutabakatı tamamlandı'
      if (bankLinesResult.status === 'fulfilled') {
        const rows = (bankLinesResult.value as { data: Array<{ id: string; match_status: string | null }> | null }).data ?? []
        if (rows.length === 0) {
          checks.push(skip(key, label, 'compliance', 'Bu dönemde banka ekstresi yüklenmemiş — mutabakat zorunlu değil.', true))
        } else {
          const matched = rows.filter(r => r.match_status === 'matched').length
          const pct = rows.length > 0 ? (matched / rows.length) * 100 : 0
          if (pct >= 90) {
            checks.push(pass(key, label, 'compliance', `${pct.toFixed(0)}% mutabakat sağlandı (${matched}/${rows.length} satır).`, true, '/dashboard/cfo/bank-reconciliation'))
          } else if (pct >= 70) {
            checks.push(warn(key, label, 'compliance', `Mutabakat %${pct.toFixed(0)} — minimum %90 önerilir (${matched}/${rows.length} satır).`, true, '/dashboard/cfo/bank-reconciliation'))
          } else {
            checks.push(fail(key, label, 'compliance', `Mutabakat %${pct.toFixed(0)} — %90 altında (${matched}/${rows.length} satır). Banka mutabakatını tamamlayın.`, true, '/dashboard/cfo/bank-reconciliation'))
          }
        }
      } else {
        checks.push(skip(key, label, 'compliance', 'Banka mutabakat verisi yüklenemedi.', true))
      }
    }

    // ── Check 6: kdv_period_not_overdue ──────────────────────────────────────
    {
      const key = 'kdv_period_not_overdue'
      const label = 'KDV beyanname tarihi geçmemiş'
      // Compute KDV due date: 26th of the month following the period
      const [py, pm] = periodYM.split('-').map(Number)
      const nextYear  = pm === 12 ? py + 1 : py
      const nextMonth = pm === 12 ? 1 : pm + 1
      const dueRaw    = `${nextYear}-${String(nextMonth).padStart(2, '0')}-26`
      const daysRemaining = Math.round((new Date(dueRaw + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86_400_000)
      if (daysRemaining < 0) {
        checks.push(fail(key, label, 'compliance', `KDV beyanname tarihi geçmiş (${dueRaw}). ${Math.abs(daysRemaining)} gün gecikme var.`, true, '/dashboard/cfo/tax-calendar'))
      } else if (daysRemaining <= 7) {
        checks.push(warn(key, label, 'compliance', `KDV beyanname tarihi yakın — ${daysRemaining} gün kaldı (${dueRaw}).`, false, '/dashboard/cfo/tax-calendar'))
      } else {
        checks.push(pass(key, label, 'compliance', `KDV beyanname tarihi ${dueRaw} — ${daysRemaining} gün kaldı.`, false))
      }
    }

    // ── Check 7: no_overdue_compensation ─────────────────────────────────────
    {
      const key = 'no_overdue_compensation'
      const label = 'Ortak huzur hakkı ödemeleri güncel'
      if (compensationResult.status === 'fulfilled') {
        const count = (compensationResult.value as { count: number | null }).count ?? 0
        if (count === 0) {
          checks.push(pass(key, label, 'compliance', 'Bekleyen huzur hakkı ödemesi bulunmuyor.', true))
        } else {
          checks.push(fail(key, label, 'compliance', `${count} adet bekleyen huzur hakkı ödemesi var — TTK 394 gereği ödenmeli.`, true, '/dashboard/partners?tab=compensation'))
        }
      } else {
        checks.push(skip(key, label, 'compliance', 'Huzur hakkı verisi yüklenemedi.', false))
      }
    }

    // ── Check 8: audit_readiness_score ────────────────────────────────────────
    {
      const key = 'audit_readiness_score'
      const label = 'Denetim hazırlık skoru yeterli'
      if (auditResult.status === 'fulfilled') {
        const score = auditResult.value.score
        if (score >= 60) {
          checks.push(pass(key, label, 'compliance', `Denetim hazırlık skoru: ${score}/100 — yeterli seviyede.`, false, '/dashboard/cfo/governance?tab=audit'))
        } else if (score >= 40) {
          checks.push(warn(key, label, 'compliance', `Denetim hazırlık skoru: ${score}/100 — iyileştirme önerilir.`, false, '/dashboard/cfo/governance?tab=audit'))
        } else {
          checks.push(fail(key, label, 'compliance', `Denetim hazırlık skoru: ${score}/100 — kritik eksikler var.`, false, '/dashboard/cfo/governance?tab=audit'))
        }
      } else {
        checks.push(skip(key, label, 'compliance', 'Denetim hazırlık skoru hesaplanamadı.', false))
      }
    }

    // ── Check 9: no_pending_dividend_workflow ─────────────────────────────────
    {
      const key = 'no_pending_dividend_workflow'
      const label = 'Bekleyen temettü iş akışı yok'
      if (dividendWorkflowResult.status === 'fulfilled') {
        const rows = (dividendWorkflowResult.value as { data: Array<{ id: string }> | null }).data ?? []
        if (rows.length === 0) {
          checks.push(pass(key, label, 'partner', '7 günden eski bekleyen temettü iş akışı bulunmuyor.', false))
        } else {
          checks.push(warn(key, label, 'partner', `${rows.length} adet 7 günden eski bekleyen temettü kararı var.`, false, '/dashboard/partners?tab=dividend'))
        }
      } else {
        checks.push(skip(key, label, 'partner', 'Temettü iş akışı verisi yüklenemedi.', false))
      }
    }

    // ── Check 10: partner_loans_current ──────────────────────────────────────
    {
      const key = 'partner_loans_current'
      const label = 'Ortak borç taksitleri güncel'
      if (loanTranchesResult.status === 'fulfilled') {
        const rows = (loanTranchesResult.value as { data: Array<{ id: string; expected_repayment_date: string; outstanding_try: number }> | null }).data ?? []
        if (rows.length === 0) {
          checks.push(pass(key, label, 'partner', 'Vadesi geçmiş ortak borç taksidi bulunmuyor.', false))
        } else {
          const total = rows.reduce((s, r) => s + Number(r.outstanding_try ?? 0), 0)
          checks.push(warn(key, label, 'partner', `${rows.length} adet vadesi geçmiş ortak borç taksidi — toplam ₺${total.toFixed(0)}.`, false, '/dashboard/partners?tab=loans'))
        }
      } else {
        checks.push(skip(key, label, 'partner', 'Ortak borç verisi yüklenemedi.', false))
      }
    }

    // ── Check 11: capital_commitments_current ─────────────────────────────────
    {
      const key = 'capital_commitments_current'
      const label = 'Sermaye taahhütleri güncel (TTK 588)'
      if (capitalCommitmentsResult.status === 'fulfilled') {
        const rows = (capitalCommitmentsResult.value as { data: Array<{ committed_try: number; paid_try: number; due_date: string }> | null }).data ?? []
        const overdue = rows.filter(r => Number(r.committed_try) > Number(r.paid_try))
        if (overdue.length === 0) {
          checks.push(pass(key, label, 'partner', 'Vadesi geçmiş sermaye taahhüdü bulunmuyor.', false))
        } else {
          const totalGap = overdue.reduce((s, r) => s + (Number(r.committed_try) - Number(r.paid_try)), 0)
          checks.push(warn(key, label, 'partner', `${overdue.length} adet vadesi geçmiş sermaye taahhüdü — toplam eksik ₺${totalGap.toFixed(0)} (TTK 588).`, false, '/dashboard/partners?tab=commitments'))
        }
      } else {
        checks.push(skip(key, label, 'partner', 'Sermaye taahhüt verisi yüklenemedi.', false))
      }
    }

    // ── Check 12: bank_statement_uploaded ────────────────────────────────────
    {
      const key = 'bank_statement_uploaded'
      const label = 'Banka ekstresi yüklendi'
      if (bankStatementDocResult.status === 'fulfilled') {
        const count = (bankStatementDocResult.value as { count: number | null }).count ?? 0
        if (count > 0) {
          checks.push(pass(key, label, 'documents', `${count} adet banka ekstresi belgesi mevcut.`, false, '/dashboard/cfo/documents'))
        } else {
          checks.push(warn(key, label, 'documents', 'Bu dönem için banka ekstresi belgesi yüklenmemiş.', false, '/dashboard/cfo/documents'))
        }
      } else {
        checks.push(skip(key, label, 'documents', 'Belge verisi yüklenemedi.', false))
      }
    }

    // ── Manual checks (4) ─────────────────────────────────────────────────────
    checks.push(pending('management_review_done', 'Yönetim incelemesi tamamlandı', 'compliance', 'CEO/CFO dönem finansal tabloları inceledi ve onayladı.', false))
    checks.push(pending('external_accountant_reviewed', 'Dış muhasebeci gözden geçirdi', 'compliance', 'Dış muhasebeci veya denetçi dönem kapanış kayıtlarını kontrol etti.', false))
    checks.push(pending('variance_analysis_done', 'Sapma analizi tamamlandı', 'accounting', 'Bütçe-gerçekleşme sapma analizi yapıldı ve açıklamalar hazırlandı.', false))
    checks.push(pending('next_period_budget_set', 'Sonraki dönem bütçesi belirlendi', 'accounting', 'Gelecek dönem gelir ve gider bütçesi belirlendi.', false))

    // ── Aggregate ─────────────────────────────────────────────────────────────
    const blockingFailCount  = checks.filter(c => c.blocking && c.status === 'fail').length
    const warningCount       = checks.filter(c => c.status === 'warn').length
    const autoPassed         = checks.filter(c => c.is_auto && c.status === 'pass').length
    const manualPending      = checks.filter(c => !c.is_auto && c.status === 'pending').length

    return {
      period_id:            period?.id ?? null,
      period_label:         periodLabel,
      can_close:            blockingFailCount === 0,
      checks,
      blocking_count:       blockingFailCount,
      warning_count:        warningCount,
      auto_passed_count:    autoPassed,
      manual_pending_count: manualPending,
      computed_at:          new Date().toISOString(),
    }
  }
}
