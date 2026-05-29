import type { SupabaseClient } from '@supabase/supabase-js'

export type ResolutionType   = 'board' | 'general_meeting' | 'circular'
export type ResolutionStatus = 'draft' | 'approved' | 'rejected' | 'implemented'

export const RESOLUTION_TYPE_LABELS: Record<ResolutionType, string> = {
  board:           'Yönetim Kurulu Kararı',
  general_meeting: 'Genel Kurul Kararı',
  circular:        'Sirkülasyon Kararı',
}

export const RESOLUTION_STATUS_LABELS: Record<ResolutionStatus, string> = {
  draft:       'Taslak',
  approved:    'Onaylandı',
  rejected:    'Reddedildi',
  implemented: 'Uygulandı',
}

export interface VotingOutcome {
  in_favor:  number
  against:   number
  abstained: number
  total:     number
}

export interface GovernanceResolution {
  id:                         string
  company_id:                 string
  resolution_number:          string
  title:                      string
  resolution_type:            ResolutionType
  status:                     ResolutionStatus
  resolution_date:            string
  description:                string
  voting_outcome:             VotingOutcome | null
  proposed_by:                string | null
  approved_by:                string | null
  approved_at:                string | null
  implemented_at:             string | null
  linked_corporate_action_id: string | null
  metadata:                   Record<string, unknown>
  created_by:                 string
  created_at:                 string
  updated_at:                 string
}

export interface CreateResolutionParams {
  companyId:       string
  userId:          string
  title:           string
  resolutionType:  ResolutionType
  resolutionDate:  string
  description:     string
  votingOutcome?:  VotingOutcome
  linkedCorporateActionId?: string
  metadata?:       Record<string, unknown>
}

export class ResolutionsService {
  static async list(
    companyId: string,
    supabase:  SupabaseClient,
    opts: { status?: ResolutionStatus; limit?: number } = {},
  ): Promise<GovernanceResolution[]> {
    let q = supabase
      .from('governance_resolutions')
      .select('*')
      .eq('company_id', companyId)
      .order('resolution_date', { ascending: false })
      .limit(opts.limit ?? 100)
    if (opts.status) q = q.eq('status', opts.status)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as GovernanceResolution[]
  }

  static async getById(id: string, companyId: string, supabase: SupabaseClient): Promise<GovernanceResolution | null> {
    const { data, error } = await supabase
      .from('governance_resolutions')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()
    if (error) return null
    return data as GovernanceResolution
  }

  static async create(params: CreateResolutionParams, supabase: SupabaseClient): Promise<GovernanceResolution> {
    const { data, error } = await supabase
      .from('governance_resolutions')
      .insert({
        company_id:                  params.companyId,
        resolution_number:           '', // trigger fills this
        title:                       params.title,
        resolution_type:             params.resolutionType,
        status:                      'draft',
        resolution_date:             params.resolutionDate,
        description:                 params.description,
        voting_outcome:              params.votingOutcome ?? null,
        proposed_by:                 params.userId,
        linked_corporate_action_id:  params.linkedCorporateActionId ?? null,
        metadata:                    params.metadata ?? {},
        created_by:                  params.userId,
      })
      .select()
      .single()
    if (error) throw error
    return data as GovernanceResolution
  }

  static async approve(
    id:            string,
    companyId:     string,
    userId:        string,
    votingOutcome: VotingOutcome | undefined,
    supabase:      SupabaseClient,
  ): Promise<GovernanceResolution> {
    const { data, error } = await supabase
      .from('governance_resolutions')
      .update({
        status:         'approved',
        approved_by:    userId,
        approved_at:    new Date().toISOString(),
        voting_outcome: votingOutcome ?? null,
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'draft')   // only drafts can be approved
      .select()
      .single()
    if (error) throw error
    return data as GovernanceResolution
  }

  static async reject(
    id:        string,
    companyId: string,
    userId:    string,
    supabase:  SupabaseClient,
    reason?:   string,
  ): Promise<GovernanceResolution> {
    const updates: Record<string, unknown> = {
      status:      'rejected',
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }
    if (reason) {
      updates.metadata = { rejection_reason: reason, rejected_by: userId }
    }
    const { data, error } = await supabase
      .from('governance_resolutions')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .select()
      .single()
    if (error) throw error
    return data as GovernanceResolution
  }

  static async implement(
    id:        string,
    companyId: string,
    userId:    string,
    linkedCorporateActionId: string | undefined,
    supabase:  SupabaseClient,
    notes?:    string,
  ): Promise<GovernanceResolution> {
    const updates: Record<string, unknown> = {
      status:         'implemented',
      implemented_at: new Date().toISOString(),
    }
    if (linkedCorporateActionId) {
      updates.linked_corporate_action_id = linkedCorporateActionId
    }
    if (notes) {
      updates.metadata = { implementation_notes: notes, implemented_by: userId }
    }
    const { data, error } = await supabase
      .from('governance_resolutions')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'approved')  // only approved resolutions can be implemented
      .select()
      .single()
    if (error) throw error
    return data as GovernanceResolution
  }

  static async linkToAction(
    id:        string,
    actionId:  string,
    companyId: string,
    supabase:  SupabaseClient,
  ): Promise<GovernanceResolution> {
    const { data, error } = await supabase
      .from('governance_resolutions')
      .update({ linked_corporate_action_id: actionId })
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single()
    if (error) throw error
    return data as GovernanceResolution
  }

  // ── Pure helpers ─────────────────────────────────────────────────────────────

  static canApprove(res: Pick<GovernanceResolution, 'status'>): boolean {
    return res.status === 'draft'
  }

  static canImplement(res: Pick<GovernanceResolution, 'status'>): boolean {
    return res.status === 'approved'
  }

  static computeVotingResult(outcome: VotingOutcome): 'passed' | 'failed' | 'tie' {
    if (outcome.in_favor > outcome.against) return 'passed'
    if (outcome.against > outcome.in_favor) return 'failed'
    return 'tie'
  }
}
