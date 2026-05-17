// ── PipelineContent — Commercial hub / pipeline tab ──────────────────────────

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import SalesFlowClient, {
  type Proforma,
  type Sale,
  type StockLot,
} from '@/app/dashboard/sales-flow/SalesFlowClient'
import { SalesFlowCommandBar } from '@/app/dashboard/sales-flow/_components/SalesFlowCommandBar'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded-xl" />
      ))}
    </div>
  )
}

function serverFmt(n: number): string {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000)
    return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)
    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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

type ProformaWithFx = Proforma & { fx_try?: number | null }

interface Props { companyId: string }

export async function PipelineContent({ companyId }: Props) {
  const supabase = createClient()

  const [pfRes, salesRes, lotRes] = await Promise.all([
    supabase
      .from('proformas')
      .select('id, customer_name, status, total, fx_try, currency, created_at, updated_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('sales')
      .select('id, customer_name, total_try:total, payment_status, sale_date, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: false }),
    supabase
      .from('stock_lots')
      .select('qty_remaining, cost_price_try, product_name, lot_no, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0),
  ])

  const proformas = (pfRes.data  ?? []) as Proforma[]
  const stockLots = (lotRes.data ?? []) as unknown as StockLot[]
  const rawSales  = (salesRes.data ?? []) as (Omit<Sale, 'cost_try'> & { sale_date?: string | null })[]
  const sales: Sale[] = rawSales.map(r => ({
    id:             r.id,
    customer_name:  r.customer_name,
    total_try:      r.total_try,
    cost_try:       0, // cogs column does not exist on live DB
    payment_status: r.payment_status,
    sale_date:      r.sale_date ?? null,
    created_at:     r.created_at,
  }))

  const stockValue   = stockLots.reduce((s, l) => s + (Number(l.qty_remaining) || 0) * (Number((l as { cost_price_try?: number | null }).cost_price_try) || 0), 0)
  const pipelineVal  = proformas.filter(p => p.status === 'sent' || p.status === 'accepted').reduce((s, p) => s + (Number(p.total) || 0) * (Number((p as ProformaWithFx).fx_try) || 1), 0)
  const totalRevenue = sales.reduce((s, r) => s + (Number(r.total_try) || 0), 0)
  const totalCogs    = sales.reduce((s, r) => s + (Number(r.cost_try)  || 0), 0)
  const grossProfit  = totalRevenue - totalCogs
  const grossMargin  = totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0
  const unpaidTotal  = sales.filter(s => s.payment_status !== 'paid').reduce((s, r) => s + (Number(r.total_try) || 0), 0)
  const recentPf     = proformas.slice(0, 5)

  return (
    <div className="space-y-6">
      <Suspense fallback={<CommandBarSkeleton />}>
        <SalesFlowCommandBar companyId={companyId} />
      </Suspense>

      <div>
        <h2 className="text-xl font-black text-gray-900 tracking-tight">Satış Akışı</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Pipeline görünümü · {proformas.length} teklif · {sales.length} satış
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-100 rounded-xl overflow-hidden">
        {[
          { label: 'Stok Değeri',  value: serverFmt(stockValue),   sub: `${stockLots.length} aktif lot`,                color: 'text-gray-900' },
          { label: 'Pipeline',     value: pipelineVal > 0 ? serverFmt(pipelineVal) : '—', sub: 'bekleyen teklifler', color: 'text-blue-700' },
          { label: 'Toplam Ciro',  value: totalRevenue > 0 ? serverFmt(totalRevenue) : '—', sub: unpaidTotal > 0 ? `${serverFmt(unpaidTotal)} bekliyor` : 'tamamı tahsil', color: 'text-gray-900' },
          { label: 'Brüt Kâr',    value: totalRevenue > 0 ? serverFmt(grossProfit) : '—', sub: totalRevenue > 0 ? `%${grossMargin.toFixed(1)} marj` : 'veri yok', color: grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600' },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent proformas */}
      {recentPf.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
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
                  <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[200px] truncate">{p.customer_name ?? '—'}</td>
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
                    {p.created_at ? new Date(p.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Interactive pipeline */}
      <SalesFlowClient
        initialProformas={proformas}
        initialSales={sales}
        initialStockLots={stockLots}
      />
    </div>
  )
}
