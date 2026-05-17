// ── /api/upload/logo ──────────────────────────────────────────────────────────
// GET  — returns a fresh signed URL for the user's current logo path
// POST — uploads a new logo (FormData or raw bytes; magic bytes validated)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { uploadLogo, getLogoPublicUrl, StorageError } from '@/lib/storage'
import { resolveApiAuth } from '@/lib/api-auth'

// ── GET — return the logo's public URL ───────────────────────────────────────
// After migration: logo_url in DB is the full public URL.
// Legacy: logo_url might be a bare storage path — getLogoPublicUrl handles both.
export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // logo_url lives on companies, not user_settings
  const { data: company } = await supabase
    .from('companies')
    .select('logo_url')
    .eq('id', companyId)
    .maybeSingle()

  if (!company?.logo_url) {
    return NextResponse.json({ url: null, signed_url: null, path: null })
  }

  const url = getLogoPublicUrl(company.logo_url)

  // signed_url kept for any client code that still reads the old field name
  return NextResponse.json({ url, signed_url: url, path: company.logo_url })
}

// ── POST — upload new logo ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

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

    const result = await uploadLogo(uid, buffer, mimeType)

    // Persist the permanent public URL on the companies record.
    // logo_url lives on companies (not user_settings — user_settings has no logo_url column).
    const { error: dbErr } = await supabase
      .from('companies')
      .update({ logo_url: result.publicUrl })
      .eq('id', companyId)

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
