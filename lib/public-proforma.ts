import { safeSystemQuery } from '@/lib/admin-db'
import type { Proforma, ProformaItem } from '@/types'

export interface PublicSettingsRow {
  company_name: string | null
  address: string | null
  phone: string | null
  website: string | null
  tax_number: string | null
  tax_office: string | null
  logo_url: string | null
  mersis_no: string | null
}

export interface PublicBankRow {
  bank_name: string
  branch_name: string | null
  iban: string
}

export interface PublicCustomerRow {
  name: string | null
  address: string | null
  tax_number: string | null
  tax_office: string | null
  email: string | null
  phone: string | null
}

export interface PublicProformaBundle {
  proforma: Proforma
  items: ProformaItem[]
  settings: PublicSettingsRow | null
  banks: PublicBankRow[]
  customer: PublicCustomerRow | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Server-only public-share loader.
 *
 * The database no longer exposes broad anonymous SELECT policies for proformas.
 * This function uses the service role, but always pins reads to one validated
 * proforma id and then scopes related rows by that proforma's company_id.
 */
export async function loadPublicProformaBundle(id: string): Promise<PublicProformaBundle | null> {
  if (!UUID_RE.test(id)) return null

  const { data: proformaRow, error: proformaError } = await safeSystemQuery('proformas')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (proformaError || !proformaRow) return null

  const proforma = proformaRow as Proforma & { company_id?: string | null }
  const companyId = proforma.company_id ?? null

  // Company info (name, address, logo_url, …) lives on the `companies` table —
  // NOT user_settings, which has no such columns. Reading user_settings here made
  // the select 400 → settings null → the company logo never appeared on the
  // public/PDF proforma (the snapshot is the only other source, and it is empty
  // for proformas created before a logo was uploaded). companies.tax_id maps to
  // the snapshot/UI's tax_number.
  const settingsQuery = companyId
    ? safeSystemQuery('companies')
        .select('name, address, phone, website, tax_id, tax_office, logo_url, mersis_no')
        .eq('id', companyId)
    : null

  let banksQuery = safeSystemQuery('company_banks')
    .select('bank_name, branch_name, iban')
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
  banksQuery = companyId
    ? banksQuery.eq('company_id', companyId)
    : banksQuery.eq('user_id', proforma.user_id)

  const customerQuery = proforma.customer_id
    ? (() => {
        let q = safeSystemQuery('customers')
          .select('name, address, tax_number, tax_office, email, phone')
          .eq('id', proforma.customer_id!)
          .is('deleted_at', null)
          .limit(1)
        q = companyId ? q.eq('company_id', companyId) : q.eq('user_id', proforma.user_id)
        return q.maybeSingle()
      })()
    : Promise.resolve({ data: null, error: null })

  const [itemsRes, settingsRes, banksRes, customerRes] = await Promise.all([
    safeSystemQuery('proforma_items')
      .select('*')
      .eq('proforma_id', id)
      .order('sort_order', { ascending: true }),
    settingsQuery ? settingsQuery.maybeSingle() : Promise.resolve({ data: null }),
    banksQuery,
    customerQuery,
  ])

  if (itemsRes.error) return null

  // Map companies row → public settings shape (companies.tax_id → tax_number).
  const c = settingsRes.data as {
    name?: string | null; address?: string | null; phone?: string | null; website?: string | null
    tax_id?: string | null; tax_office?: string | null; logo_url?: string | null; mersis_no?: string | null
  } | null
  const settings: PublicSettingsRow | null = c
    ? {
        company_name: c.name       ?? null,
        address:      c.address    ?? null,
        phone:        c.phone      ?? null,
        website:      c.website    ?? null,
        tax_number:   c.tax_id     ?? null,
        tax_office:   c.tax_office ?? null,
        logo_url:     c.logo_url   ?? null,
        mersis_no:    c.mersis_no  ?? null,
      }
    : null

  return {
    proforma,
    items: (itemsRes.data ?? []) as ProformaItem[],
    settings,
    banks: (banksRes.data ?? []) as PublicBankRow[],
    customer: (customerRes.data as PublicCustomerRow | null) ?? null,
  }
}
