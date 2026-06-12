import type { SupabaseClient } from '@supabase/supabase-js'

interface Ctx { supabase: SupabaseClient; uid: string; companyId: string }
interface CustomerRef { id: string }
interface ProductRef  { id: string }

interface ProformasSeedCtx extends Ctx {
  customers:     CustomerRef[]
  products:      ProductRef[]
  defaultBankId: string | null
}

export async function seedProformas({ supabase, uid, companyId, customers, defaultBankId }: ProformasSeedCtx) {
  // Fetch full product data for name-based deterministic matching
  const { data: fullProducts } = await supabase
    .from('products')
    .select('id, name, unit, unit_cost, cost_currency, stock_qty')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  const pm    = new Map((fullProducts ?? []).map(p => [p.name, p]))
  const findP = (name: string) => pm.get(name) ?? null

  // ── Proforma 1: TRY — ABC Teknoloji — 3 items ─────────────────────────────
  const p1_destek = findP('Yıllık Destek Paketi')
  const p1_bulut  = findP('Bulut Depolama (1 TB)')
  const p1_egitim = findP('Eğitim Paketi')

  const { data: prf1, error: p1Err } = await supabase
    .from('proformas')
    .insert({
      user_id: uid, company_id: companyId,
      customer_id:   customers[0].id,
      bank_id:       defaultBankId,
      customer_name: 'ABC Teknoloji A.Ş.',
      currency:      'TRY', status: 'accepted', validity_days: 30,
      notes:         'Destek, bulut ve eğitim teklifi.',
      total: 3245, fx_try: 1, fx_usd: null, fx_eur: null, fx_rate_try: 1,
    })
    .select('id').single()

  if (p1Err) console.error('[seed] prf1:', p1Err.message)
  if (prf1?.id) {
    const items1 = [
      p1_destek && { proforma_id: prf1.id, product_id: p1_destek.id, name: 'Yıllık Destek Paketi', unit: 'yıl',  unit_cost: 300, price: 600,  quantity: 2, kdv: 18, currency: 'TRY', sort_order: 0 },
      p1_bulut  && { proforma_id: prf1.id, product_id: p1_bulut.id,  name: 'Bulut Depolama (1 TB)', unit: 'ay',   unit_cost: 50,  price: 100,  quantity: 6, kdv: 18, currency: 'TRY', sort_order: 1 },
      p1_egitim && { proforma_id: prf1.id, product_id: p1_egitim.id, name: 'Eğitim Paketi',         unit: 'gün',  unit_cost: 500, price: 950,  quantity: 1, kdv: 18, currency: 'TRY', sort_order: 2 },
    ].filter(Boolean)
    if (items1.length > 0) {
      const { error: i1Err } = await supabase.from('proforma_items').insert(items1)
      if (i1Err) console.error('[seed] prf1 items:', i1Err.message)
    }
  }

  // ── Proforma 2: TRY — XYZ Lojistik — 2 items — status: sent ──────────────
  const p2_mobil = findP('Mobil Uygulama Lisansı')
  const p2_ssl   = findP('SSL Sertifikası')

  const { data: prf2, error: p2Err } = await supabase
    .from('proformas')
    .insert({
      user_id: uid, company_id: companyId,
      customer_id:   customers[1].id,
      bank_id:       defaultBankId,
      customer_name: 'XYZ Lojistik Ltd.',
      currency:      'TRY', status: 'sent', validity_days: 15,
      notes:         'Mobil uygulama lisansı ve SSL sertifikası.',
      total: 9912, fx_try: 1, fx_usd: null, fx_eur: null, fx_rate_try: 1,
    })
    .select('id').single()

  if (p2Err) console.error('[seed] prf2:', p2Err.message)
  if (prf2?.id) {
    const items2 = [
      p2_mobil && { proforma_id: prf2.id, product_id: p2_mobil.id, name: 'Mobil Uygulama Lisansı', unit: 'adet', unit_cost: 800, price: 1500, quantity: 5,  kdv: 18, currency: 'TRY', sort_order: 0 },
      p2_ssl   && { proforma_id: prf2.id, product_id: p2_ssl.id,   name: 'SSL Sertifikası',        unit: 'yıl',  unit_cost: 30,  price: 90,   quantity: 10, kdv: 18, currency: 'TRY', sort_order: 1 },
    ].filter(Boolean)
    if (items2.length > 0) {
      const { error: i2Err } = await supabase.from('proforma_items').insert(items2)
      if (i2Err) console.error('[seed] prf2 items:', i2Err.message)
    }
  }

  // ── Proforma 3: USD — Demo Müşteri A — 2 items ────────────────────────────
  const p3_api  = findP('API Entegrasyon Modülü')
  const p3_veri = findP('Veri Analitik Raporu')

  const { data: prf3, error: p3Err } = await supabase
    .from('proformas')
    .insert({
      user_id: uid, company_id: companyId,
      customer_id:   customers[2].id,
      bank_id:       defaultBankId,
      customer_name: 'Demo Müşteri A',
      currency:      'USD', status: 'converted', validity_days: 60,
      notes:         'API entegrasyon modülü - USD fiyatlandırma.',
      total: 590, fx_try: 1, fx_usd: 32.5, fx_eur: null, fx_rate_try: 32.5,
    })
    .select('id').single()

  if (p3Err) console.error('[seed] prf3:', p3Err.message)
  if (prf3?.id) {
    const items3 = [
      p3_api  && { proforma_id: prf3.id, product_id: p3_api.id,  name: 'API Entegrasyon Modülü', unit: 'adet',  unit_cost: 400, price: 500, quantity: 1, kdv: 0, currency: 'USD', sort_order: 0 },
      p3_veri && { proforma_id: prf3.id, product_id: p3_veri.id, name: 'Veri Analitik Raporu',   unit: 'rapor', unit_cost: 250, price: 90,  quantity: 1, kdv: 0, currency: 'USD', sort_order: 1 },
    ].filter(Boolean)
    if (items3.length > 0) {
      const { error: i3Err } = await supabase.from('proforma_items').insert(items3)
      if (i3Err) console.error('[seed] prf3 items:', i3Err.message)
    }
  }
}
