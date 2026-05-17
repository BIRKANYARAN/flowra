// ── /api/seed — insert demo data for a fresh account ─────────────────────────
// Guards against re-seeding: checks both customers AND products.
// All values are explicit primitives — no undefined, no null numbers.
//
// SECURITY: Disabled in production unless ENABLE_SEED=true is set explicitly.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-role'
import { resolveApiAuth } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  // Feature flag guard
  if (process.env.ENABLE_SEED !== 'true') {
    return NextResponse.json(
      { error: 'This endpoint is disabled in this environment.', code: 'FORBIDDEN', type: 'SECURITY' },
      { status: 403 }
    )
  }

  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Seed writes data — admin only (belt-and-suspenders; env guard is primary).
    try { await requireAdmin(uid, companyId, supabase) }
    catch { return NextResponse.json({ error: 'Demo veri yükleme için admin yetkisi gerekir', code: 'FORBIDDEN', type: 'SECURITY' }, { status: 403 }) }

    // Guard: check BOTH customers and products — prevents partial re-seed
    // after a reset that only soft-deleted customers but left products.
    const [custCheck, prodCheck] = await Promise.all([
      supabase
        .from('customers')
        .select('id')
        .eq('company_id', companyId)
        .is('deleted_at', null),
      supabase
        .from('products')
        .select('id')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    const custLen = Array.isArray(custCheck.data) ? custCheck.data.length : 0
    const prodLen = Array.isArray(prodCheck.data) ? prodCheck.data.length : 0

    if (custLen > 0 || prodLen > 0) {
      return NextResponse.json({
        message: 'already_seeded',
        seeded: false,
        detail: `customers: ${custLen}, products: ${prodLen}`,
      })
    }

    // ── Customers ─────────────────────────────────────────────────────────────
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .insert([
        {
          user_id:    uid,
          company_id: companyId,
          name:       'ABC Teknoloji A.Ş.',
          email:      'info@abc.com',
          phone:      '+90 212 111 1111',
          tax_number: '1234567890',
          tax_office: 'Kadıköy V.D.',
          address:    'Bağdat Cad. No:1 Kadıköy/İstanbul',
        },
        {
          user_id:    uid,
          company_id: companyId,
          name:       'XYZ Lojistik Ltd.',
          email:      'info@xyz.com',
          phone:      '+90 212 222 2222',
          tax_number: '9876543210',
          tax_office: 'Beşiktaş V.D.',
          address:    'Çırağan Cad. No:2 Beşiktaş/İstanbul',
        },
        {
          user_id:    uid,
          company_id: companyId,
          name:       'Demo Müşteri A',
          email:      'demo@ornek.com',
          phone:      '+90 532 333 3333',
        },
        {
          user_id:    uid,
          company_id: companyId,
          name:       'Örnek Şirket B',
          email:      'ornek@sirket.com',
          phone:      '+90 532 444 4444',
        },
        {
          user_id:    uid,
          company_id: companyId,
          name:       'Test Müşteri C',
          email:      'test@test.com',
          phone:      '+90 532 555 5555',
        },
      ])
      .select('id')

    if (custErr || !customers?.length) {
      console.error('[seed] customers failed:', custErr?.message)
      return NextResponse.json(
        { error: 'Müşteri eklenemedi: ' + (custErr?.message ?? 'bilinmiyor') },
        { status: 500 }
      )
    }

    // ── Company banks ─────────────────────────────────────────────────────────
    const { data: banks, error: bankErr } = await supabase.from('company_banks').insert([
      {
        user_id:     uid,
        company_id:  companyId,
        bank_name:   'Akbank',
        branch_name: 'Merkez Şubesi',
        iban:        'TR320001001234567890123456',
        is_default:  true,
      },
      {
        user_id:     uid,
        company_id:  companyId,
        bank_name:   'İş Bankası',
        branch_name: 'Kadıköy Şubesi',
        iban:        'TR610006400000198765432100',
        is_default:  false,
      },
    ]).select('id')
    if (bankErr) console.error('[seed] banks warning:', bankErr.message)
    const defaultBankId = (Array.isArray(banks) && banks.length > 0) ? banks[0].id : null

    // ── Products ──────────────────────────────────────────────────────────────
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .insert([
        { user_id: uid, company_id: companyId, name: 'Web Geliştirme Hizmeti', unit: 'saat',  unit_cost: 150, cost_currency: 'TRY', stock_qty: 0,   stock_alert_qty: 0 },
        { user_id: uid, company_id: companyId, name: 'Mobil Uygulama Lisansı', unit: 'adet',  unit_cost: 800, cost_currency: 'TRY', stock_qty: 50,  stock_alert_qty: 5 },
        { user_id: uid, company_id: companyId, name: 'Yıllık Destek Paketi',   unit: 'yıl',   unit_cost: 300, cost_currency: 'TRY', stock_qty: 100, stock_alert_qty: 10 },
        { user_id: uid, company_id: companyId, name: 'Sunucu Bakım Hizmeti',   unit: 'ay',    unit_cost: 200, cost_currency: 'TRY', stock_qty: 0,   stock_alert_qty: 0 },
        { user_id: uid, company_id: companyId, name: 'Eğitim Paketi',          unit: 'gün',   unit_cost: 500, cost_currency: 'TRY', stock_qty: 50,  stock_alert_qty: 5 },
        { user_id: uid, company_id: companyId, name: 'API Entegrasyon Modülü', unit: 'adet',  unit_cost: 400, cost_currency: 'TRY', stock_qty: 30,  stock_alert_qty: 5 },
        { user_id: uid, company_id: companyId, name: 'Veri Analitik Raporu',   unit: 'rapor', unit_cost: 250, cost_currency: 'TRY', stock_qty: 50,  stock_alert_qty: 5 },
        { user_id: uid, company_id: companyId, name: 'Bulut Depolama (1 TB)',  unit: 'ay',    unit_cost: 50,  cost_currency: 'TRY', stock_qty: 200, stock_alert_qty: 20 },
        { user_id: uid, company_id: companyId, name: 'SSL Sertifikası',        unit: 'yıl',   unit_cost: 30,  cost_currency: 'TRY', stock_qty: 100, stock_alert_qty: 10 },
        { user_id: uid, company_id: companyId, name: 'Logo Tasarım Paketi',    unit: 'proje', unit_cost: 600, cost_currency: 'TRY', stock_qty: 0,   stock_alert_qty: 0 },
      ])
      .select('id')

    if (prodErr) {
      console.error('[seed] products warning:', prodErr.message)
    }

    // ── Expenses ──────────────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('expenses').insert([
      { user_id: uid, company_id: companyId, amount: 5000, currency: 'TRY', amount_try: 5000, fx_rate: 1, fx_source: 'identity', description: 'Ofis kirası - Ocak',  category: 'rent',      expense_date: today },
      { user_id: uid, company_id: companyId, amount: 2500, currency: 'TRY', amount_try: 2500, fx_rate: 1, fx_source: 'identity', description: 'Elektrik ve internet', category: 'utilities', expense_date: today },
      { user_id: uid, company_id: companyId, amount: 1200, currency: 'TRY', amount_try: 1200, fx_rate: 1, fx_source: 'identity', description: 'Yazılım lisansları',   category: 'software',  expense_date: today },
    ])

    // ── Proformas + items ─────────────────────────────────────────────────────
    // Every proforma_item must have: name(str), price(num>0), quantity(num>0), kdv(num>=0), currency(str)
    // Use deterministic name-based lookup instead of array index to avoid order issues.

    if (!products || products.length === 0 || customers.length === 0) {
      console.error('[seed] skipping proformas: missing products or customers')
    } else {
      // Fetch full product data with names for deterministic matching
      const { data: fullProducts } = await supabase
        .from('products')
        .select('id, name, unit, unit_cost, cost_currency, stock_qty')
        .eq('company_id', companyId)
        .is('deleted_at', null)

      const pm = new Map((fullProducts ?? []).map(p => [p.name, p]))
      const findP = (name: string) => pm.get(name) ?? null

      // Proforma 1: TRY — ABC Teknoloji — 3 items
      // Only uses products with sufficient stock (or services with stock_qty=0 where we set quantity within limits)
      const p1_destek = findP('Yıllık Destek Paketi')
      const p1_bulut  = findP('Bulut Depolama (1 TB)')
      const p1_egitim = findP('Eğitim Paketi')

      const { data: prf1, error: p1Err } = await supabase
        .from('proformas')
        .insert({
          user_id:       uid,
          company_id:    companyId,
          customer_id:   customers[0].id,
          bank_id:       defaultBankId,
          customer_name: 'ABC Teknoloji A.Ş.',
          currency:      'TRY',
          status:        'draft',
          validity_days: 30,
          notes:         'Destek, bulut ve eğitim teklifi.',
          total:         3245,
          fx_try:        1,
          fx_usd:        null,
          fx_eur:        null,
          fx_rate_try:   1,
        })
        .select('id')
        .single()

      if (p1Err) console.error('[seed] prf1:', p1Err.message)

      if (prf1?.id) {
        const items1 = [
          p1_destek && {
            proforma_id: prf1.id,
            product_id:  p1_destek.id,
            name:        'Yıllık Destek Paketi',
            unit:        'yıl',
            unit_cost:   300,
            price:       600,
            quantity:    2,
            kdv:         18,
            currency:    'TRY',
            sort_order:  0,
          },
          p1_bulut && {
            proforma_id: prf1.id,
            product_id:  p1_bulut.id,
            name:        'Bulut Depolama (1 TB)',
            unit:        'ay',
            unit_cost:   50,
            price:       100,
            quantity:    6,
            kdv:         18,
            currency:    'TRY',
            sort_order:  1,
          },
          p1_egitim && {
            proforma_id: prf1.id,
            product_id:  p1_egitim.id,
            name:        'Eğitim Paketi',
            unit:        'gün',
            unit_cost:   500,
            price:       950,
            quantity:    1,
            kdv:         18,
            currency:    'TRY',
            sort_order:  2,
          },
        ].filter(Boolean)

        if (items1.length > 0) {
          const { error: i1Err } = await supabase.from('proforma_items').insert(items1)
          if (i1Err) console.error('[seed] prf1 items:', i1Err.message)
        }
      }

      // Proforma 2: TRY — XYZ Lojistik — 2 items — status: sent
      const p2_mobil  = findP('Mobil Uygulama Lisansı')
      const p2_ssl    = findP('SSL Sertifikası')

      const { data: prf2, error: p2Err } = await supabase
        .from('proformas')
        .insert({
          user_id:       uid,
          company_id:    companyId,
          customer_id:   customers[1].id,
          bank_id:       defaultBankId,
          customer_name: 'XYZ Lojistik Ltd.',
          currency:      'TRY',
          status:        'sent',
          validity_days: 15,
          notes:         'Mobil uygulama lisansı ve SSL sertifikası.',
          total:         9912,
          fx_try:        1,
          fx_usd:        null,
          fx_eur:        null,
          fx_rate_try:   1,
        })
        .select('id')
        .single()

      if (p2Err) console.error('[seed] prf2:', p2Err.message)

      if (prf2?.id) {
        const items2 = [
          p2_mobil && {
            proforma_id: prf2.id,
            product_id:  p2_mobil.id,
            name:        'Mobil Uygulama Lisansı',
            unit:        'adet',
            unit_cost:   800,
            price:       1500,
            quantity:    5,
            kdv:         18,
            currency:    'TRY',
            sort_order:  0,
          },
          p2_ssl && {
            proforma_id: prf2.id,
            product_id:  p2_ssl.id,
            name:        'SSL Sertifikası',
            unit:        'yıl',
            unit_cost:   30,
            price:       90,
            quantity:    10,
            kdv:         18,
            currency:    'TRY',
            sort_order:  1,
          },
        ].filter(Boolean)

        if (items2.length > 0) {
          const { error: i2Err } = await supabase.from('proforma_items').insert(items2)
          if (i2Err) console.error('[seed] prf2 items:', i2Err.message)
        }
      }

      // Proforma 3: USD — Demo Müşteri A — 2 items
      const p3_api = findP('API Entegrasyon Modülü')
      const p3_veri = findP('Veri Analitik Raporu')

      const { data: prf3, error: p3Err } = await supabase
        .from('proformas')
        .insert({
          user_id:       uid,
          company_id:    companyId,
          customer_id:   customers[2].id,
          bank_id:       defaultBankId,
          customer_name: 'Demo Müşteri A',
          currency:      'USD',
          status:        'draft',
          validity_days: 60,
          notes:         'API entegrasyon modülü - USD fiyatlandırma.',
          total:         590,
          fx_try:        1,
          fx_usd:        32.5,
          fx_eur:        null,
          fx_rate_try:   32.5,
        })
        .select('id')
        .single()

      if (p3Err) console.error('[seed] prf3:', p3Err.message)

      if (prf3?.id) {
        const items3 = [
          p3_api && {
            proforma_id: prf3.id,
            product_id:  p3_api.id,
            name:        'API Entegrasyon Modülü',
            unit:        'adet',
            unit_cost:   400,
            price:       500,
            quantity:    1,
            kdv:         0,
            currency:    'USD',
            sort_order:  0,
          },
          p3_veri && {
            proforma_id: prf3.id,
            product_id:  p3_veri.id,
            name:        'Veri Analitik Raporu',
            unit:        'rapor',
            unit_cost:   250,
            price:       90,
            quantity:    1,
            kdv:         0,
            currency:    'USD',
            sort_order:  1,
          },
        ].filter(Boolean)

        if (items3.length > 0) {
          const { error: i3Err } = await supabase.from('proforma_items').insert(items3)
          if (i3Err) console.error('[seed] prf3 items:', i3Err.message)
        }
      }
    }

    console.log('[seed] completed for user', uid)
    return NextResponse.json({ message: 'seeded', seeded: true })

  } catch (err) {
    console.error('[seed]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
