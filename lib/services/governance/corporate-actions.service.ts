import type { SupabaseClient } from '@supabase/supabase-js'

export const CORPORATE_ACTION_TYPES = [
  'CAPITAL_INCREASE','CAPITAL_CALL','CAPITAL_DECREASE',
  'DIVIDEND_DECLARATION','DIVIDEND_PAYMENT',
  'PARTNER_ADMISSION','PARTNER_EXIT','EQUITY_RATIO_CHANGE',
  'BOARD_APPOINTMENT','BOARD_REMOVAL','AUDITOR_APPOINTMENT',
  'ANNUAL_ACCOUNTS_APPROVAL','BUDGET_APPROVAL',
  'SIGNIFICANT_ASSET_PURCHASE','SIGNIFICANT_ASSET_DISPOSAL',
  'PARTNER_LOAN_AUTHORIZATION','COMPENSATION_AUTHORIZATION',
  'PARTNERSHIP_AGREEMENT_AMENDMENT','COMPANY_RESTRUCTURE','OTHER',
] as const

export type CorporateActionType = typeof CORPORATE_ACTION_TYPES[number]

export const CORPORATE_ACTION_TYPE_LABELS: Record<CorporateActionType, string> = {
  CAPITAL_INCREASE:              'Sermaye Artırımı',
  CAPITAL_CALL:                  'Sermaye Çağrısı',
  CAPITAL_DECREASE:              'Sermaye Azaltımı',
  DIVIDEND_DECLARATION:          'Temettü Kararı',
  DIVIDEND_PAYMENT:              'Temettü Ödemesi',
  PARTNER_ADMISSION:             'Ortak Kabulü',
  PARTNER_EXIT:                  'Ortak Çıkışı',
  EQUITY_RATIO_CHANGE:           'Hisse Oranı Değişikliği',
  BOARD_APPOINTMENT:             'Yönetici Atanması',
  BOARD_REMOVAL:                 'Yönetici Görevden Alınması',
  AUDITOR_APPOINTMENT:           'Denetçi Atanması',
  ANNUAL_ACCOUNTS_APPROVAL:      'Yıllık Hesapların Onayı',
  BUDGET_APPROVAL:               'Bütçe Onayı',
  SIGNIFICANT_ASSET_PURCHASE:    'Önemli Varlık Alımı',
  SIGNIFICANT_ASSET_DISPOSAL:    'Önemli Varlık Satışı',
  PARTNER_LOAN_AUTHORIZATION:    'Ortak Borcu Yetkilendirmesi',
  COMPENSATION_AUTHORIZATION:    'Huzur Hakkı Yetkilendirmesi',
  PARTNERSHIP_AGREEMENT_AMENDMENT: 'Ortaklık Sözleşmesi Değişikliği',
  COMPANY_RESTRUCTURE:           'Şirket Yeniden Yapılanması',
  OTHER:                         'Diğer',
}

// Keep backward-compatible alias
export const ACTION_TYPE_LABELS: Record<CorporateActionType, string> = {
  CAPITAL_INCREASE:              'Sermaye Artırımı',
  CAPITAL_CALL:                  'Sermaye Çağrısı',
  CAPITAL_DECREASE:              'Sermaye Azaltımı',
  DIVIDEND_DECLARATION:          'Temettü Kararı',
  DIVIDEND_PAYMENT:              'Temettü Ödemesi',
  PARTNER_ADMISSION:             'Ortak Kabulü',
  PARTNER_EXIT:                  'Ortak Çıkışı',
  EQUITY_RATIO_CHANGE:           'Hisse Oranı Değişikliği',
  BOARD_APPOINTMENT:             'Yönetici Atanması',
  BOARD_REMOVAL:                 'Yönetici Görevden Alınması',
  AUDITOR_APPOINTMENT:           'Denetçi Atanması',
  ANNUAL_ACCOUNTS_APPROVAL:      'Yıllık Hesapların Onayı',
  BUDGET_APPROVAL:               'Bütçe Onayı',
  SIGNIFICANT_ASSET_PURCHASE:    'Önemli Varlık Alımı',
  SIGNIFICANT_ASSET_DISPOSAL:    'Önemli Varlık Satışı',
  PARTNER_LOAN_AUTHORIZATION:    'Ortak Borcu Yetkilendirmesi',
  COMPENSATION_AUTHORIZATION:    'Huzur Hakkı Yetkilendirmesi',
  PARTNERSHIP_AGREEMENT_AMENDMENT: 'Ortaklık Sözleşmesi Değişikliği',
  COMPANY_RESTRUCTURE:           'Şirket Yeniden Yapılanması',
  OTHER:                         'Diğer',
}

export interface CorporateAction {
  id:                   string
  company_id:           string
  action_type:          CorporateActionType
  action_date:          string
  title:                string
  description:          string | null
  authorized_by:        string
  resolution_reference: string | null
  linked_event_type:    string | null
  linked_event_id:      string | null
  financial_amount:     number | null
  financial_currency:   string
  metadata:             Record<string, unknown>
  created_by:           string
  created_at:           string
}

export interface CreateCorporateActionParams {
  companyId:           string
  userId:              string
  actionType:          CorporateActionType
  actionDate:          string
  title:               string
  description?:        string
  authorizedBy:        string
  resolutionReference?: string
  linkedEventType?:    string
  linkedEventId?:      string
  financialAmount?:    number
  financialCurrency?:  string
  metadata?:           Record<string, unknown>
}

export class CorporateActionsService {
  static async list(
    companyId: string,
    supabase: SupabaseClient,
    opts: { limit?: number; actionType?: CorporateActionType; from?: string; to?: string } = {},
  ): Promise<CorporateAction[]> {
    let q = supabase
      .from('corporate_actions')
      .select('*')
      .eq('company_id', companyId)
      .order('action_date', { ascending: false })
      .limit(opts.limit ?? 100)

    if (opts.actionType) q = q.eq('action_type', opts.actionType)
    if (opts.from)       q = q.gte('action_date', opts.from)
    if (opts.to)         q = q.lte('action_date', opts.to)

    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as CorporateAction[]
  }

  static async getById(id: string, companyId: string, supabase: SupabaseClient): Promise<CorporateAction | null> {
    const { data, error } = await supabase
      .from('corporate_actions')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()
    if (error) return null
    return data as CorporateAction
  }

  static async create(params: CreateCorporateActionParams, supabase: SupabaseClient): Promise<CorporateAction> {
    const { data, error } = await supabase
      .from('corporate_actions')
      .insert({
        company_id:           params.companyId,
        action_type:          params.actionType,
        action_date:          params.actionDate,
        title:                params.title,
        description:          params.description ?? null,
        authorized_by:        params.authorizedBy,
        resolution_reference: params.resolutionReference ?? null,
        linked_event_type:    params.linkedEventType ?? null,
        linked_event_id:      params.linkedEventId ?? null,
        financial_amount:     params.financialAmount ?? null,
        financial_currency:   params.financialCurrency ?? 'TRY',
        metadata:             params.metadata ?? {},
        created_by:           params.userId,
      })
      .select()
      .single()
    if (error) throw error
    return data as CorporateAction
  }

  /** Returns count of actions for a given type (for dashboard stats) */
  static async countByType(companyId: string, supabase: SupabaseClient): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('corporate_actions')
      .select('action_type')
      .eq('company_id', companyId)
    if (error) return {}
    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      counts[row.action_type] = (counts[row.action_type] ?? 0) + 1
    }
    return counts
  }

  /** Returns count and total_amount grouped by action_type */
  static async getSummaryByType(
    companyId: string,
    supabase: SupabaseClient,
  ): Promise<Array<{ action_type: CorporateActionType; count: number; total_amount: number }>> {
    const { data, error } = await supabase
      .from('corporate_actions')
      .select('action_type, financial_amount')
      .eq('company_id', companyId)
    if (error) return []
    const map = new Map<CorporateActionType, { count: number; total_amount: number }>()
    for (const row of data ?? []) {
      const existing = map.get(row.action_type as CorporateActionType) ?? { count: 0, total_amount: 0 }
      map.set(row.action_type as CorporateActionType, {
        count:        existing.count + 1,
        total_amount: existing.total_amount + (Number(row.financial_amount) || 0),
      })
    }
    return Array.from(map.entries()).map(([action_type, stats]) => ({ action_type, ...stats }))
  }

  /** Sets the resolution_reference on a committed action */
  static async linkToResolution(
    id: string,
    resolutionId: string,
    companyId: string,
    supabase: SupabaseClient,
  ): Promise<CorporateAction | null> {
    const { data, error } = await supabase
      .from('corporate_actions')
      .update({ resolution_reference: resolutionId })
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single()
    if (error) return null
    return data as CorporateAction
  }

  /** Fetch all actions linked to a specific resolution reference */
  static async getByResolutionReference(
    resolutionReference: string,
    companyId: string,
    supabase: SupabaseClient,
  ): Promise<CorporateAction[]> {
    const { data, error } = await supabase
      .from('corporate_actions')
      .select('*')
      .eq('company_id', companyId)
      .eq('resolution_reference', resolutionReference)
      .order('action_date', { ascending: false })
    if (error) return []
    return (data ?? []) as CorporateAction[]
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────────

export type FinancialImpactLevel = 'major' | 'significant' | 'moderate' | 'minor'

/**
 * Classify a financial amount into an impact level.
 * major        > 500,000
 * significant  > 100,000
 * moderate     > 10,000
 * minor        ≤ 10,000 (including 0 / null)
 */
export function classifyFinancialImpact(amount: number | null | undefined): FinancialImpactLevel {
  const n = Number(amount) || 0
  if (n > 500_000) return 'major'
  if (n > 100_000) return 'significant'
  if (n > 10_000)  return 'moderate'
  return 'minor'
}

/**
 * Return the Turkish label for a corporate action type.
 * Falls back to the raw type string if not found.
 */
export function formatActionType(type: string): string {
  return CORPORATE_ACTION_TYPE_LABELS[type as CorporateActionType] ?? type
}
