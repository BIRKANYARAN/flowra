// ── /api/upload/logo ──────────────────────────────────────────────────────────
// GET  — returns a fresh signed URL for the user's current logo path
// POST — uploads a new logo (FormData or raw bytes; magic bytes validated)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader, logger } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { uploadLogo, getLogoPublicUrl, StorageError } from '@/lib/storage'
import { resolveCompanyId } from '@/lib/resolve-company'

// ── GET — return the logo's public URL ───────────────────────────────────────
// After migration: logo_url in DB is the full public URL.
// Legacy: logo_url might be a bare storage path — getLogoPublicUrl handles both.
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })
    const user = authData.user

  let companyId: string
  try { companyId = await resolveCompanyId(user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('logo_url')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!settings?.logo_url) {
    return NextResponse.json({ url: null, signed_url: null, path: null })
  }

  const url = getLogoPublicUrl(settings.logo_url)

  // signed_url kept for any client code that still reads the old field name
  return NextResponse.json({ url, signed_url: url, path: settings.logo_url })
}

// ── POST — upload new logo ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })
    const user = authData.user

  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  try {
    const contentType = req.headers.get('content-type') ?? ''
    let buffer: ArrayBuffer
    let mimeType: string

    if (contentType.startsWith('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file || file.size === 0) {
        return NextResponse.json({ error: 'Dosya boş olamaz' }, { status: 422 })
      }
      buffer   = await file.arrayBuffer()
      mimeType = file.type || 'application/octet-stream'
    } else {
      buffer   = await req.arrayBuffer()
      mimeType = contentType.split(';')[0].trim()
    }

    if (!buffer || buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Dosya boş olamaz' }, { status: 422 })
    }

    const result = await uploadLogo(user.id, buffer, mimeType)

    // Persist the permanent public URL (not the storage path — paths can't be
    // used directly as <img src> or in the PDF loader without re-signing).
    const { error: dbErr } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: user.id, company_id: companyId, logo_url: result.publicUrl },
        { onConflict: 'user_id' }
      )

    if (dbErr) {
      // FIX: was only logging the error and returning 201 — caller saw success
      // but logo_url was never persisted, so the logo disappeared on page reload.
      await logger.error(ctx, 'upload_logo:db_error', { error: dbErr.message })
      return NextResponse.json(
        { error: 'Logo kaydedilemedi', code: 'DB_UPSERT_FAILED', type: 'SYSTEM' },
        { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    await logger.info(ctx, 'upload_logo:success', { path: result.path })

    return NextResponse.json(
      { path: result.path, signed_url: result.publicUrl, url: result.publicUrl },
      { status: 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )

  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 })
    }
    const e = err as Error
    await logger.error(ctx, 'POST /api/upload/logo', { error: e?.message ?? String(err) })
    return NextResponse.json({ error: 'Yükleme hatası' }, { status: 500 })
  }
}
