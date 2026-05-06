'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/sales-flow  —  Satış Akışı (interactive)
//
// Clickable pipeline stages. Each stage click expands an inline detail panel
// showing the relevant records without leaving the page.
//
//   STOK → TEKLIF → SATIŞ → TAHSİLAT → KÂR
//
// Client component so each stage can toggle open/closed.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import type { ReactNode }                   from 'react'
import { useSupabase }                      from '@/lib/hooks/useSupabase'
import Link                                 from 'next/link'
import { resolveCompanyId }                 from '@/lib/resolve-company'

// ── Types ─────────────────────────────────────────────────────────────────────

type ProformaStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'
type StageKey = 'stok' | 'teklif' | 'satis' | 'tahsilat' | 'kar'

interface StockLot {
  qty_remaining: number
  entry_cost_try: number
  product_name?: string | null
  lot_no?: string | null
  created_at?: string | null
}

interface Proforma {
  id: string
  customer_name: string | null
  status: ProformaStatus
  total: number | null
  currency: string | null
  created_at: string | null
  updated_at: string | null
}

interface Sale {
  id: string
  customer_name: string | null
  total_try: number | null
  cost_try: number | null
  payment_status: string | null
  created_at: string | null
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000)
    return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)
    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${abs.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

// ── Status badges ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProformaStatus, string> = {
  draft: 'Taslak', sent: 'Gönderildi', accepted: 'Onaylandı',
  rejected: 'Reddedildi', converted: 'Satışa Döndü',
}
const STATUS_COLOR: Record<ProformaStatus, string> = {
  draft:     'bg-gray-100 text-gray-500',
  sent:      'bg-blue-100 text-blue-700',
  accepted:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-600',
  converted: 'bg-primary-100 text-primary-70000',
}
const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'bg-orange-100 text-orange-600',
  paid:    'bg-emerald-100 text-emerald-700',
  partial: 'bg-yellow-100 text-yellow-700',
  overdue: 'bg-red-100 text-red-600',
}
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Bekliyor', paid: 'Ödendi', partial: 'Kısmi', overdue: 'Gecikmiş',
}

function PfBadge({ status }: { status: string }) {
  const s = status as ProformaStatus
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${STATUS_COLOR[s] ?? 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABEL[s] ?? status}
    </span>
  )
}

function PayBadge({ status }: { status: string | null }) {
  const s = status ?? 'unpaid'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${PAYMENT_COLOR[s] ?? 'bg-gray-100 text-gray-500'}`}>
      {PAYMENT_LABEL[s] ?? s}
    </span>
  )
}

// ── Stage component ───────────────────────────────────────────────────────────

function Stage({
  stageKey, step, label, count, value, color, sub, selected, onClick,
}: {
  stageKey: StageKey; step: string; label: string; count: number; value: number
  color: string; sub?: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-0 text-left transition-all group focus:outline-none ${selected ? 'scale-[1.02]' : ''}`}
    >
      <div className={`border-2 rounded-xl px-4 py-4 h-full transition-all ${color} ${
        selected
          ? 'shadow-md ring-2 ring-offset-1 ring-primary-400'
          : 'group-hover:shadow-sm group-hover:border-primary-300'
      }`}>
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">{step}</div>
        <div className="font-black text-base leading-tight mb-2">{label}</div>
        <div className="text-2xl font-black tabular-nums leading-none mb-1">{fmt(value)}</div>
        <div className="text-xs opacity-70">{count} kayıt{sub ? ` · ${sub}` : ''}</div>
        <div className={`text-[10px] font-bold mt-2 opacity-0 group-hover:opacity-100 transition-opacity ${
          selected ? '!opacity-100' : ''
        }`}>
          {selected ? '▲ Gizle' : '▼ Detay'}
        </div>
      </div>
    </button>
  )
}

// ── Detail panels ─────────────────────────────────────────────────────────────

function PanelEmpty({ msg }: { msg: string }) {
  return <div className="py-6 text-center text-sm text-gray-400">{msg}</div>
}

function StokPanel({ lots }: { lots: StockLot[] }) {
  if (lots.length === 0) return <PanelEmpty msg="Stok kaydı yok" />
  const total = lots.reduce((s, l) => s + l.qty_remaining * l.entry_cost_try, 0)
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2">Lot / Ürün</th>
            <th className="text-right px-4 py-2">Adet</th>
            <th className="text-right px-4 py-2">Birim Maliyet</th>
            <th className="text-right px-4 py-2">Toplam</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {lots.map((l, i) => (
            <tr key={i} className="hover:bg-gray-50/60">
              <td className="px-4 py-2.5 text-gray-700 font-medium">
                {l.product_name ?? (l.lot_no ? `Lot ${l.lot_no}` : `#${i + 1}`)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{l.qty_remaining.toLocaleString('tr-TR')}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(l.entry_cost_try)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-800">
                {fmt(l.qty_remaining * l.entry_cost_try)}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-400">{fmtDate(l.created_at ?? null)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200">
            <td className="px-4 py-2 text-xs font-bold text-gray-500" colSpan={3}>Toplam FIFO maliyet</td>
            <td className="px-4 py-2 text-right font-black tabular-nums text-gray-900">{fmt(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <div className="px-4 py-2 text-right">
        <Link href="/dashboard/stocks" className="text-xs text-primary-600 font-semibold hover:underline">
          Tüm stok →
        </Link>
      </div>
    </div>
  )
}

function TeklifPanel({ proformas }: { proformas: Proforma[] }) {
  const active = proformas.filter(p => p.status === 'sent' || p.status === 'accepted')
  if (active.length === 0) return <PanelEmpty msg="Açık teklif yok" />
  return (
    <div>
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
          {active.map(p => (
            <tr key={p.id} className="hover:bg-gray-50/60">
              <td className="px-4 py-2.5">
                <Link href={`/dashboard/proformas/${p.id}`}
                  className="font-semibold text-gray-800 hover:text-primary-600 truncate block max-w-[200px]">
                  {p.customer_name ?? '—'}
                </Link>
              </td>
              <td className="px-4 py-2.5"><PfBadge status={p.status} /></td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-700">
                {fmt(Number(p.total ?? 0))}
                <span className="text-[10px] text-gray-400 ml-1">{p.currency}</span>
              </td>
              <td className="px-4 py-2.5 text-right text-gray-400">{fmtDate(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-right">
        <Link href="/dashboard/proformas" className="text-xs text-primary-600 font-semibold hover:underline">
          Tüm teklifler →
        </Link>
      </div>
    </div>
  )
}

function SatisPanel({ proformas }: { proformas: Proforma[] }) {
  const converted = proformas.filter(p => p.status === 'converted')
  if (converted.length === 0) return <PanelEmpty msg="Henüz satışa dönmüş teklif yok" />
  const total = converted.reduce((s, p) => s + Number(p.total ?? 0), 0)
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2">Müşteri</th>
            <th className="text-right px-4 py-2">Tutar</th>
            <th className="text-right px-4 py-2">Para Birimi</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {converted.map(p => (
            <tr key={p.id} className="hover:bg-gray-50/60">
              <td className="px-4 py-2.5">
                <Link href={`/dashboard/proformas/${p.id}`}
                  className="font-semibold text-gray-800 hover:text-primary-600 truncate block max-w-[200px]">
                  {p.customer_name ?? '—'}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary-700">
                {fmt(Number(p.total ?? 0))}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{p.currency}</td>
              <td className="px-4 py-2.5 text-right text-gray-400">{fmtDate(p.updated_at)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200">
            <td className="px-4 py-2 text-xs font-bold text-gray-500">Toplam</td>
            <td className="px-4 py-2 text-right font-black tabular-nums text-primary-700">{fmt(total)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <div className="px-4 py-2 text-right">
        <Link href="/dashboard/sales" className="text-xs text-primary-600 font-semibold hover:underline">
          Tüm satışlar →
        </Link>
      </div>
    </div>
  )
}

function TahsilatPanel({ sales }: { sales: Sale[] }) {
  const unpaid = sales.filter(s => s.payment_status !== 'paid')
  const paid   = sales.filter(s => s.payment_status === 'paid')
  if (sales.length === 0) return <PanelEmpty msg="Satış kaydı yok" />
  return (
    <div>
      {/* Summary pills */}
      <div className="flex gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 bg-amber-400 rounded-full" />
          <span className="text-xs font-bold text-amber-700">{unpaid.length} bekliyor</span>
          <span className="text-xs tabular-nums text-amber-600 font-black ml-1">
            {fmt(unpaid.reduce((s, r) => s + Number(r.total_try ?? 0), 0))}
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-50 rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 bg-emerald-400 rounded-full" />
          <span className="text-xs font-bold text-emerald-700">{paid.length} tahsil</span>
          <span className="text-xs tabular-nums text-emerald-600 font-black ml-1">
            {fmt(paid.reduce((s, r) => s + Number(r.total_try ?? 0), 0))}
          </span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2">Müşteri</th>
            <th className="text-left px-4 py-2">Ödeme</th>
            <th className="text-right px-4 py-2">Tutar (TL)</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sales.slice(0, 15).map(s => (
            <tr key={s.id} className="hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-800">{s.customer_name ?? '—'}</td>
              <td className="px-4 py-2.5"><PayBadge status={s.payment_status} /></td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-700">
                {fmt(Number(s.total_try ?? 0))}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-400">{fmtDate(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 flex items-center justify-between">
        {sales.length > 15 && (
          <span className="text-[10px] text-gray-400">İlk 15 gösteriliyor</span>
        )}
        <Link href="/dashboard/collections" className="text-xs text-primary-600 font-semibold hover:underline ml-auto">
          Tahsilat sayfasına git →
        </Link>
      </div>
    </div>
  )
}

function KarPanel({ sales }: { sales: Sale[] }) {
  if (sales.length === 0) return <PanelEmpty msg="Satış kaydı yok" />
  const withProfit = sales
    .map(s => ({
      ...s,
      profit: Number(s.total_try ?? 0) - Number(s.cost_try ?? 0),
    }))
    .sort((a, b) => b.profit - a.profit)

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const totalCogs    = sales.reduce((s, r) => s + Number(r.cost_try ?? 0), 0)
  const grossProfit  = totalRevenue - totalCogs
  const margin       = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  return (
    <div>
      {/* Summary bar */}
      <div className="flex gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-500">Ciro</span>
          <span className="text-xs font-black tabular-nums text-gray-800">{fmt(totalRevenue)}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-500">SMM</span>
          <span className="text-xs font-black tabular-nums text-red-600">{fmt(totalCogs)}</span>
        </div>
        <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
          grossProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'
        }`}>
          <span className="text-xs text-gray-500">Brüt Kâr</span>
          <span className={`text-xs font-black tabular-nums ${grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {fmt(grossProfit)}
          </span>
          <span className="text-[10px] text-gray-400">%{margin.toFixed(1)}</span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2">Müşteri</th>
            <th className="text-right px-4 py-2">Ciro</th>
            <th className="text-right px-4 py-2">SMM</th>
            <th className="text-right px-4 py-2">Brüt Kâr</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {withProfit.slice(0, 10).map(s => (
            <tr key={s.id} className="hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-800 truncate max-w-[160px]">{s.customer_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(Number(s.total_try ?? 0))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(Number(s.cost_try ?? 0))}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                s.profit >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}>
                {fmt(s.profit)}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-400">{fmtDate(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-right">
        <Link href="/dashboard/analytics" className="text-xs text-primary-600 font-semibold hover:underline">
          Detaylı analiz →
        </Link>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalesFlowPage() {
  const supabase = useSupabase()

  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<StageKey | null>(null)
  const [proformas, setProformas] = useState<Proforma[]>([])
  const [sales,     setSales]     = useState<Sale[]>([])
  const [stockLots, setStockLots] = useState<StockLot[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const uid = user.id
    const companyId = await resolveCompanyId(uid, supabase)

    const [pRes, sRes, stRes] = await Promise.all([
      supabase
        .from('proformas')
        .select('id, customer_name, status, total, currency, created_at, updated_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100),

      supabase
        .from('sales')
        .select('id, customer_name, total_try, cogs, payment_status, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200),

      supabase
        .from('stock_lots')
        .select('qty_remaining, entry_cost_try, product_name, lot_no, created_at')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0),
    ])

    setProformas((pRes.data ?? []) as Proforma[])
    setSales(
      (sRes.data ?? []).map(r => ({
        ...r,
        // Supabase returns cogs; alias it to cost_try for our use
        cost_try: Number((r as Record<string, unknown>).cogs ?? 0),
      })) as Sale[],
    )
    setStockLots((stRes.data ?? []) as StockLot[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Derived values ──────────────────────────────────────────────────────────

  const byStatus = (s: ProformaStatus) => proformas.filter(p => p.status === s)
  const drafts    = byStatus('draft')
  const sent      = byStatus('sent')
  const accepted  = byStatus('accepted')
  const converted = byStatus('converted')
  const rejected  = byStatus('rejected')

  const sumTotal = (rows: Proforma[]) => rows.reduce((s, p) => s + Number(p.total ?? 0), 0)

  const stockValue    = stockLots.reduce((s, l) => s + l.qty_remaining * l.entry_cost_try, 0)
  const pipelineValue = sumTotal(sent) + sumTotal(accepted)
  const totalRevenue  = sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const totalCogs     = sales.reduce((s, r) => s + Number(r.cost_try ?? 0), 0)
  const grossProfit   = totalRevenue - totalCogs
  const grossMargin   = totalRevenue > 0 ? grossProfit / totalRevenue : 0
  const paidSales     = sales.filter(s => s.payment_status === 'paid')
  const unpaidTotal   = sales
    .filter(s => s.payment_status !== 'paid')
    .reduce((s, r) => s + Number(r.total_try ?? 0), 0)

  // ── Stage click toggle ──────────────────────────────────────────────────────

  function toggle(key: StageKey) {
    setSelected(prev => prev === key ? null : key)
  }

  // ── Detail panel renderer ───────────────────────────────────────────────────

  function DetailPanel() {
    if (!selected) return null
    const panels: Record<StageKey, ReactNode> = {
      stok:      <StokPanel lots={stockLots} />,
      teklif:    <TeklifPanel proformas={proformas} />,
      satis:     <SatisPanel proformas={proformas} />,
      tahsilat:  <TahsilatPanel sales={sales} />,
      kar:       <KarPanel sales={sales} />,
    }
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            {{
              stok: 'Stok Detayı',
              teklif: 'Açık Teklifler',
              satis: 'Satışa Dönen Teklifler',
              tahsilat: 'Tahsilat Durumu',
              kar: 'Kâr Analizi',
            }[selected]}
          </span>
          <button
            onClick={() => setSelected(null)}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
          >
            ×
          </button>
        </div>
        {panels[selected]}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Satış Akışı</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? 'Yükleniyor…' : 'Her aşamaya tıklayarak detayları görün'}
          </p>
        </div>
        <Link
          href="/dashboard/proformas/new"
          className="text-sm font-bold bg-primary-600 text-white px-4 py-2 rounded-xl hover:bg-primary-700 transition-colors"
        >
          + Yeni Proforma
        </Link>
      </div>

      {/* Pipeline stages */}
      <div className="flex items-stretch gap-1">

        <Stage
          stageKey="stok"
          step="1. Stok"
          label="Envanter"
          count={stockLots.length}
          value={stockValue}
          color="bg-gray-50 border-gray-200 text-gray-800"
          sub="FIFO maliyet"
          selected={selected === 'stok'}
          onClick={() => toggle('stok')}
        />

        <div className="flex items-center self-center text-gray-300 text-xl font-black select-none px-0.5">→</div>

        <Stage
          stageKey="teklif"
          step="2. Teklif"
          label="Açık Teklifler"
          count={sent.length + accepted.length}
          value={pipelineValue}
          color="bg-blue-50 border-blue-200 text-blue-900"
          sub="gönderildi + onay"
          selected={selected === 'teklif'}
          onClick={() => toggle('teklif')}
        />

        <div className="flex items-center self-center text-gray-300 text-xl font-black select-none px-0.5">→</div>

        <Stage
          stageKey="satis"
          step="3. Satış"
          label="Faturalanan"
          count={converted.length}
          value={sumTotal(converted)}
          color="bg-primary-50 border-primary-200 text-primary-900"
          sub="proforma → satış"
          selected={selected === 'satis'}
          onClick={() => toggle('satis')}
        />

        <div className="flex items-center self-center text-gray-300 text-xl font-black select-none px-0.5">→</div>

        <Stage
          stageKey="tahsilat"
          step="4. Tahsilat"
          label="Nakit Girişi"
          count={sales.length}
          value={totalRevenue}
          color={unpaidTotal > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-teal-50 border-teal-200 text-teal-900'}
          sub={unpaidTotal > 0 ? `${fmt(unpaidTotal)} bekliyor` : 'Tahsilat güncel'}
          selected={selected === 'tahsilat'}
          onClick={() => toggle('tahsilat')}
        />

        <div className="flex items-center self-center text-gray-300 text-xl font-black select-none px-0.5">→</div>

        <Stage
          stageKey="kar"
          step="5. Kâr"
          label="Brüt Kâr"
          count={sales.length}
          value={grossProfit}
          color={grossProfit >= 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-red-50 border-red-200 text-red-900'}
          sub={`%${(grossMargin * 100).toFixed(1)} marj`}
          selected={selected === 'kar'}
          onClick={() => toggle('kar')}
        />

      </div>

      {/* Detail panel — expands when a stage is selected */}
      <DetailPanel />

      {/* Conversion rate strip */}
      {proformas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Dönüşüm Oranları
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: 'Taslak',       count: drafts.length,    color: 'text-gray-500'   },
              { label: 'Gönderildi',   count: sent.length,      color: 'text-blue-600'   },
              { label: 'Onaylandı',    count: accepted.length,  color: 'text-emerald-600' },
              { label: 'Satışa Döndü', count: converted.length, color: 'text-primary-600' },
            ].map(c => (
              <button
                key={c.label}
                onClick={() => c.label === 'Gönderildi' || c.label === 'Onaylandı' ? toggle('teklif')
                  : c.label === 'Satışa Döndü' ? toggle('satis') : undefined}
                className="focus:outline-none group"
                type="button"
              >
                <div className={`text-2xl font-black tabular-nums ${c.color} group-hover:underline`}>
                  {proformas.length > 0 ? `%${((c.count / proformas.length) * 100).toFixed(0)}` : '—'}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">{c.label}</div>
                <div className="text-[10px] text-gray-300">{c.count} adet</div>
              </button>
            ))}
          </div>
          {rejected.length > 0 && (
            <div className="mt-3 text-xs text-red-500 text-center">
              {rejected.length} teklif reddedildi ({((rejected.length / proformas.length) * 100).toFixed(0)}%)
            </div>
          )}
        </div>
      )}

      {/* Recent proformas table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-800">Son Teklifler</span>
          <Link href="/dashboard/proformas" className="text-xs text-primary-600 font-semibold hover:underline">
            Tümünü gör →
          </Link>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Yükleniyor…</div>
        ) : proformas.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            Henüz proforma yok —{' '}
            <Link href="/dashboard/proformas/new" className="text-primary-600 font-semibold hover:underline">
              ilk teklifi oluştur
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">
                <th className="text-left px-5 py-2">Müşteri</th>
                <th className="text-left px-3 py-2">Durum</th>
                <th className="text-right px-3 py-2">Tutar</th>
                <th className="text-right px-5 py-2">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {proformas.slice(0, 15).map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-2.5">
                    <Link href={`/dashboard/proformas/${p.id}`}
                      className="font-semibold text-gray-800 hover:text-primary-600 truncate max-w-[180px] block">
                      {p.customer_name ?? '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <PfBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-700">
                    {fmt(Number(p.total ?? 0))}
                    <span className="text-[10px] text-gray-400 ml-1">{p.currency}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-gray-400 tabular-nums">
                    {fmtDate(p.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
