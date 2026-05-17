import type { SupabaseClient } from '@supabase/supabase-js'

interface Ctx { supabase: SupabaseClient; uid: string; companyId: string }

export async function seedBanks({ supabase, uid, companyId }: Ctx) {
  const { data: banks, error: bankErr } = await supabase
    .from('company_banks')
    .insert([
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
    ])
    .select('id')

  if (bankErr) console.error('[seed] banks warning:', bankErr.message)

  const defaultBankId = Array.isArray(banks) && banks.length > 0 ? banks[0].id : null
  return { defaultBankId }
}
