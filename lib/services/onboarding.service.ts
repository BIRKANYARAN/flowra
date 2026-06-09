// ─────────────────────────────────────────────────────────────────────────────
// lib/services/onboarding.service.ts
//
// First-run onboarding status. Reports, for a given company, which essential
// setup steps are done — so the cockpit can show a "getting started" checklist
// instead of an empty all-zeros dashboard.
//
// Every step is a cheap COUNT (head:true) scoped to the company; the whole status
// is a handful of small reads. No mutation, read-only.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

export interface OnboardingStep {
  key:         string
  label:       string
  description: string
  href:        string
  done:        boolean
}

export interface OnboardingStatus {
  steps:           OnboardingStep[]
  completed_count: number
  total_count:     number
  all_done:        boolean
  /** True when the company has no operational data at all (brand-new). */
  is_empty:        boolean
}

async function countRows(
  supabase: AnyClient,
  table: string,
  companyId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (error) {
    // A failed count must not silently mark a step "done" — treat as not-done (0).
    console.error(`[onboarding] count(${table}) failed:`, error.message)
    return 0
  }
  return count ?? 0
}

export class OnboardingService {
  static async getStatus(companyId: string, supabase: AnyClient): Promise<OnboardingStatus> {
    // Company profile completeness + all the per-table counts, in parallel.
    const [
      companyRes,
      partnerCount,
      capitalCount,
      productCount,
      customerCount,
      salesCount,
      expenseCount,
    ] = await Promise.all([
      supabase.from('companies').select('name, tax_number, tax_id, address, phone').eq('id', companyId).maybeSingle(),
      countRows(supabase, 'partners', companyId),
      countRows(supabase, 'partner_capital_commitments', companyId),
      countRows(supabase, 'products', companyId),
      countRows(supabase, 'customers', companyId),
      countRows(supabase, 'sales', companyId),
      countRows(supabase, 'expenses', companyId),
    ])

    const company = (companyRes.data ?? {}) as {
      name?: string | null; tax_number?: string | null; tax_id?: string | null
      address?: string | null; phone?: string | null
    }
    const hasName    = !!(company.name && company.name.trim())
    const hasTaxNo   = !!((company.tax_number && company.tax_number.trim()) || (company.tax_id && company.tax_id.trim()))
    const hasContact = !!((company.address && company.address.trim()) || (company.phone && company.phone.trim()))
    const profileDone = hasName && hasTaxNo && hasContact

    const steps: OnboardingStep[] = [
      {
        key:         'company_profile',
        label:       'Şirket bilgilerini tamamla',
        description: 'Ünvan, vergi numarası ve iletişim bilgileri — fatura ve proformalarda görünür.',
        href:        '/dashboard/settings',
        done:        profileDone,
      },
      {
        key:         'partners_capital',
        label:       'Ortakları ve sermayeyi gir',
        description: 'Ortaklık yapısı ve taahhüt edilen/ödenen sermaye — temettü ve özkaynak hesapları için gerekli.',
        href:        '/dashboard/partners/new',
        done:        partnerCount > 0 && capitalCount > 0,
      },
      {
        key:         'products',
        label:       'Ürün/hizmet kataloğunu oluştur',
        description: 'Sattığınız ürün veya hizmetleri ekleyin — satış ve teklif girişini hızlandırır.',
        href:        '/dashboard/operations?tab=catalog&new=1',
        done:        productCount > 0,
      },
      {
        key:         'customers',
        label:       'İlk müşteriyi ekle',
        description: 'Müşteri kayıtları — satış, tahsilat ve cari takibinin temeli.',
        href:        '/dashboard/commercial?tab=customers&new=1',
        done:        customerCount > 0,
      },
      {
        key:         'first_sale',
        label:       'İlk satışı kaydet',
        description: 'Bir satış/fatura girin — gelir, KDV ve kâr göstergeleri burdan beslenir.',
        href:        '/dashboard/commercial?tab=sales&new=1',
        done:        salesCount > 0,
      },
      {
        key:         'first_expense',
        label:       'İlk gideri kaydet',
        description: 'Bir gider girin — net kâr ve nakit akışı hesapları için gerekli.',
        href:        '/dashboard/operations?tab=expenses&new=1',
        done:        expenseCount > 0,
      },
    ]

    const completed = steps.filter(s => s.done).length
    // "Empty" = no operational rows anywhere (a truly brand-new company).
    const isEmpty =
      partnerCount === 0 && productCount === 0 && customerCount === 0 &&
      salesCount === 0 && expenseCount === 0

    return {
      steps,
      completed_count: completed,
      total_count:     steps.length,
      all_done:        completed === steps.length,
      is_empty:        isEmpty,
    }
  }
}
