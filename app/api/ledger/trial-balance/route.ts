import { NextRequest, NextResponse } from 'next/server'
import { TrialBalanceService } from '@/lib/services/ledger/trial-balance.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

type ImbalanceSeverity = 'clean' | 'rounding' | 'error'

function computeSeverity(imbalance_try: number): ImbalanceSeverity {
  if (imbalance_try < 0.01)  return 'clean'
  if (imbalance_try < 1.00)  return 'rounding'
  return 'error'
}

function computeRecommendation(severity: ImbalanceSeverity, imbalance_try: number): string | null {
  if (severity === 'clean') return null
  if (severity === 'rounding') {
    return `Mizan ${imbalance_try.toFixed(4)} TL dengesizlik içeriyor — yuvarlama farkı olabilir, journal kayıtlarını kontrol edin.`
  }
  return `KRİTİK: Mizan ${imbalance_try.toFixed(2)} TL dengesizlik içeriyor — muhasebe hatası mevcut. Journal kayıtlarını ve çift taraflı kayıt kurallarını denetleyin.`
}

// GET /api/ledger/trial-balance?period_id=&as_of=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const params   = req.nextUrl.searchParams
    const periodId = params.get('period_id') ?? undefined
    const asOf     = params.get('as_of')     ?? undefined

    const report = await TrialBalanceService.compute(companyId, supabase, { periodId, asOf })

    const imbalance_try      = report.trial_balance.imbalance_try
    const imbalance_alert    = imbalance_try > 0.01
    const imbalance_severity = computeSeverity(imbalance_try)
    const recommendation     = computeRecommendation(imbalance_severity, imbalance_try)

    return NextResponse.json({
      ...report,
      imbalance_alert,
      imbalance_severity,
      recommendation,
    })
  } catch (e) {
    console.error('[ledger/trial-balance] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
