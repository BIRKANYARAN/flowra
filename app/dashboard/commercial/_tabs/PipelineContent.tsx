// ── PipelineContent — Commercial hub / pipeline tab ──────────────────────────

import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import SalesFlowClient, {
  type Proforma,
  type Sale,
  type StockLot,
} from '@/app/dashboard/sales-flow/SalesFlowClient'
import { SalesFlowCommandBar } from '@/app/dashboard/sales-flow/_components/SalesFlowCommandBar'
import { detectRevenueAnomalies, type MonthlyRevenue } from '@/lib/engines/anomaly.engine'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded-xl" />
      ))}
    </div>
  )
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[m - 1] ?? ym} ${String(y).slice(2)}`
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

  // ── Monthly revenue trend + anomaly detection ─────────────────────────────
  const revByMonth = new Map<string, number>()
  for (const s of sales) {
    const ym = ((s.sale_date ?? s.created_at) ?? '').slice(0, 7)
    if (!ym) continue
    revByMonth.set(ym, (revByMonth.get(ym) ?? 0) + (Number(s.total_try) || 0))
  }
  const monthlyRevenues: MonthlyRevenue[] = Array.from(revByMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, revenue]) => ({ month, revenue }))
  const recentMonths = monthlyRevenues.slice(-6)
  const maxRevMonth  = Math.max(...recentMonths.map(m => m.revenue), 1)

  const revenueAnomalies = detectRevenueAnomalies(monthlyRevenues)
    .filter(a => a.severity === 'high')
    .slice(0, 3)

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

      {/* Revenue anomaly alerts */}
      {revenueAnomalies.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">⚠ Anormal Gelir Hareketi</span>
            <span className="text-[9px] text-amber-600">(istatistiksel eşik aşıldı)</span>
          </div>
          <div className="space-y-1">
            {revenueAnomalies.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${
                  a.direction === 'drop' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {fmtMonth(a.month)}
                </span>
                <span className="text-[10px] text-amber-700">{a.message}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-amber-600 mt-1.5">
            Detaylı analiz için Finans → Risk sekmesini inceleyin.
          </div>
        </div>
      )}

      {/* Monthly revenue trend */}
      {recentMonths.length > 1 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Aylık Ciro Trendi</h3>
          <div className="flex items-end gap-2 h-20">
            {recentMonths.map(m => {
              const heightPct = Math.max(4, (m.revenue / maxRevMonth) * 100)
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full bg-primary-300 group-hover:bg-primary-400 rounded-t transition-all" style={{ height: `${heightPct}%` }} />
                  <div className="text-[9px] text-gray-400 font-semibold">{fmtMonth(m.month)}</div>
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-gray-900 text-white rounded-lg px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                    <div className="font-bold">{fmtMonth(m.month)}</div>
                    <div className="text-primary-300">{serverFmt(m.revenue)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
            <span>En düşük: {serverFmt(Math.min(...recentMonths.map(m => m.revenue)))}</span>
            <span>En yüksek: {serverFmt(Math.max(...recentMonths.map(m => m.revenue)))}</span>
          </div>
        </div>
      )}

      {/* Interactive pipeline */}
      <SalesFlowClient
        initialProformas={proformas}
        initialSales={sales}
        initialStockLots={stockLots}
      />

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Satış akışı tahsilat ve müşteri riskiyle birlikte yönetilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/commercial?tab=collections" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Tahsilat →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/commercial?tab=customers" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Müşteri Riskleri →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            P&amp;L Analizi →
          </Link>
        </div>
      </div>
    </div>
  )
}
