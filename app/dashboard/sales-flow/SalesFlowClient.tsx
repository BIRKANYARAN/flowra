'use client'

// ── SalesFlowClient — interactive pipeline stages + detail panels ─────────────
// Receives all data as props from the server component — no loading state.
// Only manages selected stage (UI toggle). No API calls, no mutations.

import { useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { fmtTRY as fmt } from '@/lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProformaStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'
export type StageKey = 'stok' | 'teklif' | 'satis' | 'tahsilat' | 'kar'

export interface StockLot {
  qty_remaining:   number
  cost_price_try?: number | null
  /** Legacy alias kept for backward compat — prefer cost_price_try */
  entry_cost_try?: number | null
  product_name?:   string | null
  lot_no?:         string | null
  created_at?:     string | null
}

export interface Proforma {
  id:            string
  customer_name: string | null
  status:        ProformaStatus
  total:         number | null
  currency:      string | null
  created_at:    string | null
  updated_at:    string | null
}

export interface Sale {
  id:             string
  customer_name:  string | null
  total_try:      number | null
  cost_try:       number | null
  payment_status: string | null
  /** Business invoice date (YYYY-MM-DD) — preferred for display */
  sale_date:      string | null
  /** DB insertion timestamp — kept for backward compat */
  created_at:     string | null
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

// ── Badge maps ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProformaStatus, string> = {
  draft: 'Taslak', sent: 'Gönderildi', accepted: 'Onaylandı',
  rejected: 'Reddedildi', converted: 'Satışa Döndü',
}
const STATUS_COLOR: Record<ProformaStatus, string> = {
  draft:     'bg-[#f1f5f9] text-[#64748b]',
  sent:      'bg-info-light text-info-text',
  accepted:  'bg-pos-light text-pos-text',
  rejected:  'bg-neg-light text-neg',
  converted: 'bg-brand-subtle text-brand',
}
const PAYMENT_COLOR: Record<string, string> = {
  pending: 'bg-warn-light text-warn-text', paid: 'bg-pos-light text-pos-text',
  partial: 'bg-yellow-100 text-yellow-700', overdue: 'bg-neg-light text-neg',
  cancelled: 'bg-[#f1f5f9] text-[#64748b]',
}
const PAYMENT_LABEL: Record<string, string> = {
  pending: 'Bekliyor', paid: 'Ödendi', partial: 'Kısmi', overdue: 'Gecikmiş', cancelled: 'İptal',
}

function PfBadge({ status }: { status: string }) {
  const s = status as ProformaStatus
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_COLOR[s] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
      {STATUS_LABEL[s] ?? status}
    </span>
  )
}

function PayBadge({ status }: { status: string | null }) {
  const s = status ?? 'pending'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${PAYMENT_COLOR[s] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
      {PAYMENT_LABEL[s] ?? s}
    </span>
  )
}

// ── Stage card ────────────────────────────────────────────────────────────────

function Stage({ stageKey, step, label, count, value, color, sub, selected, onClick }: {
  stageKey: StageKey; step: string; label: string; count: number; value: number
  color: string; sub?: string; selected: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 min-w-0 text-left transition-all group focus:outline-none ${selected ? 'scale-[1.02]' : ''}`}>
      <div className={`border-2 rounded px-4 py-4 h-full transition-all ${color} ${
        selected ? 'shadow-sm ring-2 ring-offset-1 ring-brand/30' : 'group-hover:shadow-sm group-hover:border-[#e8eaef]'
      }`}>
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">{step}</div>
        <div className="font-black text-base leading-tight mb-2">{label}</div>
        <div className="text-2xl font-extrabold tabular-nums leading-none mb-1">{fmt(value)}</div>
        <div className="text-xs opacity-70">{count} kayıt{sub ? ` · ${sub}` : ''}</div>
        <div className={`text-[10px] font-bold mt-2 opacity-0 group-hover:opacity-100 transition-opacity ${selected ? '!opacity-100' : ''}`}>
          {selected ? '▲ Gizle' : '▼ Detay'}
        </div>
      </div>
    </button>
  )
}

// ── Detail panels ─────────────────────────────────────────────────────────────

function PanelEmpty({ msg }: { msg: string }) {
  return <div className="py-6 text-center text-sm text-[#94a3b8]">{msg}</div>
}

function StokPanel({ lots }: { lots: StockLot[] }) {
  if (lots.length === 0) return <PanelEmpty msg="Stok kaydı yok" />
  const total = lots.reduce((s, l) => s + l.qty_remaining * Number(l.cost_price_try ?? l.entry_cost_try ?? 0), 0)
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-[#94a3b8] border-b border-[#e8eaef]">
            <th className="text-left px-4 py-2">Lot / Ürün</th>
            <th className="text-right px-4 py-2">Adet</th>
            <th className="text-right px-4 py-2">Birim Maliyet</th>
            <th className="text-right px-4 py-2">Toplam</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {lots.map((l, i) => (
            <tr key={i} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2.5 text-[#334155] font-medium">
                {l.product_name ?? (l.lot_no ? `Lot ${l.lot_no}` : `#${i + 1}`)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{l.qty_remaining.toLocaleString('tr-TR')}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#64748b]">{fmt(Number(l.cost_price_try ?? l.entry_cost_try ?? 0))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#1e293b]">{fmt(l.qty_remaining * Number(l.cost_price_try ?? l.entry_cost_try ?? 0))}</td>
              <td className="px-4 py-2.5 text-right text-[#94a3b8]">{fmtDate(l.created_at ?? null)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#e8eaef]">
            <td className="px-4 py-2 text-xs font-bold text-[#64748b]" colSpan={3}>Toplam FIFO maliyet</td>
            <td className="px-4 py-2 text-right font-extrabold tabular-nums text-[#0f172a]">{fmt(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <div className="px-4 py-2 text-right">
        <Link href="/dashboard/operations?tab=stock" className="text-xs text-brand-light font-semibold hover:underline">Tüm stok →</Link>
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
          <tr className="text-[10px] font-bold uppercase text-[#94a3b8] border-b border-[#e8eaef]">
            <th className="text-left px-4 py-2">Müşteri</th>
            <th className="text-left px-4 py-2">Durum</th>
            <th className="text-right px-4 py-2">Tutar</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {active.map(p => (
            <tr key={p.id} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2.5">
                <Link href={`/dashboard/proformas/${p.id}`}
                  className="font-semibold text-[#1e293b] hover:text-brand-light truncate block max-w-[200px]">
                  {p.customer_name ?? '—'}
                </Link>
              </td>
              <td className="px-4 py-2.5"><PfBadge status={p.status} /></td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#334155]">
                {fmt(Number(p.total ?? 0))}<span className="text-[10px] text-[#94a3b8] ml-1">{p.currency}</span>
              </td>
              <td className="px-4 py-2.5 text-right text-[#94a3b8]">{fmtDate(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-right">
        <Link href="/dashboard/commercial?tab=teklifler" className="text-xs text-brand-light font-semibold hover:underline">Tüm teklifler →</Link>
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
          <tr className="text-[10px] font-bold uppercase text-[#94a3b8] border-b border-[#e8eaef]">
            <th className="text-left px-4 py-2">Müşteri</th>
            <th className="text-right px-4 py-2">Tutar</th>
            <th className="text-right px-4 py-2">Para Birimi</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {converted.map(p => (
            <tr key={p.id} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2.5">
                <Link href={`/dashboard/proformas/${p.id}`}
                  className="font-semibold text-[#1e293b] hover:text-brand-light truncate block max-w-[200px]">
                  {p.customer_name ?? '—'}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-brand">{fmt(Number(p.total ?? 0))}</td>
              <td className="px-4 py-2.5 text-right text-[#94a3b8] text-xs">{p.currency}</td>
              <td className="px-4 py-2.5 text-right text-[#94a3b8]">{fmtDate(p.updated_at)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#e8eaef]">
            <td className="px-4 py-2 text-xs font-bold text-[#64748b]">Toplam</td>
            <td className="px-4 py-2 text-right font-extrabold tabular-nums text-brand">{fmt(total)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <div className="px-4 py-2 text-right">
        <Link href="/dashboard/commercial?tab=sales" className="text-xs text-brand-light font-semibold hover:underline">Tüm satışlar →</Link>
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
      <div className="flex gap-3 px-4 py-3 border-b border-[#e8eaef]">
        <div className="flex items-center gap-1.5 bg-warn-light rounded px-3 py-1.5">
          <span className="w-2 h-2 bg-warn rounded-full" />
          <span className="text-xs font-bold text-warn-text">{unpaid.length} bekliyor</span>
          <span className="text-xs tabular-nums text-warn-text font-black ml-1">
            {fmt(unpaid.reduce((s, r) => s + Number(r.total_try ?? 0), 0))}
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-pos-light rounded px-3 py-1.5">
          <span className="w-2 h-2 bg-pos rounded-full" />
          <span className="text-xs font-bold text-pos-text">{paid.length} tahsil</span>
          <span className="text-xs tabular-nums text-pos-text font-black ml-1">
            {fmt(paid.reduce((s, r) => s + Number(r.total_try ?? 0), 0))}
          </span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-[#94a3b8] border-b border-[#e8eaef]">
            <th className="text-left px-4 py-2">Müşteri</th>
            <th className="text-left px-4 py-2">Ödeme</th>
            <th className="text-right px-4 py-2">Tutar (TL)</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {sales.slice(0, 15).map(s => (
            <tr key={s.id} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2.5 max-w-[180px]">
                <span className="block font-medium text-[#1e293b] truncate">{s.customer_name ?? '—'}</span>
              </td>
              <td className="px-4 py-2.5"><PayBadge status={s.payment_status} /></td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#334155]">{fmt(Number(s.total_try ?? 0))}</td>
              <td className="px-4 py-2.5 text-right text-[#94a3b8]">{fmtDate(s.sale_date ?? s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 flex items-center justify-between">
        {sales.length > 15 && <span className="text-[10px] text-[#94a3b8]">İlk 15 gösteriliyor</span>}
        <Link href="/dashboard/commercial?tab=collections" className="text-xs text-brand-light font-semibold hover:underline ml-auto">
          Tahsilat sayfasına git →
        </Link>
      </div>
    </div>
  )
}

function KarPanel({ sales }: { sales: Sale[] }) {
  if (sales.length === 0) return <PanelEmpty msg="Satış kaydı yok" />
  const withProfit = sales
    .map(s => ({ ...s, profit: Number(s.total_try ?? 0) - Number(s.cost_try ?? 0) }))
    .sort((a, b) => b.profit - a.profit)
  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const totalCogs    = sales.reduce((s, r) => s + Number(r.cost_try ?? 0), 0)
  const grossProfit  = totalRevenue - totalCogs
  const margin       = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
  return (
    <div>
      <div className="flex gap-3 px-4 py-3 border-b border-[#e8eaef]">
        <div className="flex items-center gap-1.5 bg-[#f8fafc] rounded px-3 py-1.5">
          <span className="text-xs text-[#64748b]">Ciro</span>
          <span className="text-xs font-extrabold tabular-nums text-[#1e293b]">{fmt(totalRevenue)}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-[#f8fafc] rounded px-3 py-1.5">
          <span className="text-xs text-[#64748b]">SMM</span>
          <span className="text-xs font-extrabold tabular-nums text-neg">{fmt(totalCogs)}</span>
        </div>
        <div className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${grossProfit >= 0 ? 'bg-pos-light' : 'bg-neg-light'}`}>
          <span className="text-xs text-[#64748b]">Brüt Kâr</span>
          <span className={`text-xs font-extrabold tabular-nums ${grossProfit >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmt(grossProfit)}</span>
          <span className="text-[10px] text-[#94a3b8]">%{margin.toFixed(1)}</span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-[#94a3b8] border-b border-[#e8eaef]">
            <th className="text-left px-4 py-2">Müşteri</th>
            <th className="text-right px-4 py-2">Ciro</th>
            <th className="text-right px-4 py-2">SMM</th>
            <th className="text-right px-4 py-2">Brüt Kâr</th>
            <th className="text-right px-4 py-2">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {withProfit.slice(0, 10).map(s => (
            <tr key={s.id} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2.5 max-w-[160px]">
                <span className="block font-medium text-[#1e293b] truncate">{s.customer_name ?? '—'}</span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#334155]">{fmt(Number(s.total_try ?? 0))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#64748b]">{fmt(Number(s.cost_try ?? 0))}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${s.profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmt(s.profit)}</td>
              <td className="px-4 py-2.5 text-right text-[#94a3b8]">{fmtDate(s.sale_date ?? s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-right">
        <Link href="/dashboard/finance?tab=quarterly" className="text-xs text-brand-light font-semibold hover:underline">Detaylı analiz →</Link>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialProformas: Proforma[]
  initialSales:     Sale[]
  initialStockLots: StockLot[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesFlowClient({ initialProformas, initialSales, initialStockLots }: Props) {
  const [selected, setSelected] = useState<StageKey | null>(null)

  const proformas = initialProformas
  const sales     = initialSales
  const stockLots = initialStockLots

  function toggle(key: StageKey) { setSelected(prev => prev === key ? null : key) }

  // ── Derived values ────────────────────────────────────────────────────────────
  const byStatus     = (s: ProformaStatus) => proformas.filter(p => p.status === s)
  const drafts       = byStatus('draft')
  const sent         = byStatus('sent')
  const accepted     = byStatus('accepted')
  const converted    = byStatus('converted')
  const rejected     = byStatus('rejected')
  const sumTotal     = (rows: Proforma[]) => rows.reduce((s, p) => s + Number(p.total ?? 0), 0)
  const stockValue   = stockLots.reduce((s, l) => s + l.qty_remaining * Number(l.cost_price_try ?? l.entry_cost_try ?? 0), 0)
  const pipelineVal  = sumTotal(sent) + sumTotal(accepted)
  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const totalCogs    = sales.reduce((s, r) => s + Number(r.cost_try ?? 0), 0)
  const grossProfit  = totalRevenue - totalCogs
  const grossMargin  = totalRevenue > 0 ? grossProfit / totalRevenue : 0
  const unpaidTotal  = sales.filter(s => s.payment_status !== 'paid').reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const collectedTotal = totalRevenue - unpaidTotal       // cash actually in (billed − outstanding)
  const hasCostData  = totalCogs > 0                       // no purchase/cost basis → margin is not "100%"

  // ── Detail panel ──────────────────────────────────────────────────────────────
  function DetailPanel() {
    if (!selected) return null
    const panels: Record<StageKey, ReactNode> = {
      stok:     <StokPanel lots={stockLots} />,
      teklif:   <TeklifPanel proformas={proformas} />,
      satis:    <SatisPanel proformas={proformas} />,
      tahsilat: <TahsilatPanel sales={sales} />,
      kar:      <KarPanel sales={sales} />,
    }
    const titles: Record<StageKey, string> = {
      stok: 'Stok Detayı', teklif: 'Açık Teklifler', satis: 'Satışa Dönen Teklifler',
      tahsilat: 'Tahsilat Durumu', kar: 'Kâr Analizi',
    }
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-2 border-b border-[#e8eaef] bg-[#f8fafc] flex items-center justify-between">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">{titles[selected]}</span>
          <button onClick={() => setSelected(null)} className="text-[#94a3b8] hover:text-[#334155] text-lg leading-none">×</button>
        </div>
        {panels[selected]}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">

      {/* ── Pipeline stages ─────────────────────────────────────────────── */}
      <div className="flex items-stretch gap-1">
        <Stage stageKey="stok" step="1. Stok" label="Envanter"
          count={stockLots.length} value={stockValue}
          color="bg-[#f8fafc] border-[#e8eaef] text-[#1e293b]" sub="FIFO maliyet"
          selected={selected === 'stok'} onClick={() => toggle('stok')} />
        <div className="flex items-center self-center text-[#cbd5e1] text-xl font-black select-none px-0.5">→</div>
        <Stage stageKey="teklif" step="2. Teklif" label="Açık Teklifler"
          count={sent.length + accepted.length} value={pipelineVal}
          color="bg-info-light border-info-light text-info-text" sub="gönderildi + onay"
          selected={selected === 'teklif'} onClick={() => toggle('teklif')} />
        <div className="flex items-center self-center text-[#cbd5e1] text-xl font-black select-none px-0.5">→</div>
        <Stage stageKey="satis" step="3. Satış" label="Faturalanan"
          count={converted.length} value={sumTotal(converted)}
          color="bg-brand-subtle border-[#e8eaef] text-brand" sub="proforma → satış"
          selected={selected === 'satis'} onClick={() => toggle('satis')} />
        <div className="flex items-center self-center text-[#cbd5e1] text-xl font-black select-none px-0.5">→</div>
        <Stage stageKey="tahsilat" step="4. Tahsilat" label="Nakit Girişi"
          count={sales.length} value={collectedTotal}
          color={unpaidTotal > 0 ? 'bg-warn-light border-warn-light text-warn-text' : 'bg-teal-50 border-teal-200 text-teal-900'}
          sub={unpaidTotal > 0 ? `${fmt(unpaidTotal)} bekliyor` : 'Tahsilat güncel'}
          selected={selected === 'tahsilat'} onClick={() => toggle('tahsilat')} />
        <div className="flex items-center self-center text-[#cbd5e1] text-xl font-black select-none px-0.5">→</div>
        <Stage stageKey="kar" step="5. Kâr" label="Brüt Kâr"
          count={sales.length} value={grossProfit}
          color={grossProfit >= 0 ? 'bg-pos-light border-pos-light text-pos-text' : 'bg-neg-light border-neg-light text-neg-text'}
          sub={hasCostData ? `%${(grossMargin * 100).toFixed(1)} marj` : 'maliyet girilmedi'}
          selected={selected === 'kar'} onClick={() => toggle('kar')} />
      </div>

      {/* ── Expandable detail panel ──────────────────────────────────────── */}
      <DetailPanel />

      {/* ── Conversion rate strip ────────────────────────────────────────── */}
      {proformas.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-5 py-3">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">Dönüşüm Oranları</div>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: 'Taslak',       count: drafts.length,    color: 'text-[#64748b]',    stage: null         },
              { label: 'Gönderildi',   count: sent.length,      color: 'text-info-text',    stage: 'teklif' as StageKey },
              { label: 'Onaylandı',    count: accepted.length,  color: 'text-pos-text', stage: 'teklif' as StageKey },
              { label: 'Satışa Döndü', count: converted.length, color: 'text-brand-light', stage: 'satis'  as StageKey },
            ].map(c => (
              <button key={c.label} onClick={() => c.stage && toggle(c.stage)}
                className="focus:outline-none group" type="button">
                <div className={`text-2xl font-extrabold tabular-nums ${c.color} group-hover:underline`}>
                  {`%${((c.count / proformas.length) * 100).toFixed(0)}`}
                </div>
                <div className="text-[11px] text-[#94a3b8] mt-0.5">{c.label}</div>
                <div className="text-[10px] text-[#cbd5e1]">{c.count} adet</div>
              </button>
            ))}
          </div>
          {rejected.length > 0 && (
            <div className="mt-3 text-xs text-neg text-center">
              {rejected.length} teklif reddedildi ({((rejected.length / proformas.length) * 100).toFixed(0)}%)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
