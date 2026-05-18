export const dynamic = 'force-dynamic'

import { ProformaInvoice } from '@/components/pdf/ProformaInvoice'
import { PublicActions } from './PublicActions'
import { loadPublicProformaBundle } from '@/lib/public-proforma'

/** Coerce unknown snapshot value to string | null */
function str(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  return null
}

export default async function PublicProformaPage({ params }: { params: { id: string } }) {
  const { id }   = params
  const bundle = await loadPublicProformaBundle(id).catch(err => {
    console.error('[public proforma] fetch error:', err instanceof Error ? err.message : String(err))
    return null
  })

  if (!bundle) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4 sm:p-8">
        <div className="bg-white rounded-2xl p-10 text-center max-w-sm w-full border border-gray-200">
          <div className="text-4xl mb-3">&#128270;</div>
          <p className="text-gray-600 font-semibold">Proforma bulunamadı</p>
          <p className="text-sm text-gray-400 mt-1">Geçersiz veya silinmiş bir bağlantı.</p>
        </div>
      </main>
    )
  }

  const { proforma, items, settings, banks, customer } = bundle

  const mappedItems = items.map(it => ({
    id: it.id ?? '',
    // DB canonical names first (current schema), legacy aliases as fallback
    name:             String(it.product_name ?? it.name ?? ''),
    unit:             it.unit ?? 'adet',
    price:            Number(it.unit_price   ?? it.price)            || 0,
    quantity:         Number(it.qty          ?? it.quantity)         || 1,
    discount_percent: Number(it.discount_pct ?? it.discount_percent) || 0,
    kdv:              Number(it.kdv_rate     ?? it.kdv)              || 0,
    currency:         it.currency ?? proforma.currency ?? 'TRY',
  }))

  // Prefer frozen snapshot → fall back to live data for pre-snapshot proformas
  const cs = proforma.company_snapshot
  const mappedSettings = cs
    ? {
        company_name: str(cs.name),
        address:      str(cs.address),
        phone:        str(cs.phone),
        website:      str(cs.website),
        tax_number:   str(cs.tax_number),
        tax_office:   str(cs.tax_office),
        logo_url:     str(cs.logo_url),
        mersis_no:    str(cs.mersis_no),
      }
    : settings
      ? {
          company_name: settings.company_name ?? null,
          address: settings.address ?? null,
          phone: settings.phone ?? null,
          website: settings.website ?? null,
          tax_number: settings.tax_number ?? null,
          tax_office: settings.tax_office ?? null,
          logo_url: settings.logo_url ?? null,
          mersis_no: settings.mersis_no ?? null,
        }
      : null

  const cus = proforma.customer_snapshot
  const mappedCustomer = cus
    ? {
        name:       str(cus.name),
        address:    str(cus.address),
        tax_number: str(cus.tax_number),
        tax_office: str(cus.tax_office),
        email:      str(cus.email),
        phone:      str(cus.phone),
      }
    : customer
      ? {
          name: customer.name ?? null,
          address: customer.address ?? null,
          tax_number: customer.tax_number ?? null,
          tax_office: customer.tax_office ?? null,
          email: customer.email ?? null,
          phone: customer.phone ?? null,
        }
      : null

  const mappedBanks = banks.map(b => ({
    bank_name: b.bank_name ?? '',
    branch_name: b.branch_name ?? null,
    iban: b.iban ?? '',
  }))

  return (
    <main className="min-h-screen bg-gray-100 py-6 sm:py-10 px-2 sm:px-4 print:bg-white print:py-0 print:px-0">
      <div className="max-w-3xl mx-auto">
        {/* ── Action bar (hidden on print) ── */}
        <PublicActions
          proformaNo={proforma.proforma_no ?? `PRF-${id.slice(-8).toUpperCase()}`}
          proformaId={id}
          items={mappedItems}
          settings={mappedSettings}
          customer={mappedCustomer}
          banks={mappedBanks}
          currency={proforma.currency ?? 'TRY'}
        />

        <div className="text-center mb-4 print:hidden">
          <span className="text-xs text-gray-400 tracking-wide">Flowra ile oluşturuldu</span>
        </div>

        <div id="proforma-content">
          <ProformaInvoice
            proforma={{
              id: proforma.id,
              proforma_no: proforma.proforma_no ?? null,
              customer_name: proforma.customer_name ?? '',
              currency: proforma.currency ?? 'TRY',
              validity_days: proforma.validity_days ?? 30,
              notes: proforma.notes ?? null,
              created_at: proforma.created_at ?? new Date().toISOString(),
            }}
            items={mappedItems}
            settings={mappedSettings}
            customer={mappedCustomer}
            banks={mappedBanks}
          />
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 print:hidden">
          Bu proforma fatura yalnızca bilgi amaçlıdır ve resmi fatura yerine geçmez.
        </p>
      </div>
    </main>
  )
}
