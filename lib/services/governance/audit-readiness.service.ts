// Audit Readiness Engine — computes a 16-point checklist from live DB data.
// Checks are either COMPUTED (automatic) or ACKNOWLEDGED (manual confirmation).

import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditCheckCategory = 'accounting' | 'partner' | 'governance' | 'tax'
export type AuditCheckType     = 'computed' | 'acknowledged'
export type AuditCheckStatus   = 'pass' | 'fail' | 'warn' | 'skip' | 'needs_review'

export interface AuditCheckItem {
  key:             string
  label:           string
  category:        AuditCheckCategory
  type:            AuditCheckType
  status:          AuditCheckStatus
  detail:          string
  weight:          number
  acknowledged_at?: string
  acknowledged_by?: string
  valid_until?:    string
}

export interface AuditReadinessReport {
  score:       number
  grade:       'A' | 'B' | 'C' | 'D' | 'F'
  items:       AuditCheckItem[]
  computed_at: string
  categories: {
    accounting:  { score: number; total: number; passed: number }
    partner:     { score: number; total: number; passed: number }
    governance:  { score: number; total: number; passed: number }
    tax:         { score: number; total: number; passed: number }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysSince(dateStr: string): number {
  return Math.round(
    (new Date(today()).getTime() - new Date(dateStr).getTime()) / 86_400_000,
  )
}

function toGrade(score: number): AuditReadinessReport['grade'] {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function computeScore(items: AuditCheckItem[]): number {
  let totalWeight  = 0
  let earnedWeight = 0

  for (const item of items) {
    if (item.status === 'skip') continue     // excluded from denominator
    totalWeight += item.weight
    if (item.status === 'pass') earnedWeight += item.weight
    else if (item.status === 'warn') earnedWeight += item.weight * 0.5
    // fail / needs_review → 0
  }

  if (totalWeight === 0) return 100
  return Math.round((earnedWeight / totalWeight) * 100)
}

function categoryStats(
  items: AuditCheckItem[],
  cat:   AuditCheckCategory,
): { score: number; total: number; passed: number } {
  const catItems = items.filter(i => i.category === cat && i.status !== 'skip')
  const total    = catItems.length
  const passed   = catItems.filter(i => i.status === 'pass').length
  const score    = computeScore(catItems)
  return { score, total, passed }
}

// ── Main Service ──────────────────────────────────────────────────────────────

export class AuditReadinessService {
  /**
   * Computes the full audit readiness report for a company.
   */
  static async compute(
    companyId: string,
    supabase:  SupabaseClient,
  ): Promise<AuditReadinessReport> {
    const now = new Date().toISOString()
    const t   = today()

    // ── Fetch acknowledgments ─────────────────────────────────────────────────
    const { data: acks } = await supabase
      .from('governance_audit_acknowledgments')
      .select('check_key, acknowledged_at, acknowledged_by, valid_until')
      .eq('company_id', companyId)
      .gte('valid_until', t)
      .order('acknowledged_at', { ascending: false })

    const ackMap: Record<string, { acknowledged_at: string; acknowledged_by: string; valid_until: string }> = {}
    for (const a of acks ?? []) {
      if (!ackMap[a.check_key]) {
        ackMap[a.check_key] = {
          acknowledged_at: a.acknowledged_at,
          acknowledged_by: a.acknowledged_by,
          valid_until:     a.valid_until,
        }
      }
    }

    // ── Fetch data for computed checks ────────────────────────────────────────

    // accounting_periods
    const { data: openPeriods } = await supabase
      .from('accounting_periods')
      .select('id, period_start, period_end, status, label')
      .eq('company_id', companyId)
      .in('status', ['open', 'pre_close'])
      .order('period_start', { ascending: false })

    // journal_entries sum for trial balance (optional — may not exist)
    const { data: jeSums } = await supabase
      .from('journal_entry_lines')
      .select('type, amount')
      .eq('company_id', companyId)
      .not('type', 'is', null)

    // balance sheet cash via a query to expenses / accounts
    // We'll use a simpler approach: look at account balances or compute from services
    // For now: sum cash accounts (asset accounts with type 'cash' or similar)
    const { data: cashAccounts } = await supabase
      .from('accounts')
      .select('id, balance, account_type')
      .eq('company_id', companyId)
      .eq('account_type', 'cash')

    // partners
    const { data: partners } = await supabase
      .from('partners')
      .select('id, is_active, share_ratio')
      .eq('company_id', companyId)

    // partner_loan_tranches
    const { data: tranches } = await supabase
      .from('partner_loan_tranches')
      .select('id, interest_rate_annual, status')
      .eq('company_id', companyId)
      .eq('status', 'active')

    // workflow_instances
    const { data: pendingWorkflows } = await supabase
      .from('workflow_instances')
      .select('id, workflow_type, initiated_at, status')
      .eq('company_id', companyId)
      .eq('status', 'pending')

    // corporate_actions (last 90 days)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const { data: recentActions } = await supabase
      .from('corporate_actions')
      .select('id, action_date')
      .eq('company_id', companyId)
      .gte('action_date', ninetyDaysAgo.toISOString().slice(0, 10))
      .limit(1)

    // governance_resolutions (drafts)
    const { data: draftResolutions } = await supabase
      .from('governance_resolutions')
      .select('id, status, created_at')
      .eq('company_id', companyId)
      .eq('status', 'draft')

    // expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id, expense_type')
      .eq('company_id', companyId)
      .is('expense_type', null)
      .limit(1)

    // ── Build check items ─────────────────────────────────────────────────────
    const items: AuditCheckItem[] = []

    // ── Category 1: Muhasebe Doğruluğu ───────────────────────────────────────

    // 1. period_current_open
    {
      const hasOpenPeriod = (openPeriods ?? []).length > 0
      items.push({
        key:      'period_current_open',
        label:    'Aktif muhasebe dönemi açık',
        category: 'accounting',
        type:     'computed',
        weight:   8,
        status:   hasOpenPeriod ? 'pass' : 'fail',
        detail:   hasOpenPeriod
          ? `${(openPeriods ?? []).length} açık dönem mevcut.`
          : 'Açık muhasebe dönemi bulunamadı. Yeni dönem başlatılmalı.',
      })
    }

    // 2. no_overdue_period
    {
      const overdueperiods = (openPeriods ?? []).filter(p => {
        const daysSinceStart = daysSince(p.period_start)
        return daysSinceStart > 45
      })
      items.push({
        key:      'no_overdue_period',
        label:    '45 günü aşan açık dönem yok',
        category: 'accounting',
        type:     'computed',
        weight:   7,
        status:   overdueperiods.length === 0 ? 'pass' : 'fail',
        detail:   overdueperiods.length === 0
          ? 'Tüm açık dönemler 45 gün sınırı içinde.'
          : `${overdueperiods.length} dönem 45 günü aşkın süredir açık: ${overdueperiods.map(p => p.label ?? p.period_start.slice(0, 7)).join(', ')}.`,
      })
    }

    // 3. trial_balance_balanced
    {
      if (jeSums === null || (jeSums ?? []).length === 0) {
        items.push({
          key:      'trial_balance_balanced',
          label:    'Mizan dengede (Σ Borç = Σ Alacak)',
          category: 'accounting',
          type:     'computed',
          weight:   10,
          status:   'skip',
          detail:   'Genel muhasebe henüz aktif değil — bu kontrol atlanıyor.',
        })
      } else {
        let totalDebit  = 0
        let totalCredit = 0
        for (const line of jeSums ?? []) {
          if (line.type === 'debit')  totalDebit  += Number(line.amount ?? 0)
          if (line.type === 'credit') totalCredit += Number(line.amount ?? 0)
        }
        const diff = Math.abs(totalDebit - totalCredit)
        items.push({
          key:      'trial_balance_balanced',
          label:    'Mizan dengede (Σ Borç = Σ Alacak)',
          category: 'accounting',
          type:     'computed',
          weight:   10,
          status:   diff <= 1 ? 'pass' : 'fail',
          detail:   diff <= 1
            ? `Mizan dengede (fark: ₺${diff.toFixed(2)}).`
            : `Mizan dengesiz — fark: ₺${diff.toFixed(2)}. Yevmiye kayıtları kontrol edilmeli.`,
        })
      }
    }

    // 4. cash_position_positive
    {
      const totalCash = (cashAccounts ?? []).reduce((sum, a) => sum + Number(a.balance ?? 0), 0)
      const hasCashData = (cashAccounts ?? []).length > 0
      if (!hasCashData) {
        items.push({
          key:      'cash_position_positive',
          label:    'Nakit pozisyonu pozitif',
          category: 'accounting',
          type:     'computed',
          weight:   8,
          status:   'skip',
          detail:   'Nakit hesabı verisi bulunamadı — bu kontrol atlanıyor.',
        })
      } else {
        items.push({
          key:      'cash_position_positive',
          label:    'Nakit pozisyonu pozitif',
          category: 'accounting',
          type:     'computed',
          weight:   8,
          status:   totalCash > 0 ? 'pass' : totalCash === 0 ? 'warn' : 'fail',
          detail:   totalCash > 0
            ? `Toplam nakit: ₺${totalCash.toLocaleString('tr-TR')}.`
            : totalCash === 0
              ? 'Nakit bakiyesi sıfır — gözden geçirilmeli.'
              : `Negatif nakit pozisyonu: ₺${totalCash.toLocaleString('tr-TR')}.`,
        })
      }
    }

    // 5. receivables_aging_reviewed (acknowledged)
    {
      const ack = ackMap['receivables_aging_reviewed']
      items.push({
        key:             'receivables_aging_reviewed',
        label:           'Alacak yaşlandırması bu ay gözden geçirildi',
        category:        'accounting',
        type:            'acknowledged',
        weight:          5,
        status:          ack ? 'pass' : 'needs_review',
        detail:          ack
          ? `Onaylayan: ${ack.acknowledged_by} — ${new Date(ack.acknowledged_at).toLocaleDateString('tr-TR')} (geçerli: ${ack.valid_until}).`
          : 'Alacak yaşlandırması henüz onaylanmadı. Yönetici onayı gerekli.',
        acknowledged_at: ack?.acknowledged_at,
        acknowledged_by: ack?.acknowledged_by,
        valid_until:     ack?.valid_until,
      })
    }

    // ── Category 2: Ortak Finansmanı ─────────────────────────────────────────

    // 6. partner_capital_accounts_current
    {
      const activePartners = (partners ?? []).filter(p => p.is_active && Number(p.share_ratio ?? 0) > 0)
      const totalPartners  = (partners ?? []).length
      items.push({
        key:      'partner_capital_accounts_current',
        label:    'Tüm ortakların aktif sermaye pozisyonu var',
        category: 'partner',
        type:     'computed',
        weight:   8,
        status:   totalPartners === 0 ? 'skip'
                : activePartners.length === totalPartners ? 'pass'
                : activePartners.length > 0 ? 'warn' : 'fail',
        detail:   totalPartners === 0
          ? 'Ortak kaydı bulunamadı.'
          : `${activePartners.length}/${totalPartners} ortak aktif sermaye pozisyonuna sahip.`,
      })
    }

    // 7. loan_tranches_documented
    {
      const activeTranches = (tranches ?? [])
      const undocumented   = activeTranches.filter(t => !t.interest_rate_annual || Number(t.interest_rate_annual) === 0)
      items.push({
        key:      'loan_tranches_documented',
        label:    'Tüm ortak kredilerinde faiz oranı tanımlı',
        category: 'partner',
        type:     'computed',
        weight:   7,
        status:   activeTranches.length === 0 ? 'skip'
                : undocumented.length === 0 ? 'pass' : 'fail',
        detail:   activeTranches.length === 0
          ? 'Aktif kredi dilimi bulunamadı.'
          : undocumented.length === 0
            ? `${activeTranches.length} aktif kredi diliminin tamamında faiz oranı tanımlı.`
            : `${undocumented.length} kredi diliminde faiz oranı tanımlı değil (0%).`,
      })
    }

    // 8. no_unresolved_dividend_workflow
    {
      const dividendWorkflows = (pendingWorkflows ?? []).filter(
        w => w.workflow_type === 'dividend_declaration',
      )
      const stale = dividendWorkflows.filter(w => daysSince(w.initiated_at) > 14)
      items.push({
        key:      'no_unresolved_dividend_workflow',
        label:    '14 günü aşan bekleyen temettü iş akışı yok',
        category: 'partner',
        type:     'computed',
        weight:   6,
        status:   stale.length === 0 ? 'pass' : 'fail',
        detail:   stale.length === 0
          ? 'Bekleyen eski temettü iş akışı yok.'
          : `${stale.length} temettü iş akışı 14 günü aşkın süredir beklemede.`,
      })
    }

    // 9. partner_distributions_reviewed (acknowledged)
    {
      const ack = ackMap['partner_distributions_reviewed']
      items.push({
        key:             'partner_distributions_reviewed',
        label:           'Ortak dağıtım gözden geçirmesi tamamlandı',
        category:        'partner',
        type:            'acknowledged',
        weight:          5,
        status:          ack ? 'pass' : 'needs_review',
        detail:          ack
          ? `Onaylayan: ${ack.acknowledged_by} — ${new Date(ack.acknowledged_at).toLocaleDateString('tr-TR')} (geçerli: ${ack.valid_until}).`
          : 'Ortak dağıtım gözden geçirmesi henüz onaylanmadı.',
        acknowledged_at: ack?.acknowledged_at,
        acknowledged_by: ack?.acknowledged_by,
        valid_until:     ack?.valid_until,
      })
    }

    // ── Category 3: Kurumsal Yönetim ─────────────────────────────────────────

    // 10. corporate_actions_recorded
    {
      items.push({
        key:      'corporate_actions_recorded',
        label:    'Son 90 günde en az bir kurumsal aksiyon kaydı var',
        category: 'governance',
        type:     'computed',
        weight:   7,
        status:   (recentActions ?? []).length > 0 ? 'pass' : 'warn',
        detail:   (recentActions ?? []).length > 0
          ? 'Son 90 günde kurumsal aksiyon kaydı mevcut.'
          : 'Son 90 günde kurumsal aksiyon kaydı yok — gözden geçirilmeli.',
      })
    }

    // 11. resolutions_current
    {
      const staleDrafts = (draftResolutions ?? []).filter(r => daysSince(r.created_at) > 30)
      items.push({
        key:      'resolutions_current',
        label:    '30 günü aşan taslak karar yok',
        category: 'governance',
        type:     'computed',
        weight:   6,
        status:   staleDrafts.length === 0 ? 'pass' : 'fail',
        detail:   staleDrafts.length === 0
          ? 'Eski taslak karar bulunamadı.'
          : `${staleDrafts.length} taslak karar 30 günü aşkın süredir onaylanmayı bekliyor.`,
      })
    }

    // 12. workflows_cleared
    {
      const staleWorkflows = (pendingWorkflows ?? []).filter(w => daysSince(w.initiated_at) > 7)
      items.push({
        key:      'workflows_cleared',
        label:    '7 günü aşan bekleyen onay iş akışı yok',
        category: 'governance',
        type:     'computed',
        weight:   6,
        status:   staleWorkflows.length === 0 ? 'pass' : 'fail',
        detail:   staleWorkflows.length === 0
          ? 'Bekleyen eski onay iş akışı yok.'
          : `${staleWorkflows.length} onay iş akışı 7 günü aşkın süredir beklemede.`,
      })
    }

    // 13. governance_review_completed (acknowledged)
    {
      const ack = ackMap['governance_review_completed']
      items.push({
        key:             'governance_review_completed',
        label:           'Periyodik yönetişim gözden geçirmesi onaylandı',
        category:        'governance',
        type:            'acknowledged',
        weight:          5,
        status:          ack ? 'pass' : 'needs_review',
        detail:          ack
          ? `Onaylayan: ${ack.acknowledged_by} — ${new Date(ack.acknowledged_at).toLocaleDateString('tr-TR')} (geçerli: ${ack.valid_until}).`
          : 'Yönetişim gözden geçirmesi henüz onaylanmadı.',
        acknowledged_at: ack?.acknowledged_at,
        acknowledged_by: ack?.acknowledged_by,
        valid_until:     ack?.valid_until,
      })
    }

    // ── Category 4: Vergi Uyumu ──────────────────────────────────────────────

    // 14. kdv_period_current
    {
      // KDV is tied to accounting periods — check that current period is not overdue
      const hasCurrentOpenPeriod = (openPeriods ?? []).some(p => {
        const daysSinceStart = daysSince(p.period_start)
        return daysSinceStart <= 45
      })
      items.push({
        key:      'kdv_period_current',
        label:    'KDV dönemi güncel (45 gün sınırı içinde)',
        category: 'tax',
        type:     'computed',
        weight:   8,
        status:   (openPeriods ?? []).length === 0 ? 'fail'
                : hasCurrentOpenPeriod ? 'pass' : 'warn',
        detail:   (openPeriods ?? []).length === 0
          ? 'Açık muhasebe dönemi bulunamadı — KDV dönemi kontrol edilemiyor.'
          : hasCurrentOpenPeriod
            ? 'Mevcut dönem KDV beyan süresi içinde.'
            : 'Dönem 45 günü aşıyor — KDV beyan durumu kontrol edilmeli.',
      })
    }

    // 15. expense_tax_codes_set
    {
      const hasNullExpenseType = (expenses ?? []).length > 0
      items.push({
        key:      'expense_tax_codes_set',
        label:    'Tüm giderlerde expense_type tanımlı',
        category: 'tax',
        type:     'computed',
        weight:   7,
        status:   hasNullExpenseType ? 'fail' : 'pass',
        detail:   hasNullExpenseType
          ? 'Expense_type tanımlanmamış gider kayıtları mevcut — vergi kodu eksik.'
          : 'Tüm gider kayıtlarında expense_type tanımlı.',
      })
    }

    // 16. tax_review_acknowledged (acknowledged)
    {
      const ack = ackMap['tax_review_acknowledged']
      items.push({
        key:             'tax_review_acknowledged',
        label:           'Vergi pozisyonu gözden geçirildi',
        category:        'tax',
        type:            'acknowledged',
        weight:          5,
        status:          ack ? 'pass' : 'needs_review',
        detail:          ack
          ? `Onaylayan: ${ack.acknowledged_by} — ${new Date(ack.acknowledged_at).toLocaleDateString('tr-TR')} (geçerli: ${ack.valid_until}).`
          : 'Vergi pozisyonu henüz onaylanmadı.',
        acknowledged_at: ack?.acknowledged_at,
        acknowledged_by: ack?.acknowledged_by,
        valid_until:     ack?.valid_until,
      })
    }

    // ── Compute scores ────────────────────────────────────────────────────────
    const score = computeScore(items)
    const grade = toGrade(score)

    return {
      score,
      grade,
      items,
      computed_at: now,
      categories: {
        accounting:  categoryStats(items, 'accounting'),
        partner:     categoryStats(items, 'partner'),
        governance:  categoryStats(items, 'governance'),
        tax:         categoryStats(items, 'tax'),
      },
    }
  }

  /**
   * Records a manual acknowledgment for a check item.
   * Acknowledgments expire after `validDays` days (default: 30).
   */
  static async acknowledge(
    companyId: string,
    checkKey:  string,
    userId:    string,
    supabase:  SupabaseClient,
    opts?: { notes?: string; validDays?: number },
  ): Promise<void> {
    const validDays = opts?.validDays ?? 30
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + validDays)

    const { error } = await supabase
      .from('governance_audit_acknowledgments')
      .insert({
        company_id:      companyId,
        check_key:       checkKey,
        acknowledged_by: userId,
        notes:           opts?.notes ?? null,
        valid_until:     validUntil.toISOString().slice(0, 10),
      })

    if (error) throw error
  }
}

// ── Additional pure helpers ───────────────────────────────────────────────────

/**
 * Returns the most critical failing check across all items.
 * Priority: 'fail' > 'warn' > 'needs_review'. Returns null if all pass/skip.
 */
export function findCriticalFailure(items: AuditCheckItem[]): AuditCheckItem | null {
  const priority: Record<AuditCheckStatus, number> = {
    fail:         3,
    warn:         2,
    needs_review: 1,
    pass:         0,
    skip:         0,
  }

  let best: AuditCheckItem | null = null
  for (const item of items) {
    const p = priority[item.status]
    if (p === 0) continue
    if (best === null || p > priority[best.status]) best = item
  }
  return best
}

/** Returns all items belonging to the given category. */
export function filterByCategory(
  items: AuditCheckItem[],
  cat:   AuditCheckCategory,
): AuditCheckItem[] {
  return items.filter(i => i.category === cat)
}

/** Returns the count of items with status 'needs_review'. */
export function countNeedsReview(items: AuditCheckItem[]): number {
  return items.filter(i => i.status === 'needs_review').length
}

/** Returns a human-readable Turkish readiness label for the given grade. */
export function gradeLabel(grade: AuditReadinessReport['grade']): string {
  switch (grade) {
    case 'A': return 'Denetim Hazır'
    case 'B': return 'Büyük Ölçüde Hazır'
    case 'C': return 'Kısmen Hazır'
    case 'D': return 'Eksikler Var'
    case 'F': return 'Denetim Hazır Değil'
  }
}

// ── Re-export helpers for testing ─────────────────────────────────────────────
export { computeScore, toGrade, categoryStats }
