import type { SupabaseClient } from '@supabase/supabase-js'

interface Ctx { supabase: SupabaseClient; uid: string; companyId: string }

export async function seedProducts({ supabase, uid, companyId }: Ctx) {
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .insert([
      { user_id: uid, company_id: companyId, name: 'Web Geliştirme Hizmeti', unit: 'saat',  unit_cost: 150, cost_currency: 'TRY', stock_qty: 0,   stock_alert_qty: 0  },
      { user_id: uid, company_id: companyId, name: 'Mobil Uygulama Lisansı', unit: 'adet',  unit_cost: 800, cost_currency: 'TRY', stock_qty: 50,  stock_alert_qty: 5  },
      { user_id: uid, company_id: companyId, name: 'Yıllık Destek Paketi',   unit: 'yıl',   unit_cost: 300, cost_currency: 'TRY', stock_qty: 100, stock_alert_qty: 10 },
      { user_id: uid, company_id: companyId, name: 'Sunucu Bakım Hizmeti',   unit: 'ay',    unit_cost: 200, cost_currency: 'TRY', stock_qty: 0,   stock_alert_qty: 0  },
      { user_id: uid, company_id: companyId, name: 'Eğitim Paketi',          unit: 'gün',   unit_cost: 500, cost_currency: 'TRY', stock_qty: 50,  stock_alert_qty: 5  },
      { user_id: uid, company_id: companyId, name: 'API Entegrasyon Modülü', unit: 'adet',  unit_cost: 400, cost_currency: 'TRY', stock_qty: 30,  stock_alert_qty: 5  },
      { user_id: uid, company_id: companyId, name: 'Veri Analitik Raporu',   unit: 'rapor', unit_cost: 250, cost_currency: 'TRY', stock_qty: 50,  stock_alert_qty: 5  },
      { user_id: uid, company_id: companyId, name: 'Bulut Depolama (1 TB)',  unit: 'ay',    unit_cost: 50,  cost_currency: 'TRY', stock_qty: 200, stock_alert_qty: 20 },
      { user_id: uid, company_id: companyId, name: 'SSL Sertifikası',        unit: 'yıl',   unit_cost: 30,  cost_currency: 'TRY', stock_qty: 100, stock_alert_qty: 10 },
      { user_id: uid, company_id: companyId, name: 'Logo Tasarım Paketi',    unit: 'proje', unit_cost: 600, cost_currency: 'TRY', stock_qty: 0,   stock_alert_qty: 0  },
    ])
    .select('id')

  if (prodErr) console.error('[seed] products warning:', prodErr.message)

  return { products: products ?? [] }
}
