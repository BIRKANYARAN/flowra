export const dynamic = 'force-dynamic'

import { cache } from 'react'
import { notFound } from 'next/navigation'
import { ProformaInvoice } from '@/components/pdf/ProformaInvoice'
import { loadPublicProformaBundle } from '@/lib/public-proforma'

const getBundle = cache((id: string) => loadPublicProformaBundle(id).catch(() => null))

// ── Safe helpers (inlined to avoid import issues) ───────────────────────────
function sn(v: unknown, fb = 0): number {
  if (v === null || v === undefined) return fb
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}
function ss(v: unknown, fb = ''): string {
  if (typeof v === 'string' && v.length > 0) return v
  return fb
}
/** Coerce unknown snapshot value to string | null */
function sn_str(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  return null
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const bundle  = await getBundle(params?.id)
  const cs      = bundle?.proforma?.company_snapshot as { name?: unknown } | null | undefined
  const company = sn_str(cs?.name) ?? sn_str((bundle?.settings as { company_name?: unknown } | null)?.company_name)
  return {
    title: { absolute: company ? `Proforma — ${company}` : 'Proforma' },
    robots: { index: false, follow: false },
  }
}

export default async function PrintProformaPage({ params }: { params: { id: string } }) {
  const id = params?.id
  if (!id || typeof id !== 'string') return notFound()

  const bundle = await getBundle(id)
  if (!bundle) return notFound()

  const { proforma: p, items, settings, banks, customer } = bundle

  const currency = ss(p.currency, 'TRY')
  const no = ss(p.proforma_no) || ('PRF-' + id.slice(-8).toUpperCase())
  const createdAt = ss(p.created_at) || new Date().toISOString()
  const validityDays = sn(p.validity_days, 30) || 30
  const customerName = ss(p.customer_name, '—')
  const notes = ss(p.notes)

  // Prefer frozen snapshot → fall back to live data for pre-snapshot proformas
  const cs = p.company_snapshot
  const mappedSettings = cs
    ? {
        company_name: sn_str(cs.name),
        address:      sn_str(cs.address),
        phone:        sn_str(cs.phone),
        website:      sn_str(cs.website),
        tax_number:   sn_str(cs.tax_number),
        tax_office:   sn_str(cs.tax_office),
        // Logo: prefer the frozen snapshot, but fall back to the live company logo
        // when the snapshot is empty (proforma created before a logo was uploaded).
        logo_url:     sn_str(cs.logo_url) ?? (settings?.logo_url ?? null),
        mersis_no:    sn_str(cs.mersis_no),
      }
    : settings
      ? {
          company_name: ss(settings.company_name),
          address: ss(settings.address),
          phone: ss(settings.phone),
          website: ss(settings.website),
          tax_number: ss(settings.tax_number),
          tax_office: ss(settings.tax_office),
          logo_url: ss(settings.logo_url),
          mersis_no: ss(settings.mersis_no),
        }
      : null

  const cus = p.customer_snapshot
  const mappedCustomer = cus
    ? {
        name:       sn_str(cus.name),
        address:    sn_str(cus.address),
        tax_number: sn_str(cus.tax_number),
        tax_office: sn_str(cus.tax_office),
        email:      sn_str(cus.email),
        phone:      sn_str(cus.phone),
      }
    : customer
      ? {
          name: ss(customer.name),
          address: ss(customer.address),
          tax_number: ss(customer.tax_number),
          tax_office: ss(customer.tax_office),
          email: ss(customer.email),
          phone: ss(customer.phone),
        }
      : null

  return (
    <div className="print-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4; margin: 10mm; }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-family: -apple-system, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif;
          }
          .no-print, .print\\:hidden { display: none !important; }
          .print-wrapper { padding: 0; }
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: white; }
        .print-wrapper {
          max-width: 210mm;
          margin: 0 auto;
          padding: 8mm;
          background: white;
          font-family: -apple-system, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif;
        }
      `}} />

      <ProformaInvoice
        proforma={{
          id,
          proforma_no: no,
          customer_name: customerName,
          currency,
          validity_days: validityDays,
          notes: notes || null,
          created_at: createdAt,
        }}
        items={items.map(it => ({
          id: ss(it.id),
          name: ss(it.name, '—'),
          unit: ss(it.unit, 'adet'),
          price: sn(it.price),
          quantity: sn(it.quantity, 1) || 1,
          discount_percent: sn(it.discount_percent),
          kdv: sn(it.kdv),
          currency: ss(it.currency, currency),
        }))}
        settings={mappedSettings}
        customer={mappedCustomer}
        banks={banks.map(b => ({
          bank_name: ss(b.bank_name),
          branch_name: ss(b.branch_name),
          iban: ss(b.iban),
        }))}
        showPrintButton
      />
    </div>
  )
}
