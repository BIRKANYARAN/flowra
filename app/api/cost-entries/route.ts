export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { CURRENCIES_EXTENDED } from '@/types'
import { getOrFetchFxRate } from '@/lib/fx'

const ALLOWED_CURRENCIES = CURRENCIES_EXTENDED as readonly string[]
const ALLOWED_TYPES = ['purchase', 'customs', 'tax', 'shipping', 'other'] as const

// ── GET — list cost entries for a product ────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const productId = new URL(req.url).searchParams.get('product_id')
  if (!productId) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('product_cost_entries')
    .select('*')
    .eq('company_id', companyId)
    .eq('product_id', productId)
    .is('deleted_at', null)
    .order('entry_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST — create or bulk-upsert cost entries ────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  const body = await req.json()
  const productId = body.product_id
  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'product_id is required' }, { status: 422 })
  }

  const entries: Array<{
    entry_type: string
    description: string
    amount: number
    currency: string
    fx_rate: number
    amount_try: number   // frozen TRY snapshot = amount × fx_rate
    entry_date: string
  }> = []

  const rawEntries = Array.isArray(body.entries) ? body.entries : []
  if (rawEntries.length === 0) {
    return NextResponse.json({ error: 'At least one entry is required' }, { status: 422 })
  }

  for (const raw of rawEntries) {
    const rawType = String(raw.entry_type ?? 'purchase').toLowerCase()
    const entryType = (ALLOWED_TYPES as readonly string[]).includes(rawType) ? rawType : 'other'
    const description = String(raw.description ?? '').slice(0, 500)
    const amount = Math.max(0, Number(raw.amount) || 0)
    const rawCurrency = String(raw.currency ?? 'TRY').toUpperCase()
    const currency = ALLOWED_CURRENCIES.includes(rawCurrency) ? rawCurrency : 'TRY'
    const entryDate = (raw.entry_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.entry_date))
      ? raw.entry_date
      : new Date().toISOString().slice(0, 10)

    // Fetch FX rate for this currency
    const fx = await getOrFetchFxRate(currency)
    const fxRate = (isFinite(fx.rate) && fx.rate > 0) ? fx.rate : 1

    entries.push({
      entry_type: entryType,
      description,
      amount,
      currency,
      fx_rate:    fxRate,
      amount_try: Math.round(amount * fxRate * 100) / 100,  // frozen TRY snapshot
      entry_date: entryDate,
    })
  }

  // If replacing existing entries, soft-delete old ones first
  if (body.replace_existing) {
    await supabase
      .from('product_cost_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('product_id', productId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
  }

  const { data, error } = await supabase
    .from('product_cost_entries')
    .insert(entries.map(e => ({
      user_id:    uid,
      company_id: companyId,
      product_id: productId,
      ...e,
    })))
    .select('id, entry_type, description, amount, currency, fx_rate, entry_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [], count: (data ?? []).length })
}

// ── DELETE — soft delete a cost entry ────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const entryId = new URL(req.url).searchParams.get('id')
  if (!entryId) {
    return NextResponse.json({ error: 'id is required' }, { status: 422 })
  }

  const { error } = await supabase
    .from('product_cost_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
