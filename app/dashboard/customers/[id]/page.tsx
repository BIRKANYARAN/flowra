// ── /dashboard/customers/[id] — Müşteri Detayı (server component) ────────────
//
// FAZ 11: Converted from 'use client' (self-HTTP) to server component.
// Self-HTTP eliminated — queries Supabase directly (replicates /api/customers/[id]).
//
// Server-rendered sections:
//   - Customer info panel
//   - Summary KPI cards
//   - Proformas table (read-only)
//
// Client island:
//   CustomerSalesClient — payment/shipment status toggle buttons

export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link                   from 'next/link'
import { createClient }       from '@/lib/supabase-server'
import { resolveCompanyId }   from '@/lib/resolve-company'
import CustomerSalesClient, { type SaleSummary } from './CustomerSalesClient'
import type { Customer }      from '@/types'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Status badge maps (server-rendered) ───────────────────────────────────────

const STATUS_PROFORMA: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Taslak',     cls: 'bg-gray-100 text-gray-500'    },
  sent:      { label: 'Gönderildi', cls: 'bg-blue-100 text-blue-700'    },
  accepted:  { label: 'Onaylandı',  cls: 'bg-green-100 text-green-700'  },
  approved:  { label: 'Onaylı',     cls: 'bg-green-100 text-green-700'  },
  rejected:  { label: 'Reddedildi', cls: 'bg-red-100 text-red-600'      },
  converted: { label: 'Satışa Dön', cls: 'bg-purple-100 text-purple-700'},
}

function Badge({ map, val }: { map: Record<string, { label: string; cls: string }>; val: string | null }) {
  const s = val && map[val] ? map[val] : { label: val ?? '—', cls: 'bg-gray-100 text-gray-400' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  )
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

function computeSummary(sales: SaleSummary[]) {
  const totalBilledTry = sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const totalPaidTry   = sales
    .filter(r => r.payment_status === 'paid')
    .reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  return {
    sale_count:       sales.length,
    total_billed_try: totalBilledTry,
    total_paid_try:   totalPaidTry,
    balance_try:      totalBilledTry - totalPaidTry,
  }
}

function proformaConversionRate(proformas: { status: string }[]): number {
  if (!proformas.length) return 0
  const converted = proformas.filter(p => p.status === 'converted').length
  return Math.round((converted / proformas.length) * 100)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch { redirect('/auth') }

  const { id } = params

  // ── Parallel data fetch (replicates /api/customers/[id] logic) ────────────
  const [customerRes, proformasRes, salesRes] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle(),

    supabase
      .from('proformas')
      .select('id, proforma_no, status, total, currency, created_at, converted_at')
      .eq('customer_id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),

    supabase
      .from('sales')
      .select('id, proforma_id, customer_name, currency, total, total_try, nominal_profit, payment_status, paid_at, shipment_status, created_at')
      .eq('customer_id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  if (!customerRes.data) notFound()

  const customer = customerRes.data as Customer
  const proformas = (proformasRes.data ?? []) as {
    id: string; proforma_no: string | null; status: string;
    total: number; currency: string; created_at: string; converted_at: string | null
  }[]
  const sales = (salesRes.data ?? []) as SaleSummary[]

  const summary     = computeSummary(sales)
  const convRate    = proformaConversionRate(proformas)
  const hasFinance  = summary.total_billed_try > 0

  return (
    <div className="max-w-4xl space-y-6">

      {/* ── Back + header ─────────────────────────────────────────────────── */}
      <div>
        <Link
          href="/dashboard/customers"
          className="text-sm text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-3"
        >
          ← Müşteriler
        </Link>
        <h1 className="text-2xl font-black">{customer.name}</h1>
        {customer.email && <p className="text-sm text-gray-500 mt-0.5">{customer.email}</p>}
      </div>

      {/* ── Summary KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Proforma',
            value: proformas.length.toString(),
            sub:   convRate > 0 ? `%${convRate} dönüşüm` : '',
            tone:  'text-gray-900',
          },
          {
            label: 'Satış',
            value: summary.sale_count.toString(),
            sub:   '',
            tone:  'text-gray-900',
          },
          {
            label: 'Toplam Fatura',
            value: hasFinance ? `₺${fmt(summary.total_billed_try)}` : '—',
            sub:   hasFinance ? `Ödenen: ₺${fmt(summary.total_paid_try)}` : '',
            tone:  'text-gray-900',
          },
          {
            label: summary.balance_try > 0 ? 'Bakiye (Ödenmedi)' : 'Tahsil Edildi',
            value: hasFinance ? `₺${fmt(Math.abs(summary.balance_try))}` : '—',
            sub:   '',
            tone:  summary.balance_try > 0 ? 'text-red-600' : 'text-emerald-600',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{c.label}</div>
            <div className={`text-lg font-black tabular-nums ${c.tone}`}>{c.value}</div>
            {c.sub && <div className="text-[10px] text-gray-400 mt-1">{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Customer Info ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
          Müşteri Bilgileri
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {customer.tax_number && (
            <>
              <span className="text-gray-400">Vergi No</span>
              <span className="font-medium">
                {customer.tax_number}{customer.tax_office ? ' / ' + customer.tax_office : ''}
              </span>
            </>
          )}
          {customer.phone && (
            <>
              <span className="text-gray-400">Telefon</span>
              <span className="font-medium">{customer.phone}</span>
            </>
          )}
          {customer.address && (
            <>
              <span className="text-gray-400">Adres</span>
              <span className="font-medium">{customer.address}</span>
            </>
          )}
          {customer.notes && (
            <>
              <span className="text-gray-400">Notlar</span>
              <span className="font-medium">{customer.notes}</span>
            </>
          )}
          {!customer.tax_number && !customer.phone && !customer.address && !customer.notes && (
            <span className="text-gray-400 col-span-2 text-xs">Ek bilgi girilmemiş.</span>
          )}
        </div>
      </div>

      {/* ── Sales (client island — status toggles) ────────────────────────── */}
      <CustomerSalesClient initialSales={sales} saleCount={summary.sale_count} />

      {/* ── Proformas (server-rendered — read-only) ───────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Proformalar</h2>
          <span className="text-xs text-gray-400">{proformas.length} kayıt</span>
        </div>
        {proformas.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Henüz proforma yok.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {proformas.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/60 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {p.proforma_no ?? p.id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-gray-400">{fmtDate(p.created_at)}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-medium tabular-nums">
                    {p.currency} {fmt(p.total)}
                  </span>
                  <Badge map={STATUS_PROFORMA} val={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
