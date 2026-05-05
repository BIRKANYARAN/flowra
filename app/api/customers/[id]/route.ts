// ── /api/customers/[id] ───────────────────────────────────────────────────────
// GET — customer detail: record + proformas + sales + payment summary
//
// Response shape:
//   {
//     customer: Customer
//     proformas: ProformaSummary[]       (newest first)
//     sales:     SaleSummary[]           (newest first)
//     summary: {
//       proforma_count:   number
//       sale_count:       number
//       total_billed_try: number         // Σ sales.total_try
//       total_paid_try:   number         // Σ sales.total_try where payment_status = 'paid'
//       balance_try:      number         // total_billed_try − total_paid_try
//     }
//   }
//
// Security:
//   • customer lookup: company_id = resolvedCompanyId (no cross-company access)
//   • proformas:       company_id scoped
//   • sales:           customer_id = id AND company_id scoped
//     Using the direct FK (sales.customer_id) avoids the N+1 proforma-IN
//     anti-pattern and guarantees correctness even for future sales that are
//     created directly without a proforma.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user)
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })
    const user = authData.user

    let companyId: string
    try { companyId = await resolveCompanyId(user.id, supabase) }
    catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

    const { id } = params

    // ── 1. Customer record ──────────────────────────────────────────────────
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (custErr) {
      console.error('[customers/[id] GET] customer fetch error:', custErr.message)
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }
    if (!customer) return NextResponse.json({ error: 'Müşteri bulunamadı' }, { status: 404 })

    // ── 2. Proformas for this customer ─────────────────────────────────────
    const { data: proformas, error: proformaErr } = await supabase
      .from('proformas')
      .select('id, proforma_no, status, total, currency, created_at, converted_at, deleted_at')
      .eq('customer_id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (proformaErr) {
      console.error('[customers/[id] GET] proformas fetch error:', proformaErr.message)
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }

    // ── 3. Sales via direct customer_id FK ─────────────────────────────────
    // sales.customer_id is populated by convert_proforma_to_sale from the
    // proforma's customer_id field. Using this direct FK means:
    //   • Single query — no intermediate proforma ID collection
    //   • Correct for future direct sales (no proforma) once that path exists
    //   • company_id scoping provides defence-in-depth on top of RLS
    const { data: saleRows, error: salesErr } = await supabase
      .from('sales')
      .select('id, proforma_id, customer_name, currency, total, total_try, nominal_profit, payment_status, paid_at, shipment_status, created_at')
      .eq('customer_id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (salesErr) {
      console.error('[customers/[id] GET] sales fetch error:', salesErr.message)
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }

    const sales = (saleRows ?? []) as Record<string, unknown>[]

    // ── 4. Payment summary ─────────────────────────────────────────────────
    const totalBilledTry = sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const totalPaidTry   = sales
      .filter(r => r.payment_status === 'paid')
      .reduce((s, r) => s + Number(r.total_try ?? 0), 0)

    const summary = {
      proforma_count:   (proformas ?? []).length,
      sale_count:       sales.length,
      total_billed_try: totalBilledTry,
      total_paid_try:   totalPaidTry,
      balance_try:      totalBilledTry - totalPaidTry,
    }

    return NextResponse.json({
      customer,
      proformas: proformas ?? [],
      sales,
      summary,
    })
  } catch (err) {
    console.error('[customers/[id] GET] unexpected:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
