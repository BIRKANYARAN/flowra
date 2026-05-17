import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

interface Ctx { supabase: SupabaseClient; uid: string; companyId: string }

export async function seedCustomers({ supabase, uid, companyId }: Ctx) {
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
    return { error: NextResponse.json(
      { error: 'Müşteri eklenemedi: ' + (custErr?.message ?? 'bilinmiyor') },
      { status: 500 },
    ) }
  }

  return { customers }
}
