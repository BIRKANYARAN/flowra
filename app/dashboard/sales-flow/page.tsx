// ── /dashboard/sales-flow — Satış Akışı (server component) ───────────────────
//
// FAZ 18: Converted from 'use client' to server component.
//
// Server-rendered sections (static, no JS):
//   Zone 1 — KPI strip: stok değeri · pipeline · toplam ciro · brüt kâr
//   Zone 2 — Son 5 proforma tablosu (read-only)
//
// Client island:
//   SalesFlowClient — interactive pipeline stage cards + detail panels
//
// Self-HTTP eliminated: proformas + sales + stock_lots prefetched via Supabase.

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import SalesFlowClient, {
  type Proforma,
  type Sale,
  type StockLot,
} from './SalesFlowClient'

// ── Analytics helpers (pure, tested in tests/sales-flow-analytics.test.ts) ───

function computeStockValue(lots: StockLot[]): number {
  return lots.reduce((s, l) => s + (Number(l.qty_remaining) || 0) * (Number(l.entry_cost_try) || 0), 0)
}

function computePipelineValue(proformas: Proforma[]): number {
  return proformas
    .filter(p => p.status === 'sent' || p.status === 'accepted')
    .reduce((s, p) => s + (Number(p.total) || 0), 0)
}

function computeGrossProfit(revenue: number, cogs: number): number {
  return revenue - cogs
}

function computeGrossMargin(revenue: number, cogs: number): number {
  if (revenue <= 0) return 0
  return ((revenue - cogs) / revenue) * 100
}

function computeUnpaidTotal(sales: Sale[]): number {
  return sales
    .filter(s => s.payment_status !== 'paid')
    .reduce((s, r) => s + (Number(r.total_try) || 0), 0)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SalesFlowPage() {
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
  const [pfRes, salesRes, lotRes] = await Promise.all([
    supabase
      .from('proformas')
      .select('id, customer_name, status, total, currency, created_at, updated_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('sales')
      .select('id, customer_name, total_try, cogs, payment_status, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('stock_lots')
      .select('qty_remaining, entry_cost_try, product_name, lot_no, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0),
  ])

  // ── Normalize sales: cogs column → cost_try ────────────────────────────────
  const proformas  = (pfRes.data    ?? []) as Proforma[]
  const stockLots  = (lotRes.data   ?? []) as StockLot[]
  const rawSales   = (salesRes.data ?? []) as (Omit<Sale, 'cost_try'> & { cogs?: number | null })[]
  const sales: Sale[] = rawSales.map(r => ({
    id:             r.id,
    customer_name:  r.customer_name,
    total_try:      r.total_try,
    cost_try:       Number(r.cogs ?? 0),
    payment_status: r.payment_status,
    created_at:     r.created_at,
  }))

  // ── Server-side analytics ──────────────────────────────────────────────────
  const stockValue   = computeStockValue(stockLots)
  const pipelineVal  = computePipelineValue(proformas)
  const totalRevenue = sales.reduce((s, r) => s + (Number(r.total_try) || 0), 0)
  const totalCogs    = sales.reduce((s, r) => s + (Number(r.cost_try)  || 0), 0)
  const grossProfit  = computeGrossProfit(totalRevenue, totalCogs)
  const grossMargin  = computeGrossMargin(totalRevenue, totalCogs)
  const unpaidTotal  = computeUnpaidTotal(sales)

  // Recent 5 proformas for server-rendered preview table
  const recentPf = proformas.slice(0, 5)

  function serverFmt(n: number): string {
    const abs  = Math.abs(n)
    const sign = n < 0 ? '−' : ''
    if (abs >= 1_000_000)
      return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
    if (abs >= 10_000)
      return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
    return `${sign}₺${abs.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  const STATUS_LABEL: Record<string, string> = {
    draft: 'Taslak', sent: 'Gönderildi', accepted: 'Onaylandı',
    rejected: 'Reddedildi', converted: 'Satışa Döndü',
  }
  const STATUS_COLOR: Record<string, string> = {
    draft:     'bg-gray-100 text-gray-500',
    sent:      'bg-blue-100 text-blue-700',
    accepted:  'bg-emerald-100 text-emerald-700',
    rejected:  'bg-red-100 text-red-600',
    converted: 'bg-primary-100 text-primary-700',
  }

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Satış Akışı</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Pipeline görünümü · {proformas.length} teklif · {sales.length} satış
        </p>
      </div>

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
        {[
          {
            label: 'Stok Değeri',
            value: serverFmt(stockValue),
            sub:   `${stockLots.length} aktif lot`,
            color: 'text-gray-900',
          },
          {
            label: 'Pipeline',
            value: pipelineVal > 0 ? serverFmt(pipelineVal) : '—',
            sub:   'bekleyen teklifler',
            color: 'text-blue-700',
          },
          {
            label: 'Toplam Ciro',
            value: totalRevenue > 0 ? serverFmt(totalRevenue) : '—',
            sub:   unpaidTotal > 0 ? `${serverFmt(unpaidTotal)} bekliyor` : 'tamamı tahsil',
            color: 'text-gray-900',
          },
          {
            label: 'Brüt Kâr',
            value: totalRevenue > 0 ? serverFmt(grossProfit) : '—',
            sub:   totalRevenue > 0 ? `%${grossMargin.toFixed(1)} marj` : 'veri yok',
            color: grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600',
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

      {/* ── Zone 2: Son Proformalar (server-rendered, no JS) ─────────────── */}
      {recentPf.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Son Teklifler</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <th className="text-left px-4 py-2">Müşteri</th>
                <th className="text-left px-4 py-2">Durum</th>
                <th className="text-right px-4 py-2">Tutar</th>
                <th className="text-right px-4 py-2">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentPf.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[200px] truncate">
                    {p.customer_name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${STATUS_COLOR[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-700">
                    {serverFmt(Number(p.total ?? 0))}
                    <span className="text-[10px] text-gray-400 ml-1">{p.currency}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Client island: interactive pipeline ──────────────────────────── */}
      <SalesFlowClient
        initialProformas={proformas}
        initialSales={sales}
        initialStockLots={stockLots}
      />

    </div>
  )
}
