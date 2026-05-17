// ── /api/import — restore user data from a JSON backup ───────────────────────
// Validates the JSON, soft-deletes existing data, then re-inserts.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

interface BackupPayload {
  version: string
  data: {
    settings?:      Record<string, unknown> | null
    customers?:     Record<string, unknown>[]
    products?:      Record<string, unknown>[]
    company_banks?: Record<string, unknown>[]
    proformas?:     Record<string, unknown>[]
    expenses?:      Record<string, unknown>[]
  }
}

/** Strip DB-managed fields and force user_id, returning a clean insert payload.
 *  'company_id' is always stripped here — callers inject the resolved companyId
 *  explicitly so stale or missing values in the backup can never pass through. */
function stripRow(
  row:         Record<string, unknown>,
  uid:         string,
  extraOmit:   string[] = []
): Record<string, unknown> {
  const omit = new Set(['id', 'created_at', 'updated_at', 'company_id', ...extraOmit])
  const clean: Record<string, unknown> = { user_id: uid, deleted_at: null }
  for (const [k, v] of Object.entries(row)) {
    if (!omit.has(k)) clean[k] = v
  }
  return clean
}

/** Strip a settings row — also drops user_id from source so we control it. */
function stripSettings(
  row: Record<string, unknown>,
  uid: string
): Record<string, unknown> {
  const omit = new Set(['id', 'created_at', 'updated_at', 'user_id'])
  const clean: Record<string, unknown> = { user_id: uid }
  for (const [k, v] of Object.entries(row)) {
    if (!omit.has(k)) clean[k] = v
  }
  return clean
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    let payload: BackupPayload
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json({ error: 'Geçersiz JSON formatı' }, { status: 400 })
    }

    if (!payload?.version || !payload?.data) {
      return NextResponse.json(
        { error: 'Geçersiz yedek dosyası (version veya data eksik)' },
        { status: 400 }
      )
    }

    const { data } = payload
    const now = new Date().toISOString()

    // ── Soft-delete existing company data ─────────────────────────────────────
    await Promise.all([
      supabase.from('customers').update({ deleted_at: now }).eq('company_id', companyId).is('deleted_at', null),
      supabase.from('products').update({ deleted_at: now }).eq('company_id', companyId).is('deleted_at', null),
      supabase.from('company_banks').update({ deleted_at: now }).eq('company_id', companyId).is('deleted_at', null),
      supabase.from('proformas').update({ deleted_at: now }).eq('company_id', companyId).is('deleted_at', null),
      supabase.from('expenses').update({ deleted_at: now }).eq('company_id', companyId).is('deleted_at', null),
    ])

    // ── Re-insert in dependency order ─────────────────────────────────────────
    // Errors are collected — any failure is returned explicitly.
    // Partial success is NOT silently accepted.
    const importErrors: Record<string, string> = {}

    if (data.settings) {
      const { id, created_at, updated_at, user_id: _uid, company_id: _cid, ...rest } = data.settings
      void id; void created_at; void updated_at; void _uid; void _cid  // explicitly unused
      const s: Record<string, unknown> = { ...rest, user_id: uid, company_id: companyId }
      const { error: upsertErr } = await supabase
        .from('user_settings')
        .upsert(s, { onConflict: 'user_id' })
      if (upsertErr) importErrors['settings'] = upsertErr.message
    }

    if (data.customers?.length) {
      const rows = data.customers.map(r => ({ ...stripRow(r, uid), company_id: companyId }))
      const { error } = await supabase.from('customers').insert(rows)
      if (error) importErrors['customers'] = error.message
    }

    if (data.products?.length) {
      const rows = data.products.map(r => ({ ...stripRow(r, uid), company_id: companyId }))
      const { error } = await supabase.from('products').insert(rows)
      if (error) importErrors['products'] = error.message
    }

    if (data.company_banks?.length) {
      const rows = data.company_banks.map(r => ({ ...stripRow(r, uid, ['is_default']), company_id: companyId }))
      const { error } = await supabase.from('company_banks').insert(rows)
      if (error) importErrors['company_banks'] = error.message
    }

    if (data.expenses?.length) {
      const rows = data.expenses.map(r => ({ ...stripRow(r, uid), company_id: companyId }))
      const { error } = await supabase.from('expenses').insert(rows)
      if (error) importErrors['expenses'] = error.message
    }

    // Proformas: insert headers only (items are complex — skip for import safety)
    if (data.proformas?.length) {
      const rows = data.proformas
        .map(r => stripRow(r, uid, ['proforma_items', 'proforma_no']))
        .map(r => ({ ...r, status: 'draft', company_id: companyId }))
      const { error } = await supabase.from('proformas').insert(rows)
      if (error) importErrors['proformas'] = error.message
    }

    // Return explicit failure if ANY table failed to import
    if (Object.keys(importErrors).length > 0) {
      console.error('[import] partial failure:', importErrors)
      return NextResponse.json(
        {
          error:    'Bazı veriler yüklenemedi — yedek kısmen uygulandı',
          failed:   importErrors,
          imported: false,
        },
        { status: 207 }
      )
    }

    return NextResponse.json({ message: 'Yedek başarıyla yüklendi', imported: true })
  } catch (err) {
    console.error('[import]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'İçeri aktarma başarısız' }, { status: 500 })
  }
}
