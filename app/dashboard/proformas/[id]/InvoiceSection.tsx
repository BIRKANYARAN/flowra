'use client'

/**
 * InvoiceSection — client-only wrapper for ProformaInvoice.
 *
 * WHY: ProformaInvoice is a 'use client' component that runs calculateLine /
 * calculateTotals at render time. In the production bundle a function reference
 * inside that call chain resolves to `undefined` during SSR for proformas that
 * have company_snapshot set (TypeError: (0, i.pJ) is not a function), causing
 * the dashboard error boundary to catch the error and show an error page instead
 * of the proforma detail.
 *
 * FIX: `ssr: false` prevents React from evaluating ProformaInvoice on the
 * server at all. The invoice card renders only after client hydration (instant
 * on fast connections, a brief skeleton on slow ones).
 *
 * next/dynamic with ssr: false is only valid inside a 'use client' module,
 * hence this wrapper — page.tsx (server component) cannot use it directly.
 */

import dynamic from 'next/dynamic'

// ── Prop types (must stay in sync with ProformaInvoiceProps in ProformaInvoice.tsx) ──
interface InvoiceItem {
  id: string
  name: string
  unit: string
  price: number
  quantity: number
  discount_percent: number
  kdv: number
  currency: string
}

interface InvoiceSettings {
  company_name: string | null
  address: string | null
  phone: string | null
  website: string | null
  tax_number: string | null
  tax_office: string | null
  logo_url: string | null
  mersis_no: string | null
}

interface InvoiceCustomer {
  name: string | null
  address: string | null
  tax_number: string | null
  tax_office: string | null
  email: string | null
  phone: string | null
}

interface InvoiceBank {
  bank_name: string
  branch_name: string | null
  iban: string
}

interface InvoiceProforma {
  id: string
  proforma_no: string | null
  customer_name: string
  currency: string
  validity_days: number
  notes: string | null
  created_at: string
}

interface InvoiceSectionProps {
  proforma: InvoiceProforma
  items: InvoiceItem[]
  settings: InvoiceSettings | null
  customer: InvoiceCustomer | null
  banks: InvoiceBank[]
}

// ── Dynamically imported with ssr: false — never evaluated on the server ──────
const ProformaInvoiceNoSSR = dynamic(
  () => import('@/components/pdf/ProformaInvoice').then(m => ({ default: m.ProformaInvoice })),
  {
    ssr: false,
    loading: () => (
      <div className="bg-white rounded border border-[#e2e8f0] overflow-hidden">
        <div className="bg-[#0f172a] h-16 animate-pulse" />
        <div className="p-8 space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded animate-pulse w-3/4" />
          <div className="h-4 bg-[#f1f5f9] rounded animate-pulse w-1/2" />
          <div className="h-4 bg-[#f1f5f9] rounded animate-pulse w-2/3" />
        </div>
      </div>
    ),
  }
)

export function InvoiceSection({ proforma, items, settings, customer, banks }: InvoiceSectionProps) {
  return (
    <ProformaInvoiceNoSSR
      proforma={proforma}
      items={items}
      settings={settings}
      customer={customer}
      banks={banks}
    />
  )
}
