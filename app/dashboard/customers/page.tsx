// ── /dashboard/customers — Müşteri Zekası (server component) ─────────────────
//
// FAZ 11: Converted from 'use client' to server component.
//
// Server-rendered sections (static, no JS):
//   Zone 1 — KPI strip: total customers, total billed, outstanding, top customer
//   Zone 2 — Top 5 customers by TRY revenue (CSS bar chart)
//
// Client island:
//   CustomersClient — add/edit/delete form + searchable list

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { PageHeader }       from '@/components/ui'
import type { Customer }    from '@/types'
import CustomersClient      from './CustomersClient'

// ── Formatters ────────────────────────────────────────────────────────────────

const _TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmt(n: number): string {
  const abs  = Math.abs(Number(n || 0))
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${_TRY.format(abs)}`
}

// ── Analytics helpers (pure, tested in tests/customer-analytics.test.ts) ──────

interface SaleAgg { customer_name: string; total_try: number; payment_status: string }

function totalBilled(sales: SaleAgg[]): number {
  return sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
}

function outstandingBalance(sales: SaleAgg[]): number {
  return sales
    .filter(r => r.payment_status !== 'paid')
    .reduce((s, r) => s + Number(r.total_try ?? 0), 0)
}

function topCustomersByRevenue(
  sales: SaleAgg[],
  customers: Customer[],
  n: number,
): { name: string; total: number }[] {
  const map = new Map<string, number>()
  for (const s of sales) {
    const key = s.customer_name ?? 'Bilinmiyor'
    map.set(key, (map.get(key) ?? 0) + Number(s.total_try ?? 0))
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, total]) => ({ name, total }))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CustomersPage() {
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

  // ── Parallel fetch ─────────────────────────────────────────────────────────
  const [customersRes, salesRes] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name'),

    supabase
      .from('sales')
      .select('customer_name, total_try, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const customers = (customersRes.data ?? []) as Customer[]
  const sales     = (salesRes.data     ?? []) as SaleAgg[]

  // ── Server-side analytics ──────────────────────────────────────────────────
  const billed      = totalBilled(sales)
  const outstanding = outstandingBalance(sales)
  const topCustomers = topCustomersByRevenue(sales, customers, 5)
  const maxTopTotal  = topCustomers[0]?.total ?? 1
  const paidCount    = customers.length > 0
    ? sales.filter(s => s.payment_status === 'paid').length
    : 0
  const collectionRate = sales.length > 0
    ? Math.round((paidCount / sales.length) * 100)
    : 0

  return (
    <div className="max-w-5xl space-y-6">

      <PageHeader
        title="Müşteriler"
        sub={`${customers.length} kayıt · ${sales.length} satış`}
      />

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────────── */}
      {sales.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[
            {
              label: 'Toplam Müşteri',
              value: String(customers.length),
              sub:   `${sales.length} satış kaydı`,
              color: 'text-gray-900',
            },
            {
              label: 'Toplam Ciro',
              value: billed > 0 ? fmt(billed) : '—',
              sub:   'Tüm satışlar (TRY)',
              color: 'text-primary-700',
            },
            {
              label: 'Bekleyen Tahsilat',
              value: outstanding > 0 ? fmt(outstanding) : '—',
              sub:   outstanding > 0 ? 'Ödenmemiş + kısmi' : 'Tamamı tahsil edildi ✓',
              color: outstanding > 0 ? 'text-red-600' : 'text-emerald-600',
            },
            {
              label: 'Tahsilat Oranı',
              value: sales.length > 0 ? `%${collectionRate}` : '—',
              sub:   `${paidCount} / ${sales.length} satış ödendi`,
              color: collectionRate >= 80 ? 'text-emerald-700' : collectionRate >= 50 ? 'text-amber-700' : 'text-red-600',
            },
          ].map((card, i) => (
            <div key={card.label}
              className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Zone 2: Top Customers Bar Chart ──────────────────────────────────── */}
      {topCustomers.length > 0 && billed > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
            En Yüksek Cirolu Müşteriler
          </h2>
          <div className="space-y-2.5">
            {topCustomers.map(tc => {
              const barPct   = (tc.total / maxTopTotal) * 100
              const sharePct = billed > 0 ? (tc.total / billed) * 100 : 0
              return (
                <div key={tc.name} className="flex items-center gap-3">
                  <div className="w-36 text-xs text-gray-700 font-medium shrink-0 truncate" title={tc.name}>
                    {tc.name}
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-5 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className="h-5 bg-primary-400 rounded-lg transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-28 text-right shrink-0">
                    <span className="text-xs font-bold tabular-nums text-primary-700">{fmt(tc.total)}</span>
                    <span className="text-[10px] text-gray-400 ml-1">%{sharePct.toFixed(0)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Client island: form + list ────────────────────────────────────────── */}
      <CustomersClient initialCustomers={customers} />

    </div>
  )
}
