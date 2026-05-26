// ─────────────────────────────────────────────────────────────────────────────
// lib/services/documents/document.service.ts
//
// Document Management Layer — metadata + URL storage for financial documents.
// Turkish SMEs must retain financial documents for 10 years (TTK Art. 82).
//
// Actual file bytes live in Supabase Storage.
// This service manages the company_documents metadata table only.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────

export type DocumentType =
  | 'invoice'
  | 'contract'
  | 'bank_statement'
  | 'board_resolution'
  | 'tax_declaration'
  | 'proof_of_payment'
  | 'audit_report'
  | 'other'

export interface CompanyDocument {
  id: string
  company_id: string
  document_type: DocumentType
  title: string
  description: string | null
  file_url: string
  file_name: string
  file_size_bytes: number | null
  mime_type: string | null
  document_date: string
  period_year: number | null
  period_month: number | null
  linked_resource_type: string | null
  linked_resource_id: string | null
  is_audit_required: boolean
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  retention_until: string | null
  uploaded_by: string
  created_at: string
}

export interface DocumentSummary {
  total_documents: number
  total_size_bytes: number
  audit_required_total: number
  audit_required_verified: number
  /** verified / required * 100 — 0 when required = 0 */
  audit_readiness_pct: number
  by_type: Record<DocumentType, number>
  by_period: Record<string, number>  // "YYYY-MM" -> count
  missing_audit_docs: Array<{ document_type: DocumentType; description: string }>
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice:           'Fatura',
  contract:          'Sözleşme',
  bank_statement:    'Banka Ekstresi',
  board_resolution:  'Yönetim Kurulu Kararı',
  tax_declaration:   'Vergi Beyannamesi',
  proof_of_payment:  'Ödeme Makbuzu',
  audit_report:      'Denetim Raporu',
  other:             'Diğer',
}

export const ALL_DOCUMENT_TYPES: DocumentType[] = [
  'invoice', 'contract', 'bank_statement', 'board_resolution',
  'tax_declaration', 'proof_of_payment', 'audit_report', 'other',
]

/** Required document types for audit readiness (TTK compliance) */
export const AUDIT_REQUIRED_TYPES: DocumentType[] = [
  'bank_statement',
  'tax_declaration',
]

/** Missing audit doc descriptions for display */
const AUDIT_DOC_DESCRIPTIONS: Record<DocumentType, string> = {
  bank_statement:    'Dönemsel banka ekstreleri eksik',
  tax_declaration:   'Vergi beyannamesi eksik',
  invoice:           'Fatura eksik',
  contract:          'Sözleşme eksik',
  board_resolution:  'Yönetim kurulu kararı eksik',
  proof_of_payment:  'Ödeme makbuzu eksik',
  audit_report:      'Denetim raporu eksik',
  other:             'Diğer belge eksik',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract year and month from an ISO date string (YYYY-MM-DD) */
function parsePeriod(documentDate: string): { period_year: number; period_month: number } {
  const d = new Date(documentDate)
  return {
    period_year:  d.getUTCFullYear(),
    period_month: d.getUTCMonth() + 1,
  }
}

/** Calculate retention_until: 10 years from document_date */
function retentionUntil(documentDate: string): string {
  const d = new Date(documentDate)
  d.setUTCFullYear(d.getUTCFullYear() + 10)
  return d.toISOString().slice(0, 10)
}

// ── Service ────────────────────────────────────────────────────────────────────

export class DocumentService {
  /**
   * List documents for a company with optional filters.
   */
  static async list(
    companyId: string,
    supabase: SupabaseClient,
    opts?: {
      type?: DocumentType
      period?: { year: number; month?: number }
      resourceType?: string
      resourceId?: string
      auditRequired?: boolean
      limit?: number
      offset?: number
    },
  ): Promise<CompanyDocument[]> {
    let q = supabase
      .from('company_documents')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (opts?.type)                 q = q.eq('document_type', opts.type)
    if (opts?.period?.year)         q = q.eq('period_year',   opts.period.year)
    if (opts?.period?.month)        q = q.eq('period_month',  opts.period.month)
    if (opts?.resourceType)         q = q.eq('linked_resource_type', opts.resourceType)
    if (opts?.resourceId)           q = q.eq('linked_resource_id',   opts.resourceId)
    if (opts?.auditRequired != null) q = q.eq('is_audit_required',  opts.auditRequired)

    const limit  = Math.min(100, opts?.limit  ?? 50)
    const offset = opts?.offset ?? 0

    q = q.order('document_date', { ascending: false })
         .order('created_at',    { ascending: false })
         .range(offset, offset + limit - 1)

    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as CompanyDocument[]
  }

  /**
   * Create a new document record.
   * The file should already be uploaded to Supabase Storage.
   */
  static async create(
    companyId: string,
    userId: string,
    supabase: SupabaseClient,
    params: {
      document_type: DocumentType
      title: string
      description?: string
      file_url: string
      file_name: string
      file_size_bytes?: number
      mime_type?: string
      document_date: string
      linked_resource_type?: string
      linked_resource_id?: string
      is_audit_required?: boolean
    },
  ): Promise<CompanyDocument> {
    const { period_year, period_month } = parsePeriod(params.document_date)

    const isAuditRequired =
      params.is_audit_required ??
      AUDIT_REQUIRED_TYPES.includes(params.document_type)

    const row = {
      company_id:           companyId,
      document_type:        params.document_type,
      title:                params.title,
      description:          params.description ?? null,
      file_url:             params.file_url,
      file_name:            params.file_name,
      file_size_bytes:      params.file_size_bytes ?? null,
      mime_type:            params.mime_type ?? null,
      document_date:        params.document_date,
      period_year,
      period_month,
      linked_resource_type: params.linked_resource_type ?? null,
      linked_resource_id:   params.linked_resource_id ?? null,
      is_audit_required:    isAuditRequired,
      is_verified:          false,
      retention_until:      retentionUntil(params.document_date),
      uploaded_by:          userId,
    }

    const { data, error } = await supabase
      .from('company_documents')
      .insert(row)
      .select()
      .single()

    if (error) throw error
    return data as CompanyDocument
  }

  /**
   * Mark a document as verified (admin only — caller must check role).
   */
  static async verify(
    id: string,
    companyId: string,
    userId: string,
    supabase: SupabaseClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('company_documents')
      .update({
        is_verified: true,
        verified_by: userId,
        verified_at: new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (error) throw error
  }

  /**
   * Soft-delete a document (admin only — caller must check role).
   */
  static async softDelete(
    id: string,
    companyId: string,
    supabase: SupabaseClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('company_documents')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (error) throw error
  }

  /**
   * Get document summary statistics for the company.
   */
  static async getSummary(
    companyId: string,
    supabase: SupabaseClient,
  ): Promise<DocumentSummary> {
    const { data, error } = await supabase
      .from('company_documents')
      .select('document_type, file_size_bytes, is_audit_required, is_verified, period_year, period_month')
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (error) throw error
    const rows = (data ?? []) as Array<{
      document_type: DocumentType
      file_size_bytes: number | null
      is_audit_required: boolean
      is_verified: boolean
      period_year: number | null
      period_month: number | null
    }>

    return DocumentService.computeSummary(rows)
  }

  /**
   * Pure computation — separated so tests can call it without DB.
   */
  static computeSummary(
    rows: Array<{
      document_type: DocumentType
      file_size_bytes: number | null
      is_audit_required: boolean
      is_verified: boolean
      period_year: number | null
      period_month: number | null
    }>,
  ): DocumentSummary {
    const total_documents = rows.length
    const total_size_bytes = rows.reduce((acc, r) => acc + (r.file_size_bytes ?? 0), 0)

    const audit_required = rows.filter(r => r.is_audit_required)
    const audit_required_total    = audit_required.length
    const audit_required_verified = audit_required.filter(r => r.is_verified).length
    const audit_readiness_pct =
      audit_required_total === 0
        ? 0
        : Math.round((audit_required_verified / audit_required_total) * 100)

    // by_type
    const by_type = ALL_DOCUMENT_TYPES.reduce(
      (acc, t) => { acc[t] = 0; return acc },
      {} as Record<DocumentType, number>,
    )
    for (const r of rows) {
      if (by_type[r.document_type] != null) by_type[r.document_type]++
    }

    // by_period — "YYYY-MM" keys
    const by_period: Record<string, number> = {}
    for (const r of rows) {
      if (r.period_year && r.period_month) {
        const key = `${r.period_year}-${String(r.period_month).padStart(2, '0')}`
        by_period[key] = (by_period[key] ?? 0) + 1
      }
    }

    // missing audit docs
    const presentTypes = new Set(rows.map(r => r.document_type))
    const missing_audit_docs = AUDIT_REQUIRED_TYPES
      .filter(t => !presentTypes.has(t))
      .map(document_type => ({
        document_type,
        description: AUDIT_DOC_DESCRIPTIONS[document_type],
      }))

    return {
      total_documents,
      total_size_bytes,
      audit_required_total,
      audit_required_verified,
      audit_readiness_pct,
      by_type,
      by_period,
      missing_audit_docs,
    }
  }

  /**
   * Generate the Supabase Storage path for a new upload.
   * Pattern: {company_id}/documents/{year}/{month}/{uuid}-{filename}
   */
  static getStoragePath(
    companyId: string,
    documentDate: string,
    fileName: string,
  ): string {
    const d     = new Date(documentDate)
    const year  = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const uuid  = crypto.randomUUID()
    return `${companyId}/documents/${year}/${month}/${uuid}-${fileName}`
  }
}
