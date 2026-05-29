// ── /api/commercial/pipeline-velocity ────────────────────────────────────────
// GET — Returns pipeline velocity report: conversion rates, deal velocity,
//       pipeline health for Turkish B2B SMEs.
// Access: manager+ only.

export const dynamic   = 'force-dynamic'
export const revalidate = 300  // 5-min cache (pipeline changes frequently)

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { PipelineVelocityService } from '@/lib/services/commercial/pipeline-velocity.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new PipelineVelocityService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[pipeline-velocity]', err)
    return apiError(ctx, 'Pipeline hızı analizi hesaplanamadı', 500)
  }
}
