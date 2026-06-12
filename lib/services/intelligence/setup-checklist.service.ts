// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/intelligence/setup-checklist.service.ts
//
// Company Setup Checklist — reads actual DB state and reports what's configured.
// This is a progress tracker, not a wizard. Each item queries a real table.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export type ChecklistStatus =
  | 'complete'
  | 'incomplete'
  | 'optional_complete'
  | 'optional_incomplete'

export interface ChecklistItem {
  key:               string
  category:          'foundation' | 'partners' | 'products' | 'finance' | 'operations' | 'governance'
  label:             string                 // Turkish label
  description:       string                 // Turkish explanation of what to do
  status:            ChecklistStatus
  action_href:       string | null          // where to go to complete this
  is_required:       boolean                // required for system to work properly
  completion_detail: string | null          // e.g. '3 ürün eklendi' or '2 ortak kayıtlı'
}

export interface SetupChecklistReport {
  items:              ChecklistItem[]
  required_complete:  number
  required_total:     number
  optional_complete:  number
  optional_total:     number
  completion_pct:     number                // required_complete / required_total × 100
  overall_status:     'ready' | 'almost_ready' | 'needs_setup' | 'just_started'
  missing_required:   ChecklistItem[]       // only incomplete required items
  next_action:        ChecklistItem | null  // first incomplete required item
}

// ── Category order (used for sorting / next_action resolution) ────────────────

const CATEGORY_ORDER: ChecklistItem['category'][] = [
  'foundation', 'partners', 'products', 'finance', 'operations', 'governance',
]

// ── Pure helpers (exported) ───────────────────────────────────────────────────

/**
 * Compute required completion percentage.
 * Returns 100 when requiredTotal is 0 (nothing required = fully set up).
 */
export function computeCompletionPct(
  requiredComplete: number,
  requiredTotal:    number,
): number {
  if (requiredTotal === 0) return 100
  return Math.round((requiredComplete / requiredTotal) * 100)
}

/**
 * Assign an overall readiness status based on completion percentage.
 *
 * ready:        required 100%
 * almost_ready: required ≥ 80%
 * needs_setup:  required > 0% but < 80%
 * just_started: required = 0%  (also applies when requiredTotal = 0 and pct = 100 via edge)
 */
export function assignOverallStatus(
  completionPct: number,
  requiredTotal: number,
): SetupChecklistReport['overall_status'] {
  if (requiredTotal === 0 || completionPct >= 100) return 'ready'
  if (completionPct >= 80)  return 'almost_ready'
  if (completionPct > 0)    return 'needs_setup'
  return 'just_started'
}

/**
 * Find the first incomplete required item, in category order.
 * Returns null if all required items are complete.
 */
export function findNextAction(items: ChecklistItem[]): ChecklistItem | null {
  const sorted = [...items].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    return ai - bi
  })

  for (const item of sorted) {
    if (item.is_required && (item.status === 'incomplete')) {
      return item
    }
  }
  return null
}

// ── Additional pure helpers ───────────────────────────────────────────────────

/**
 * Compute setup completion percentages.
 * Returns required_pct, optional_pct, total_pct.
 * When a group has 0 items, its percentage is 100 (nothing required = done).
 */
export function computeSetupProgress(
  items: Array<{ completed: boolean; required: boolean }>,
): {
  required_pct: number
  optional_pct: number
  total_pct: number
} {
  const required = items.filter(i => i.required)
  const optional = items.filter(i => !i.required)

  const reqComplete  = required.filter(i => i.completed).length
  const optComplete  = optional.filter(i => i.completed).length
  const allComplete  = items.filter(i => i.completed).length

  const required_pct = required.length === 0 ? 100 : Math.round((reqComplete / required.length) * 100)
  const optional_pct = optional.length === 0 ? 100 : Math.round((optComplete / optional.length) * 100)
  const total_pct    = items.length    === 0 ? 100 : Math.round((allComplete  / items.length)    * 100)

  return { required_pct, optional_pct, total_pct }
}

/**
 * Check if setup is sufficient for using Flowra.
 * True when all required items are completed.
 */
export function isSetupSufficient(
  items: Array<{ completed: boolean; required: boolean }>,
): boolean {
  return items.filter(i => i.required).every(i => i.completed)
}

/**
 * Build a next-step prompt in Turkish.
 * Returns "Şimdi yapın: [label]" for the first uncompleted required item.
 * Returns null if all required items are complete.
 */
export function buildNextStepPrompt(
  items: Array<{ label: string; completed: boolean; required: boolean }>,
): string | null {
  const first = items.find(i => i.required && !i.completed)
  if (!first) return null
  return `Şimdi yapın: ${first.label}`
}

// ── DB queries ────────────────────────────────────────────────────────────────

/** Count rows in a table for a given company_id. Returns 0 on error. */
async function countRows(
  supabase:  AnyClient,
  table:     string,
  companyId: string,
  filters?:  Record<string, string | null>,
): Promise<number> {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)

  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      if (val === null) {
        query = query.is(col, null)
      } else {
        query = query.eq(col, val)
      }
    }
  }

  const { count, error } = await query
  if (error) return 0
  return count ?? 0
}

// ── Main service ──────────────────────────────────────────────────────────────

export class SetupChecklistService {
  static async getReport(
    companyId: string,
    supabase:  AnyClient,
  ): Promise<SetupChecklistReport> {

    // ── Fire all queries in parallel ─────────────────────────────────────────
    const [
      companyResult,
      membersResult,
      alertRulesResult,
      partnersResult,
      partnerCapitalResult,
      partnerLoansResult,
      productsResult,
      stockLotsResult,
      salesResult,
      expensesResult,
      budgetsResult,
      kpiTargetsResult,
      taxCalendarResult,
      purchaseOrdersResult,
      reorderThresholdsResult,
      govReportsResult,
      auditAcksResult,
    ] = await Promise.allSettled([
      // company_profile
      supabase
        .from('companies')
        .select('name, logo_url')
        .eq('id', companyId)
        .maybeSingle(),

      // team_member count
      supabase
        .from('company_members')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // alert_rules count
      supabase
        .from('alert_rules')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // partners (active)
      supabase
        .from('partners')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('status', 'active'),

      // partner_capital_commitments
      supabase
        .from('partner_capital_commitments')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // partner_loan_tranches
      supabase
        .from('partner_loan_tranches')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // products (active)
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true),

      // stock_lots
      supabase
        .from('stock_lots')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // sales (not proforma)
      supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .neq('status', 'proforma'),

      // expenses
      supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // monthly_budgets
      supabase
        .from('monthly_budgets')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // kpi_targets
      supabase
        .from('kpi_targets')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // tax_calendar — check upcoming items via tax_obligations or tax_filings
      supabase
        .from('tax_obligations')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // purchase_orders
      supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // product_reorder_thresholds
      supabase
        .from('product_reorder_thresholds')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // governance_reports
      supabase
        .from('governance_reports')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),

      // governance_audit_acknowledgments
      supabase
        .from('governance_audit_acknowledgments')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),
    ])

    // ── Extract values ────────────────────────────────────────────────────────

    // Company profile
    const companyData = companyResult.status === 'fulfilled'
      ? (companyResult.value.data as { name: string | null; logo_url: string | null } | null)
      : null

    const hasCompanyName = !!(companyData?.name)
    const hasLogo        = !!(companyData?.logo_url)
    const companyProfileComplete = hasCompanyName && hasLogo

    const membersCount    = membersResult.status  === 'fulfilled' ? (membersResult.value.count  ?? 0) : 0
    const alertRulesCount = alertRulesResult.status === 'fulfilled' ? (alertRulesResult.value.count ?? 0) : 0
    const partnersCount   = partnersResult.status  === 'fulfilled' ? (partnersResult.value.count  ?? 0) : 0
    const partnerCapCount = partnerCapitalResult.status === 'fulfilled' ? (partnerCapitalResult.value.count ?? 0) : 0
    const partnerLoanCount= partnerLoansResult.status  === 'fulfilled' ? (partnerLoansResult.value.count  ?? 0) : 0
    const productsCount   = productsResult.status  === 'fulfilled' ? (productsResult.value.count  ?? 0) : 0
    const stockCount      = stockLotsResult.status === 'fulfilled' ? (stockLotsResult.value.count ?? 0) : 0
    const salesCount      = salesResult.status     === 'fulfilled' ? (salesResult.value.count     ?? 0) : 0
    const expensesCount   = expensesResult.status  === 'fulfilled' ? (expensesResult.value.count  ?? 0) : 0
    const budgetsCount    = budgetsResult.status   === 'fulfilled' ? (budgetsResult.value.count   ?? 0) : 0
    const kpiCount        = kpiTargetsResult.status === 'fulfilled' ? (kpiTargetsResult.value.count ?? 0) : 0
    const taxCalCount     = taxCalendarResult.status === 'fulfilled' ? (taxCalendarResult.value.count ?? 0) : 0
    const poCount         = purchaseOrdersResult.status === 'fulfilled' ? (purchaseOrdersResult.value.count ?? 0) : 0
    const reorderCount    = reorderThresholdsResult.status === 'fulfilled' ? (reorderThresholdsResult.value.count ?? 0) : 0
    const govReportCount  = govReportsResult.status === 'fulfilled' ? (govReportsResult.value.count ?? 0) : 0
    const auditAckCount   = auditAcksResult.status  === 'fulfilled' ? (auditAcksResult.value.count  ?? 0) : 0

    // ── Build checklist items ─────────────────────────────────────────────────

    const items: ChecklistItem[] = [

      // ── FOUNDATION ──────────────────────────────────────────────────────────
      {
        key:               'company_profile',
        category:          'foundation',
        label:             'Firma Profili',
        description:       'Firma adını ve logosunu ayarlayın.',
        status:            companyProfileComplete ? 'complete' : 'incomplete',
        action_href:       '/dashboard/settings',
        is_required:       true,
        completion_detail: companyProfileComplete
          ? (hasLogo ? 'İsim ve logo ayarlandı' : 'İsim ayarlandı, logo eksik')
          : (!hasCompanyName ? 'Firma adı eksik' : 'Logo eksik'),
      },
      {
        key:               'team_member',
        category:          'foundation',
        label:             'Ekip Üyesi',
        description:       'En az 2 ekip üyesi ekleyin.',
        status:            membersCount >= 2 ? 'complete' : 'incomplete',
        action_href:       '/dashboard/admin/users',
        is_required:       false,
        completion_detail: membersCount > 0 ? `${membersCount} üye kayıtlı` : null,
      },
      {
        key:               'alert_thresholds',
        category:          'foundation',
        label:             'Uyarı Eşikleri',
        description:       'Uyarı kurallarını yapılandırın.',
        status:            alertRulesCount > 0 ? 'complete' : 'incomplete',
        action_href:       '/dashboard/settings',
        is_required:       false,
        completion_detail: alertRulesCount > 0 ? `${alertRulesCount} kural aktif` : null,
      },

      // ── PARTNERS ────────────────────────────────────────────────────────────
      {
        key:               'partners_added',
        category:          'partners',
        label:             'Ortaklar Eklendi',
        description:       'En az bir aktif ortak ekleyin.',
        status:            partnersCount > 0 ? 'complete' : 'incomplete',
        action_href:       '/dashboard/partners',
        is_required:       true,
        completion_detail: partnersCount > 0 ? `${partnersCount} aktif ortak` : null,
      },
      {
        key:               'partner_capital',
        category:          'partners',
        label:             'Ortak Sermayesi',
        description:       'Ortak sermaye taahhütlerini tanımlayın.',
        status:            partnerCapCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/partners',
        is_required:       false,
        completion_detail: partnerCapCount > 0 ? `${partnerCapCount} taahhüt kayıtlı` : null,
      },
      {
        key:               'partner_loans',
        category:          'partners',
        label:             'Ortak Kredileri',
        description:       'Ortak kredi dilimlerini kaydedin.',
        status:            partnerLoanCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/partners',
        is_required:       false,
        completion_detail: partnerLoanCount > 0 ? `${partnerLoanCount} kredi dilimi` : null,
      },

      // ── PRODUCTS ────────────────────────────────────────────────────────────
      {
        key:               'products_added',
        category:          'products',
        label:             'Ürünler Eklendi',
        description:       'En az bir aktif ürün ekleyin.',
        status:            productsCount > 0 ? 'complete' : 'incomplete',
        action_href:       '/dashboard/products',
        is_required:       true,
        completion_detail: productsCount > 0 ? `${productsCount} aktif ürün` : null,
      },
      {
        key:               'stock_initial',
        category:          'products',
        label:             'Başlangıç Stoku',
        description:       'Stok lotlarını tanımlayın.',
        status:            stockCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/operations?tab=stock',
        is_required:       false,
        completion_detail: stockCount > 0 ? `${stockCount} stok lotu` : null,
      },

      // ── FINANCE ─────────────────────────────────────────────────────────────
      {
        key:               'first_sale',
        category:          'finance',
        label:             'İlk Satış',
        description:       'İlk satışı kaydedin (proforma değil).',
        status:            salesCount > 0 ? 'complete' : 'incomplete',
        action_href:       '/dashboard/sales',
        is_required:       true,
        completion_detail: salesCount > 0 ? `${salesCount} satış kayıtlı` : null,
      },
      {
        key:               'first_expense',
        category:          'finance',
        label:             'İlk Gider',
        description:       'İlk gideri kaydedin.',
        status:            expensesCount > 0 ? 'complete' : 'incomplete',
        action_href:       '/dashboard/finance',
        is_required:       true,
        completion_detail: expensesCount > 0 ? `${expensesCount} gider kayıtlı` : null,
      },
      {
        key:               'budget_set',
        category:          'finance',
        label:             'Bütçe Hedefleri',
        description:       'Aylık bütçeleri belirleyin.',
        status:            budgetsCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/planning?tab=budget',
        is_required:       false,
        completion_detail: budgetsCount > 0 ? `${budgetsCount} bütçe dönemi` : null,
      },
      {
        key:               'kpi_targets_set',
        category:          'finance',
        label:             'KPI Hedefleri',
        description:       'KPI hedeflerini tanımlayın.',
        status:            kpiCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/settings',
        is_required:       false,
        completion_detail: kpiCount > 0 ? `${kpiCount} KPI hedefi` : null,
      },
      {
        key:               'tax_calendar_reviewed',
        category:          'finance',
        label:             'Vergi Takvimi',
        description:       'Vergi yükümlülüklerini gözden geçirin.',
        status:            taxCalCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/finance?tab=tax',
        is_required:       false,
        completion_detail: taxCalCount > 0 ? `${taxCalCount} yükümlülük takipte` : null,
      },

      // ── OPERATIONS ──────────────────────────────────────────────────────────
      {
        key:               'first_purchase_order',
        category:          'operations',
        label:             'İlk Satın Alma Siparişi',
        description:       'İlk satın alma siparişini oluşturun.',
        status:            poCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/operations?tab=orders',
        is_required:       false,
        completion_detail: poCount > 0 ? `${poCount} sipariş kayıtlı` : null,
      },
      {
        key:               'reorder_thresholds',
        category:          'operations',
        label:             'Yeniden Sipariş Eşikleri',
        description:       'Ürün yeniden sipariş eşiklerini ayarlayın.',
        status:            reorderCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/operations?tab=catalog',
        is_required:       false,
        completion_detail: reorderCount > 0 ? `${reorderCount} eşik tanımlı` : null,
      },

      // ── GOVERNANCE ──────────────────────────────────────────────────────────
      {
        key:               'first_governance_report',
        category:          'governance',
        label:             'İlk Yönetim Raporu',
        description:       'İlk yönetim raporunu oluşturun.',
        status:            govReportCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/governance',
        is_required:       false,
        completion_detail: govReportCount > 0 ? `${govReportCount} rapor oluşturuldu` : null,
      },
      {
        key:               'audit_acknowledgments',
        category:          'governance',
        label:             'Denetim Onayları',
        description:       'Denetim bulgularını onaylayın.',
        status:            auditAckCount > 0 ? 'optional_complete' : 'optional_incomplete',
        action_href:       '/dashboard/admin/audit',
        is_required:       false,
        completion_detail: auditAckCount > 0 ? `${auditAckCount} onay kayıtlı` : null,
      },
    ]

    // ── Compute summary stats ─────────────────────────────────────────────────

    const requiredItems   = items.filter(i => i.is_required)
    const optionalItems   = items.filter(i => !i.is_required)

    const requiredComplete = requiredItems.filter(
      i => i.status === 'complete',
    ).length

    const optionalComplete = optionalItems.filter(
      i => i.status === 'optional_complete',
    ).length

    const requiredTotal = requiredItems.length
    const optionalTotal = optionalItems.length

    const completion_pct  = computeCompletionPct(requiredComplete, requiredTotal)
    const overall_status  = assignOverallStatus(completion_pct, requiredTotal)
    const missing_required = items.filter(
      i => i.is_required && i.status === 'incomplete',
    )
    const next_action = findNextAction(items)

    return {
      items,
      required_complete: requiredComplete,
      required_total:    requiredTotal,
      optional_complete: optionalComplete,
      optional_total:    optionalTotal,
      completion_pct,
      overall_status,
      missing_required,
      next_action,
    }
  }
}
