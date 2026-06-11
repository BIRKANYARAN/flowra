export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { safeSystemQuery } from '@/lib/admin-db'
import { requireAdmin } from '@/lib/require-role'
import { AppError } from '@/types/errors'
import { ValidationError } from '@/lib/validation'

// Legacy endpoint — writes to policy_rates table.
// Phase 6: now accepts optional `currency` param (TRY|USD|EUR). Defaults to 'TRY'
// for full backward compatibility. Settings page writes directly via Supabase client.
//
// Prefer /api/policy-rates for new integrations — it is fully multi-currency and
// supports auto-fetch from TCMB/FED/ECB.

const VALID_CURRENCIES = new Set(['TRY', 'USD', 'EUR'])

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth
    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const annual_rate = Number(body.annual_rate)
    if (!isFinite(annual_rate) || annual_rate < 0 || annual_rate > 1000) {
      return NextResponse.json({ error: 'Geçersiz faiz oranı (0-1000 arası olmalıdır)' }, { status: 422 })
    }

    const rate_date = body.rate_date ?? new Date().toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rate_date)) {
      return NextResponse.json({ error: 'Geçersiz tarih formatı' }, { status: 422 })
    }

    // Phase 6: accept currency param — default 'TRY' for backward compat
    const currency = typeof body.currency === 'string' && VALID_CURRENCIES.has(body.currency)
      ? body.currency
      : 'TRY'

    const source = typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 40)
      : 'manual'

    const { error } = await safeSystemQuery('policy_rates').upsert(
      { currency, rate_date, annual_rate, source },
      { onConflict: 'currency,rate_date' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ currency, rate_date, annual_rate }, { status: 201 })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 422 })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { supabase } = auth

    // Phase 6: accept ?currency=TRY|USD|EUR — defaults to TRY for backward compat
    const { searchParams } = new URL(req.url)
    const currency = VALID_CURRENCIES.has(searchParams.get('currency') ?? '')
      ? searchParams.get('currency')!
      : 'TRY'

    const { data } = await supabase
      .from('policy_rates')
      .select('rate_date, annual_rate, source')
      .eq('currency', currency)
      .order('rate_date', { ascending: false })
      .limit(12)

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[interest-rates GET] unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
