// ── SalesContent — Commercial hub / sales tab ─────────────────────────────────
//
// KPI strip: MTD revenue vs prior month + payment status + currency breakdown
// Table: SalesTable client island (search, filter, sort, status update)

import Link         from 'next/link'
import { createClient }    from '@/lib/supabase-server'
import { normalizeSaleRow } from '@/lib/normalize'
import { fmtTRY as fmt }   from '@/lib/format'
import { SalesTable }       from './SalesTable'

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
    color: pct >= 0 ? 'text-emerald-600' : 'text-red-500',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export async function SalesContent({ companyId }: Props) {
  const supabase = createClient()

  const mtd  = monthRange(0)
  const prev = monthRange(-1)

  // ── Parallel: full list + MTD + prior month aggregates ───────────────────
  const [allRes, mtdRes, prevRes] = await Promise.all([
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

  return (
    <div className="max-w-4xl space-y-4">

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      {(mtdCount > 0 || list.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          {[
            {
              label: 'Bu Ay Ciro (MTD)',
              value: mtdRevenue > 0 ? fmt(mtdRevenue) : '—',
              sub:   momDelta
                ? <span className={`font-semibold ${momDelta.color}`}>{momDelta.text} geçen ay</span>
                : `${mtdCount} fatura`,
              color: 'text-gray-900',
            },
            {
              label: 'Tahsil Edildi',
              value: mtdPaid > 0 ? fmt(mtdPaid) : '—',
              sub:   `%${collRatePct} tahsilat oranı · ${mtdPaidCount} fatura`,
              color: collRatePct >= 80 ? 'text-emerald-700' : collRatePct >= 50 ? 'text-amber-700' : 'text-gray-900',
            },
            {
              label: 'Bekleyen Tahsilat',
              value: mtdPending > 0 ? fmt(mtdPending) : '—',
              sub:   mtdPending > 0
                ? `${mtdCount - mtdPaidCount} ödenmemiş fatura`
                : 'Tamamı tahsil edildi ✓',
              color: mtdPending > 0 ? 'text-red-600' : 'text-emerald-600',
            },
            {
              label: 'Toplam Satış',
              value: fmt(lifetimeRevenue),
              sub:   `${list.length} kayıt · tüm dönemler`,
              color: 'text-gray-900',
            },
          ].map((card, i) => (
            <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Currency breakdown (only if multi-currency) ───────────────────── */}
      {topCurrencies.length > 1 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Bu Ay — Para Birimi Dağılımı</div>
          <div className="flex gap-4 flex-wrap">
            {topCurrencies.map(([cur, total]) => (
              <div key={cur} className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{cur}</span>
                <span className="text-xs font-bold tabular-nums text-gray-800">{fmt(total)}</span>
                {mtdRevenue > 0 && (
                  <span className="text-[10px] text-gray-400">%{Math.round((total / mtdRevenue) * 100)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Table header row ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{list.length} satış kaydı · tüm dönemler</p>
        <Link
          href="/dashboard/commercial?tab=collections"
          className="border border-gray-100 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
        >
          Tahsilatlar →
        </Link>
      </div>

      <SalesTable rows={list} />
    </div>
  )
}
