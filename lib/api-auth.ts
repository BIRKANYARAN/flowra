// ─────────────────────────────────────────────────────────────────────────────
// lib/api-auth.ts
//
// Single-call auth + company resolution for API route handlers.
//
// Usage:
//   const auth = await resolveApiAuth(req)
//   if (!auth.ok) return auth.response
//   const { uid, companyId, supabase, ctx } = auth
//
// Replaces ~6 lines of copy-pasted boilerplate in every API route:
//   const supabase = createClient()
//   const { data: authData, error: authError } = await supabase.auth.getUser()
//   if (authError || !authData?.user) { return NextResponse.json({...}, {status:401}) }
//   const uid = authData.user.id
//   const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), uid)
//   let companyId: string; try { companyId = await resolveCompanyId(uid, supabase) } catch { ... }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { contextFromHeader, type RequestContext } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export type ApiAuthSuccess = {
  ok:        true
  uid:       string
  companyId: string
  supabase:  AnySupabase
  ctx:       RequestContext
}

export type ApiAuthFailure = {
  ok:       false
  response: NextResponse
}

export type ApiAuthResult = ApiAuthSuccess | ApiAuthFailure

/**
 * Authenticate the request and resolve the company for the authenticated user.
 *
 * Returns a discriminated union:
 *   { ok: true,  uid, companyId, supabase, ctx }   — proceed with handler
 *   { ok: false, response }                         — return this response immediately
 *
 * @example
 *   const auth = await resolveApiAuth(req)
 *   if (!auth.ok) return auth.response
 *   const { uid, companyId, supabase, ctx } = auth
 */
export async function resolveApiAuth(req: NextRequest): Promise<ApiAuthResult> {
  const supabase = createClient()

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
        { status: 401 },
      ),
    }
  }

  const uid = authData.user.id
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), uid)

  let companyId: string
  try {
    companyId = await resolveCompanyId(uid, supabase)
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' },
        { status: 409, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      ),
    }
  }

  return { ok: true, uid, companyId, supabase, ctx }
}
