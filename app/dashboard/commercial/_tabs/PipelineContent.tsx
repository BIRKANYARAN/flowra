// ── PipelineContent — Commercial hub / pipeline tab ──────────────────────────

import Link from 'next/link'
import { Suspense } from 'react'
import { NarrativeFooter } from '@/components/ds'
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
        <div key={i} className="h-8 w-28 bg-[#f1f5f9] rounded" />
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
  draft:     'bg-[#f1f5f9] text-[#64748b]',
  sent:      'bg-info-light text-info-text',
  accepted:  'bg-pos-light text-pos-text',
  rejected:  'bg-neg-light text-neg',
  converted: 'bg-brand-subtle text-brand',
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
    <div className="space-y-4">
      <Suspense fallback={<CommandBarSkeleton />}>
        <SalesFlowCommandBar companyId={companyId} />
      </Suspense>

      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Satış Akışı — {proformas.length} teklif · {sales.length} satış
        </span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded overflow-hidden">
        {[
          { label: 'Stok Değeri',  value: serverFmt(stockValue),   sub: `${stockLots.length} aktif lot`,                color: 'text-[#0f172a]' },
          { label: 'Pipeline',     value: pipelineVal > 0 ? serverFmt(pipelineVal) : '—', sub: 'gönderildi · onaylandı', color: 'text-info-text' },
          { label: 'Toplam Ciro',  value: totalRevenue > 0 ? serverFmt(totalRevenue) : '—', sub: unpaidTotal > 0 ? `${serverFmt(unpaidTotal)} tahsilat bekliyor` : 'tahsilat tamamlandı', color: 'text-[#0f172a]' },
          { label: 'Brüt Kâr',    value: totalRevenue > 0 ? serverFmt(grossProfit) : '—', sub: totalRevenue > 0 ? `%${grossMargin.toFixed(1)} marj` : 'veri yok', color: grossProfit >= 0 ? 'text-pos-text' : 'text-neg' },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent proformas */}
      {recentPf.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
          <div className="px-4 py-2 border-b border-[#e2e8f0]">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Son Teklifler</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#e2e8f0]">
                <th className="text-left px-4 py-2">Müşteri</th>
                <th className="text-left px-4 py-2">Durum</th>
                <th className="text-right px-4 py-2">Tutar</th>
                <th className="text-right px-4 py-2">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {recentPf.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium text-[#1e293b] max-w-[200px] truncate">{p.customer_name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_COLOR[p.status] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#334155]">
                    {serverFmt(Number(p.total ?? 0))}
                    <span className="text-[10px] text-[#94a3b8] ml-1">{p.currency}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#94a3b8]">
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
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-warn-text">Anormal Gelir Hareketi</span>
            <span className="text-[9px] text-warn-text">(istatistiksel eşik aşıldı)</span>
          </div>
          <div className="space-y-1">
            {revenueAnomalies.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                  a.direction === 'drop' ? 'bg-neg-light text-neg-text' : 'bg-warn-light text-warn-text'
                }`}>
                  {fmtMonth(a.month)}
                </span>
                <span className="text-[10px] text-warn-text">{a.message}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-warn-text mt-1.5">
            Detaylı analiz için Finans → Risk sekmesini inceleyin.
          </div>
        </div>
      )}

      {/* Monthly revenue trend */}
      {recentMonths.length > 1 && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">Aylık Ciro Trendi — Son 6 Ay</div>
          <div className="flex items-end gap-2 h-20">
            {recentMonths.map(m => {
              const heightPct = Math.max(4, (m.revenue / maxRevMonth) * 100)
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full bg-brand-subtle group-hover:bg-brand-light rounded-t transition-all" style={{ height: `${heightPct}%` }} />
                  <div className="text-[9px] text-[#94a3b8] font-semibold">{fmtMonth(m.month)}</div>
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-[#0f172a] text-white rounded px-2 py-1 text-[10px] whitespace-nowrap">
                    <div className="font-bold">{fmtMonth(m.month)}</div>
                    <div className="text-brand-light">{serverFmt(m.revenue)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-[#94a3b8]">
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
      <NarrativeFooter
        narrative="Pipeline değeri tahsilata dönmeden nakit etkisi olmaz — tahsilat ve müşteri riskiyle birlikte değerlendirin."
        links={[
          { label: 'Tahsilat',            href: '/dashboard/commercial?tab=collections' },
          { label: 'Müşteri Riskleri',    href: '/dashboard/commercial?tab=customers' },
          { label: 'P&L Analizi',         href: '/dashboard/finance?tab=pnl' },
        ]}
      />
    </div>
  )
}
