import type { SupabaseClient } from '@supabase/supabase-js'

interface Ctx { supabase: SupabaseClient; uid: string; companyId: string }

export async function seedExpenses({ supabase, uid, companyId }: Ctx) {
  const today = new Date().toISOString().slice(0, 10)
  await supabase.from('expenses').insert([
    { user_id: uid, company_id: companyId, amount: 5000, currency: 'TRY', amount_try: 5000, fx_rate: 1, fx_source: 'identity', description: 'Ofis kirası - Ocak',  category: 'rent',      expense_date: today },
    { user_id: uid, company_id: companyId, amount: 2500, currency: 'TRY', amount_try: 2500, fx_rate: 1, fx_source: 'identity', description: 'Elektrik ve internet', category: 'utilities', expense_date: today },
    { user_id: uid, company_id: companyId, amount: 1200, currency: 'TRY', amount_try: 1200, fx_rate: 1, fx_source: 'identity', description: 'Yazılım lisansları',   category: 'software',  expense_date: today },
  ])
}
