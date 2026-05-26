export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { DocumentService }           from '@/lib/services/documents/document.service'
import type { DocumentType }         from '@/lib/services/documents/document.service'

const VALID_TYPES: DocumentType[] = [
  'invoice', 'contract', 'bank_statement', 'board_resolution',
  'tax_declaration', 'proof_of_payment', 'audit_report', 'other',
]

// ── GET — list documents ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const sp = new URL(req.url).searchParams
    const type          = sp.get('type')          as DocumentType | null
    const period_year   = sp.get('period_year')
    const period_month  = sp.get('period_month')
    const resource_type = sp.get('resource_type')
    const resource_id   = sp.get('resource_id')
    const audit_req     = sp.get('audit_required')
    const limit         = Math.min(100, Math.max(1, Number(sp.get('limit')  ?? 50) || 50))
    const offset        = Math.max(0, Number(sp.get('offset') ?? 0) || 0)

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Geçersiz belge türü', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }

    const docs = await DocumentService.list(companyId, supabase, {
      type:          type ?? undefined,
      period:        period_year ? { year: Number(period_year), month: period_month ? Number(period_month) : undefined } : undefined,
      resourceType:  resource_type ?? undefined,
      resourceId:    resource_id   ?? undefined,
      auditRequired: audit_req != null ? audit_req === 'true' : undefined,
      limit,
      offset,
    })

    return NextResponse.json({ documents: docs })
  } catch (e) {
    console.error('[documents GET]', e)
    return apiError(ctx, 'Belgeler alınamadı', 500, 'DB_READ_FAILED')
  }
}

// ── POST — create document record ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body = await req.json() as Record<string, unknown>

    // Validate required fields
    const { document_type, title, file_url, file_name, document_date } = body

    if (!document_type || !VALID_TYPES.includes(document_type as DocumentType)) {
      return NextResponse.json({ error: 'Geçerli document_type zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
    if (!file_url || typeof file_url !== 'string') {
      return NextResponse.json({ error: 'file_url zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
    if (!file_name || typeof file_name !== 'string') {
      return NextResponse.json({ error: 'file_name zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
    if (!document_date || typeof document_date !== 'string') {
      return NextResponse.json({ error: 'document_date zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }

    const doc = await DocumentService.create(companyId, uid, supabase, {
      document_type:        document_type as DocumentType,
      title:                (title as string).trim(),
      description:          typeof body.description === 'string' ? body.description : undefined,
      file_url:             file_url as string,
      file_name:            file_name as string,
      file_size_bytes:      typeof body.file_size_bytes === 'number' ? body.file_size_bytes : undefined,
      mime_type:            typeof body.mime_type === 'string' ? body.mime_type : undefined,
      document_date:        document_date as string,
      linked_resource_type: typeof body.linked_resource_type === 'string' ? body.linked_resource_type : undefined,
      linked_resource_id:   typeof body.linked_resource_id === 'string' ? body.linked_resource_id : undefined,
      is_audit_required:    typeof body.is_audit_required === 'boolean' ? body.is_audit_required : undefined,
    })

    return NextResponse.json({ document: doc }, { status: 201 })
  } catch (e) {
    console.error('[documents POST]', e)
    return apiError(ctx, 'Belge kaydedilemedi', 500, 'DB_WRITE_FAILED')
  }
}
