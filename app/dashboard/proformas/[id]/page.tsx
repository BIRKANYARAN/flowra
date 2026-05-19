export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { fmtDate, sym } from '@/lib/format'
import type { Proforma, ProformaItem, Customer, CompanyBank } from '@/types'
import { ProformaDetailClient } from './client'
import type { ClientItem, ClientPdfOpts } from './client'
import type { BrandColor, DocumentStyle } from '@/components/pdf/generatePdf'
import { safeNum, safeStr } from '@/lib/normalize'
import { calculateTotals } from '@/lib/calc'
import { InvoiceSection } from './InvoiceSection'
import { resolveCompanyId } from '@/lib/resolve-company'


function isValidUUID(val: unknown): val is string {
  return (
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
  )
}

interface PageProps {
  params: { id: string }
}

export default async function ProformaDetailPage({ params }: PageProps) {
  // ── 1. Param validation (outside try — notFound() must propagate) ────────
  if (!params || typeof params.id !== 'string') return notFound()
  const id = params.id
  if (!isValidUUID(id)) return notFound()

  const supabase = createClient()

  // ── 2. Auth (outside try — notFound() must propagate) ────────────────────
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData || !authData.user) return notFound()
  const user = authData.user

  // ── 2b. Resolve company (outside try — notFound() must propagate) ────────
  // Filtering by user_id instead of company_id is the root cause of team
  // members always seeing a 404 on proformas they didn't personally create.
  // company_id is the correct multi-tenant scope for all company-owned tables.
  let companyId: string
  try { companyId = await resolveCompanyId(user.id, supabase) }
  catch { return notFound() }

  try {
    // ── 3. Fetch proforma + items + company + banks concurrently ─────────────
    // NOTE: user_settings removed from this query — it has no company-info columns
    // (only settings JSONB). Company data lives in the companies table.
    const [pRes, iRes, cmpRes, bRes] = await Promise.all([
      supabase
        .from('proformas')
        .select('*')
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle(),
      supabase
        .from('proforma_items')
        .select('*')
        .eq('proforma_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('companies')
        .select('name, address, phone, website, tax_id, tax_office, mersis_no, logo_url, email, brand_color, document_style')
        .eq('id', companyId)
        .maybeSingle(),
      supabase
        .from('company_banks')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('is_default', { ascending: false }),
    ])

    // Separate DB errors from genuine "not found"
    if (pRes.error) throw pRes.error
    if (!pRes.data) return notFound()

    const proforma   = pRes.data as Proforma
    const rawItems   = Array.isArray(iRes.data) ? (iRes.data as ProformaItem[]) : []
    const companyRow = cmpRes.data as Record<string, string | null> | null
    const banks      = Array.isArray(bRes.data) ? (bRes.data as CompanyBank[]) : []

    // Build a settings-shaped object from the companies table so downstream code works unchanged
    const settings = companyRow ? {
      company_name:  companyRow.name          ?? null,
      address:       companyRow.address       ?? null,
      phone:         companyRow.phone         ?? null,
      website:       companyRow.website       ?? null,
      tax_number:    companyRow.tax_id        ?? null,  // companies.tax_id ↔ settings shape tax_number
      tax_office:    companyRow.tax_office    ?? null,
      logo_url:      companyRow.logo_url      ?? null,
      mersis_no:     companyRow.mersis_no     ?? null,
      email:         companyRow.email         ?? null,
      brand_color:   companyRow.brand_color   ?? 'charcoal',
      document_style: companyRow.document_style ?? 'corporate',
    } : null

    // ── 4. Fetch customer (optional, never fatal) ────────────────────────────
    let customer: Customer | null = null
    if (proforma.customer_id) {
      try {
        const { data: cData } = await supabase
          .from('customers')
          .select('*')
          .eq('id', proforma.customer_id)
          .eq('company_id', companyId)
          .maybeSingle()
        if (cData) customer = cData as Customer
      } catch {
        // customer is optional — page continues without it
      }
    }

    // ── 5. Derived display values (all primitive, all guarded) ───────────────
    const currency     = safeStr(proforma.currency, 'TRY')
    const S            = sym(currency)
    const safeId       = safeStr(proforma.id, id)
    const no           = safeStr(proforma.proforma_no) || ('PRF-' + safeId.slice(-8).toUpperCase())
    const validityDays = safeNum(proforma.validity_days, 30) || 30
    const bankId       = safeStr(proforma.bank_id)
    const bank         = bankId ? (banks.find(b => b.id === bankId) ?? null) : null
    const createdAt    = safeStr(proforma.created_at) || new Date().toISOString()
    const status       = safeStr(proforma.status, 'draft')
    const customerName = safeStr(proforma.customer_name)
    const notes        = safeStr(proforma.notes) // empty string if null — never undefined

    // ── 6. Build clientItems DTO — only primitives, no DB row shape ──────────
    const clientItems: ClientItem[] = []
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i]
      try {
        clientItems.push({
          id:       safeStr(it.id),
          // DB canonical names first, legacy aliases as fallback for old rows
          name:     safeStr(it.product_name ?? it.name, '—'),
          price:    safeNum(it.unit_price   ?? it.price),
          kdv:      safeNum(it.kdv_rate     ?? it.kdv),
          quantity: safeNum(it.qty          ?? it.quantity, 1) || 1,
          unit:     safeStr(it.unit, 'adet'),
          currency: safeStr(it.currency, currency),
          discount_percent: safeNum(it.discount_pct ?? it.discount_percent),
        })
      } catch {
        // Item failed normalization — skip it, continue with remaining items
      }
    }

    // ── 7. Compute totals from raw items (central calc engine) ─────────────
    const totals     = calculateTotals(clientItems)
    const subtotalNet = totals.subtotal
    const kdvTotal    = totals.kdv_total
    const grandTotal  = totals.grand_total

    // ── 8. Build clientPdfOpts — fully serializable, no undefined anywhere ───
    const clientPdfOpts: ClientPdfOpts = {
      proformaNo:   no,
      createdAt,
      validityDays,
      currency,
      fxUsd:        safeNum(proforma.fx_usd) || null,
      fxEur:        safeNum(proforma.fx_eur) || null,
      notes,
      preparer: (proforma.preparer_name?.trim())
        ? { name: safeStr(proforma.preparer_name), title: safeStr(proforma.preparer_title) }
        : null,
      // Prefer frozen snapshot → fall back to live data for pre-snapshot proformas
      company: proforma.company_snapshot
        ? {
            name:      safeStr(proforma.company_snapshot.name),
            address:   safeStr(proforma.company_snapshot.address),
            phone:     safeStr(proforma.company_snapshot.phone),
            website:   safeStr(proforma.company_snapshot.website),
            taxNumber: safeStr(proforma.company_snapshot.tax_number),
            taxOffice: safeStr(proforma.company_snapshot.tax_office),
            logoUrl:   safeStr(proforma.company_snapshot.logo_url),
            mersisNo:  safeStr(proforma.company_snapshot.mersis_no),
          }
        : {
            name:      safeStr(settings?.company_name),
            address:   safeStr(settings?.address),
            phone:     safeStr(settings?.phone),
            website:   safeStr(settings?.website),
            taxNumber: safeStr(settings?.tax_number),
            taxOffice: safeStr(settings?.tax_office),
            logoUrl:   safeStr(settings?.logo_url),
            mersisNo:  safeStr(settings?.mersis_no),
          },
      customer: proforma.customer_snapshot
        ? {
            name:      safeStr(proforma.customer_snapshot.name),
            address:   safeStr(proforma.customer_snapshot.address),
            taxNumber: safeStr(proforma.customer_snapshot.tax_number),
            taxOffice: safeStr(proforma.customer_snapshot.tax_office),
            email:     safeStr(proforma.customer_snapshot.email),
            phone:     safeStr(proforma.customer_snapshot.phone),
          }
        : {
            name:      customerName,
            address:   safeStr(customer?.address),
            taxNumber: safeStr(customer?.tax_number),
            taxOffice: safeStr(customer?.tax_office),
            email:     safeStr(customer?.email),
            phone:     safeStr(customer?.phone),
          },
      bank: bank
        ? {
            bankName:   safeStr(bank.bank_name),
            branchName: safeStr(bank.branch_name),
            iban:       safeStr(bank.iban),
          }
        : null,
      items: clientItems.map(it => ({
        name:     it.name,
        unit:     it.unit,
        quantity: it.quantity,
        price:    it.price,
        kdv:      it.kdv,
        currency: it.currency,
        discount_percent: it.discount_percent,
      })),
      brand: {
        color: (settings?.brand_color || 'charcoal') as BrandColor,
        style: (settings?.document_style || 'corporate') as DocumentStyle,
      },
    }

    // ── 9. Render ────────────────────────────────────────────────────────────
    return (
      <div className="max-w-4xl">

        {/* Interactive toolbar — client component receives only serializable DTOs */}
        <ProformaDetailClient
          id={safeId}
          no={no}
          status={status}
          currency={currency}
          customerName={customerName}
          createdAt={createdAt}
          validityDays={validityDays}
          fxUsd={clientPdfOpts.fxUsd}
          fxEur={clientPdfOpts.fxEur}
          pdfOpts={clientPdfOpts}
          items={clientItems}
        />

        {/* Invoice card — client-only (ssr:false) to prevent SSR crash */}
        <InvoiceSection
          proforma={{
            id: safeId,
            proforma_no: no,
            customer_name: customerName,
            currency,
            validity_days: validityDays,
            notes,
            created_at: createdAt,
          }}
          items={clientItems.map(it => ({
            id: it.id,
            name: it.name,
            unit: it.unit,
            price: it.price,
            quantity: it.quantity,
            discount_percent: it.discount_percent ?? 0,
            kdv: it.kdv,
            currency: it.currency,
          }))}
          settings={settings ? {
            company_name: safeStr(settings.company_name),
            address: safeStr(settings.address),
            phone: safeStr(settings.phone),
            website: safeStr(settings.website),
            tax_number: safeStr(settings.tax_number),
            tax_office: safeStr(settings.tax_office),
            logo_url: safeStr(settings.logo_url),
            mersis_no: safeStr(settings.mersis_no),
          } : null}
          customer={customer ? {
            name: safeStr(customer.name),
            address: safeStr(customer.address),
            tax_number: safeStr(customer.tax_number),
            tax_office: safeStr(customer.tax_office),
            email: safeStr(customer.email),
            phone: safeStr(customer.phone),
          } : null}
          banks={banks.map(b => ({
            bank_name: safeStr(b.bank_name),
            branch_name: safeStr(b.branch_name),
            iban: safeStr(b.iban),
          }))}
        />
      </div>
    )
  } catch (err) {
    // Always re-throw — let Next.js route the error to the correct boundary:
    //   • notFound() / redirect() have a `digest` property → handled by the framework
    //   • Real errors (DB failures, render bugs) propagate to error.tsx (or Next.js default)
    // Converting all errors to notFound() silently masked the root cause of "404 after save".
    throw err
  }
}
