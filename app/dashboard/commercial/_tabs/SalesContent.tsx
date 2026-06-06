// ── SalesContent — Commercial hub / sales tab ─────────────────────────────────
//
// KPI strip: MTD revenue vs prior month + payment status + currency breakdown
// Gelir Kaynakları: 90-day revenue attribution by customer + product
// Table: SalesTable client island (search, filter, sort, status update)

import Link         from 'next/link'
import { NarrativeFooter } from '@/components/ds'
import { createClient }    from '@/lib/supabase-server'
import { normalizeSaleRow } from '@/lib/normalize'
import { fmtTRY as fmt, fmtPct }   from '@/lib/format'
import { SalesTable }       from './SalesTable'
import { RevenueAttributionService, type RevenueContributor } from '@/lib/services/commercial/revenue-attribution.service'
import RecurringRevenueClient from './_recurring/RecurringRevenueClient'
import { SalesCharts } from './SalesCharts'

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

interface Props { companyId: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function monthRange(offsetMonths: number): { from: string; to: string } {
  const now = new Date()
  const d   = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, d.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from: `${y}-${m}-01`, to: lastDay }
}

function delta(curr: number, prev: number): { text: string; color: string } | null {
  if (prev === 0) return null
  const pct = ((curr - prev) / prev) * 100
  const sign = pct >= 0 ? '+' : ''
  return {
    text:  `${sign}${pct.toFixed(1)}%`,
    color: pct >= 0 ? 'text-pos-text' : 'text-neg',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export async function SalesContent({ companyId }: Props) {
  const supabase = createClient()

  const mtd  = monthRange(0)
  const prev = monthRange(-1)

  // ── Parallel: full list + MTD + prior month aggregates + attribution ──────
  const [allRes, mtdRes, prevRes, attribution] = await Promise.all([
    // Full list for the table (no range limit — SalesTable handles pagination client-side)
    supabase
      .from('sales')
      .select('id, customer_name, currency, total_try:total, sale_date, created_at, proforma_id, payment_status, shipment_status, paid_amount, proformas(proforma_no, deleted_at)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: false }),

    // MTD lightweight aggregation
    supabase
      .from('sales')
      .select('total_try:total, paid_amount, payment_status, currency')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', mtd.from)
      .lte('sale_date', mtd.to),

    // Prior month lightweight aggregation
    supabase
      .from('sales')
      .select('total_try:total, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', prev.from)
      .lte('sale_date', prev.to),

    // Revenue attribution (90d) — graceful fallback on error
    RevenueAttributionService.getReport(companyId, supabase).catch(() => null),
  ])

  // ── Full list ─────────────────────────────────────────────────────────────
  const raw  = allRes.data ?? []
  const list = raw.map(normalizeSaleRow).filter((r): r is NonNullable<typeof r> => r !== null)

  // ── MTD aggregates ────────────────────────────────────────────────────────
  type MtdRow = { total_try: number | null; paid_amount: number | null; payment_status: string | null; currency: string | null }
  const mtdRows = (mtdRes.data ?? []) as MtdRow[]

  const mtdRevenue   = mtdRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const mtdPaid      = mtdRows.filter(r => r.payment_status === 'paid').reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const mtdPending   = mtdRows.filter(r => r.payment_status !== 'paid').reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const mtdCount     = mtdRows.length
  const mtdPaidCount = mtdRows.filter(r => r.payment_status === 'paid').length
  const collRatePct  = mtdRevenue > 0 ? Math.round((mtdPaid / mtdRevenue) * 100) : 0

  // Currency breakdown (MTD)
  const currMap = new Map<string, number>()
  for (const r of mtdRows) {
    const c = r.currency ?? 'TRY'
    currMap.set(c, (currMap.get(c) ?? 0) + Number(r.total_try ?? 0))
  }
  const topCurrencies = Array.from(currMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  // ── Prior month aggregate ─────────────────────────────────────────────────
  type PrevRow = { total_try: number | null; payment_status: string | null }
  const prevRows    = (prevRes.data ?? []) as PrevRow[]
  const prevRevenue = prevRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const momDelta    = delta(mtdRevenue, prevRevenue)

  // ── Total lifetime ────────────────────────────────────────────────────────
  const lifetimeRevenue = list.reduce((s, r) => s + Number((r as { total_try?: number }).total_try ?? 0), 0)

  // ── 6-month sales trend (from the full list) ────────────────────────────────
  const monthBuckets = new Map<string, { label: string; revenue: number }>()
  {
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthBuckets.set(ym, { label: TR_MONTHS[d.getMonth()], revenue: 0 })
    }
    for (const r of list as Array<{ sale_date?: string; total_try?: number }>) {
      const ym = (r.sale_date ?? '').slice(0, 7)
      const b  = monthBuckets.get(ym)
      if (b) b.revenue += Number(r.total_try ?? 0)
    }
  }
  const salesMonthly = Array.from(monthBuckets.values()).map(b => ({ label: b.label, revenue: Math.round(b.revenue) }))
  const salesTopCustomers = (attribution?.by_customer ?? []).slice(0, 6).map((c: RevenueContributor) => ({
    name: c.name, value: Math.round(c.total_try),
  }))

  return (
    <div className="max-w-4xl space-y-4">

      {/* ── Visual summary — monthly sales + top customers ──────────────── */}
      <SalesCharts monthly={salesMonthly} topCustomers={salesTopCustomers} />

      {/* ── Zone 0: Tekrarlayan Gelir Analizi (MRR/ARR/NRR) ─────────────── */}
      <RecurringRevenueClient companyId={companyId} />

      {/* ── Gelir Kaynakları (90d Revenue Attribution) ───────────────────── */}
      {attribution && attribution.total_revenue_try > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
          {/* Header + concentration summary */}
          <div className="px-4 pt-4 pb-3 border-b border-[#e2e8f0]">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Gelir Kaynakları — Son 90 Gün</div>
            <div className="flex flex-wrap gap-4 items-center mt-2">
              <div>
                <span className="text-[10px] text-[#94a3b8]">Toplam Ciro</span>
                <div className="text-lg font-black tabular-nums text-[#0f172a]">{fmt(attribution.total_revenue_try)}</div>
              </div>
              {attribution.top3_customer_pct !== null && (
                <div>
                  <span className="text-[10px] text-[#94a3b8]">İlk 3 Müşteri</span>
                  <div className="text-lg font-black tabular-nums text-[#0f172a]">%{attribution.top3_customer_pct.toFixed(1)}</div>
                </div>
              )}
              {attribution.top3_product_pct !== null && attribution.by_product.length > 0 && (
                <div>
                  <span className="text-[10px] text-[#94a3b8]">İlk 3 Ürün</span>
                  <div className="text-lg font-black tabular-nums text-[#0f172a]">%{attribution.top3_product_pct.toFixed(1)}</div>
                </div>
              )}
              <div>
                <span className="text-[10px] text-[#94a3b8]">Yeni Müşteri Cirosu</span>
                <div className="text-lg font-black tabular-nums text-pos-text">{fmt(attribution.new_customer_revenue_try)}</div>
              </div>
              <div>
                <span className="text-[10px] text-[#94a3b8]">Mevcut Müşteri Cirosu</span>
                <div className="text-lg font-black tabular-nums text-[#0f172a]">{fmt(attribution.returning_customer_revenue_try)}</div>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#e2e8f0]">
            {/* Top 5 customers */}
            <div className="p-4">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">En İyi 5 Müşteri</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#94a3b8] text-[10px]">
                    <th className="text-left font-semibold pb-1.5 w-5">#</th>
                    <th className="text-left font-semibold pb-1.5">Müşteri</th>
                    <th className="text-right font-semibold pb-1.5">Ciro</th>
                    <th className="text-right font-semibold pb-1.5 w-10">Pay%</th>
                    <th className="text-right font-semibold pb-1.5 w-6">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {attribution.by_customer.slice(0, 5).map((c: RevenueContributor) => (
                    <tr key={c.name} className="hover:bg-[#f8fafc]">
                      <td className="py-1.5 text-[#94a3b8] tabular-nums">{c.rank}</td>
                      <td className="py-1.5 font-medium text-[#1e293b] max-w-[120px] truncate" title={c.name}>{c.name}</td>
                      <td className="py-1.5 text-right tabular-nums text-[#1e293b]">{fmt(c.total_try)}</td>
                      <td className="py-1.5 text-right tabular-nums text-[#64748b]">%{c.pct_of_total.toFixed(1)}</td>
                      <td className="py-1.5 text-right">
                        {c.trend === 'growing'   && <span className="text-pos-text font-bold">↑</span>}
                        {c.trend === 'declining' && <span className="text-neg font-bold">↓</span>}
                        {c.trend === 'new'       && <span className="text-[#6366f1] font-bold text-[10px]">YENİ</span>}
                        {c.trend === 'stable'    && <span className="text-[#94a3b8]">→</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top 5 products (or new/returning summary if no products) */}
            {attribution.by_product.length > 0 ? (
              <div className="p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">En İyi 5 Ürün / Hizmet</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#94a3b8] text-[10px]">
                      <th className="text-left font-semibold pb-1.5 w-5">#</th>
                      <th className="text-left font-semibold pb-1.5">Ürün / Hizmet</th>
                      <th className="text-right font-semibold pb-1.5">Ciro</th>
                      <th className="text-right font-semibold pb-1.5 w-10">Pay%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {attribution.by_product.slice(0, 5).map((p: RevenueContributor) => (
                      <tr key={p.name} className="hover:bg-[#f8fafc]">
                        <td className="py-1.5 text-[#94a3b8] tabular-nums">{p.rank}</td>
                        <td className="py-1.5 font-medium text-[#1e293b] max-w-[120px] truncate" title={p.name}>{p.name}</td>
                        <td className="py-1.5 text-right tabular-nums text-[#1e293b]">{fmt(p.total_try)}</td>
                        <td className="py-1.5 text-right tabular-nums text-[#64748b]">%{p.pct_of_total.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-3">
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Yeni vs Mevcut Müşteri</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#f0fdf4] rounded p-3">
                    <div className="text-[10px] text-[#94a3b8] mb-0.5">Yeni Müşteri</div>
                    <div className="text-base font-black tabular-nums text-pos-text">{fmt(attribution.new_customer_revenue_try)}</div>
                    {attribution.total_revenue_try > 0 && (
                      <div className="text-[10px] text-[#94a3b8]">
                        %{((attribution.new_customer_revenue_try / attribution.total_revenue_try) * 100).toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div className="bg-[#f8fafc] rounded p-3">
                    <div className="text-[10px] text-[#94a3b8] mb-0.5">Mevcut Müşteri</div>
                    <div className="text-base font-black tabular-nums text-[#0f172a]">{fmt(attribution.returning_customer_revenue_try)}</div>
                    {attribution.total_revenue_try > 0 && (
                      <div className="text-[10px] text-[#94a3b8]">
                        %{((attribution.returning_customer_revenue_try / attribution.total_revenue_try) * 100).toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      {(mtdCount > 0 || list.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          {[
            {
              label: 'Bu Ay Ciro (MTD)',
              value: mtdRevenue > 0 ? fmt(mtdRevenue) : '—',
              sub:   momDelta
                ? <span className={`font-semibold ${momDelta.color}`}>{momDelta.text} geçen ay</span>
                : `${mtdCount} fatura`,
              color: 'text-[#0f172a]',
            },
            {
              label: 'Tahsil Edildi',
              value: mtdPaid > 0 ? fmt(mtdPaid) : '—',
              sub:   `%${collRatePct} tahsilat oranı · ${mtdPaidCount} fatura`,
              color: collRatePct >= 80 ? 'text-pos-text' : collRatePct >= 50 ? 'text-warn-text' : 'text-[#0f172a]',
            },
            {
              label: 'Bekleyen Tahsilat',
              value: mtdPending > 0 ? fmt(mtdPending) : '—',
              sub:   mtdPending > 0
                ? `${mtdCount - mtdPaidCount} ödenmemiş fatura`
                : 'Bu ay tamamı tahsil edildi',
              color: mtdPending > 0 ? 'text-neg' : 'text-pos-text',
            },
            {
              label: 'Toplam Satış',
              value: fmt(lifetimeRevenue),
              sub:   `${list.length} kayıt · tüm dönemler`,
              color: 'text-[#0f172a]',
            },
          ].map((card, i) => (
            <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-[#94a3b8] mt-1 flex items-center gap-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Currency breakdown (only if multi-currency) ───────────────────── */}
      {topCurrencies.length > 1 && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Bu Ay — Para Birimi Dağılımı</div>
          <div className="flex gap-4 flex-wrap">
            {topCurrencies.map(([cur, total]) => (
              <div key={cur} className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-wide bg-[#f1f5f9] text-[#64748b] px-1.5 py-0.5 rounded">{cur}</span>
                <span className="text-xs font-bold tabular-nums text-[#1e293b]">{fmt(total)}</span>
                {mtdRevenue > 0 && (
                  <span className="text-[10px] text-[#94a3b8]">%{Math.round((total / mtdRevenue) * 100)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Table header row ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#94a3b8]">{list.length} satış kaydı · tüm dönemler</p>
        <Link
          href="/dashboard/commercial?tab=collections"
          className="border border-[#e2e8f0] px-3.5 py-2 rounded text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1e293b] transition-colors"
        >
          Tahsilatlar →
        </Link>
      </div>

      {/* ── MTD vs Prior Month Alert ──────────────────────────────────── */}
      {momDelta && prevRevenue > 0 && (() => {
        const pctChange = ((mtdRevenue - prevRevenue) / prevRevenue) * 100
        const dayOfMonth = new Date().getDate()
        // Only alert if we're past day 10 (early month skew less likely)
        if (dayOfMonth < 10 || Math.abs(pctChange) < 15) return null
        const isDown = pctChange < 0
        return (
          <div className={`rounded border px-4 py-3 ${
            isDown ? 'bg-warn-light border-warn-light' : 'bg-pos-light border-pos-light'
          }`}>
            <div className={`text-[11px] font-black uppercase tracking-wide ${isDown ? 'text-warn-text' : 'text-pos-text'}`}>
              {isDown ? 'Aylık Ciro Düşüşü' : 'Aylık Ciro Artışı'}
            </div>
            <div className={`text-xs mt-0.5 ${isDown ? 'text-warn-text' : 'text-pos-text'}`}>
              Bu ay {fmt(mtdRevenue)} — geçen aya ({fmt(prevRevenue)}) göre{' '}
              <span className="font-bold">{momDelta.text}</span>.
              {isDown && ` Ay ${dayOfMonth}. günü itibarıyla talep düşüşü gözlemleniyor.`}
            </div>
            <Link
              href="/dashboard/finance?tab=pnl"
              className={`text-[10px] font-bold underline underline-offset-2 shrink-0 mt-0.5 ${isDown ? 'text-warn-text' : 'text-pos-text'}`}
            >
              P&amp;L Analizi →
            </Link>
          </div>
        )
      })()}

      <SalesTable rows={list} />

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="MTD ciro tahsil edildiğinde nakit pozisyonuna girer — tahsilat hızı runway'ı doğrudan belirler."
        links={[
          { label: 'P&L Analizi', href: '/dashboard/finance?tab=pnl' },
          { label: 'Satış Akışı', href: '/dashboard/commercial?tab=pipeline' },
        ]}
      />
    </div>
  )
}
