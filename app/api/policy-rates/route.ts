export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAndStorePolicyRates,
  getPolicyRate,
  getPolicyRateSeries,
  getCompoundedCarry,
} from '@/lib/services/policy-rate.service'

// ── GET — Get current policy rates or rate series ────────────────────────────
// ?currency=TRY           → latest rate for TRY
// ?currency=TRY&series=1  → last 20 rates for TRY
// ?currency=TRY&date=2025-01-15  → rate on or before that date
// ?currency=TRY&carry_from=2024-06-01&carry_to=2025-06-01 → compounded carry
// (no params)             → latest rate for all 3 currencies

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const currency  = searchParams.get('currency')
  const date      = searchParams.get('date')
  const series    = searchParams.get('series')
  const carryFrom = searchParams.get('carry_from')
  const carryTo   = searchParams.get('carry_to')

  // Compounded carry calculation
  if (currency && carryFrom && carryTo) {
    const carry = await getCompoundedCarry(currency, carryFrom, carryTo)
    return NextResponse.json({
      currency,
      carry_from: carryFrom,
      carry_to: carryTo,
      ...carry,
    })
  }

  // Rate series for a specific currency
  if (currency && series) {
    const rates = await getPolicyRateSeries(currency, 30)
    return NextResponse.json({ currency, rates })
  }

  // Single rate for a specific currency and date
  if (currency && date) {
    const rate = await getPolicyRate(currency, date)
    if (!rate) return NextResponse.json({ error: 'No rate found' }, { status: 404 })
    return NextResponse.json(rate)
  }

  // Single latest rate for a currency
  if (currency) {
    const today = new Date().toISOString().slice(0, 10)
    const rate = await getPolicyRate(currency, today)
    if (!rate) return NextResponse.json({ error: 'No rate found' }, { status: 404 })
    return NextResponse.json(rate)
  }

  // Default: latest rates for all 3 currencies
  const today = new Date().toISOString().slice(0, 10)
  const [tryRate, usdRate, eurRate] = await Promise.all([
    getPolicyRate('TRY', today),
    getPolicyRate('USD', today),
    getPolicyRate('EUR', today),
  ])

  return NextResponse.json({
    TRY: tryRate,
    USD: usdRate,
    EUR: eurRate,
  })
}

// ── POST — Trigger fetch from central banks ──────────────────────────────────
// Requires authentication (only logged-in users can trigger a refresh)

export async function POST(req: NextRequest) {
  // Require CRON_SECRET — this endpoint must NOT be publicly triggerable
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await fetchAndStorePolicyRates()

  return NextResponse.json({
    message: 'Policy rates fetched',
    fetched: {
      TRY: result.try_rate ? `${result.try_rate.annual_rate}% (${result.try_rate.rate_date})` : 'failed',
      USD: result.usd_rate ? `${result.usd_rate.annual_rate}% (${result.usd_rate.rate_date})` : 'failed',
      EUR: result.eur_rate ? `${result.eur_rate.annual_rate}% (${result.eur_rate.rate_date})` : 'failed',
    },
  })
}
