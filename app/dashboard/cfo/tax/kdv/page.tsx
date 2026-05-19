'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Skeleton } from '@/components/ds'
import { PdfExportButton } from '@/components/reports/PdfExportButton'
import { formatTRY as fmt } from '@/lib/format'

interface KdvSummary {
  sales_vat_try:    number
  purchase_vat_try: number
  expense_vat_try:  number
  net_vat_try:      number
  vat_status:       'payable' | 'carry_forward'
}

interface TaxApiRes {
  vat: {
    sales_vat:    number
    purchase_vat: number
    expense_vat:  number
    net_vat:      number
  }
}

function currentPeriod() {
  const now  = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to   = now.toISOString().slice(0, 10)
  return { from, to }
}

export default function KdvPage() {
  const [kdv,     setKdv]     = useState<KdvSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [from,    setFrom]    = useState(currentPeriod().from)
  const [to,      setTo]      = useState(currentPeriod().to)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/tax-summary?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((d: TaxApiRes) => setKdv({
        sales_vat_try:    d.vat.sales_vat,
        purchase_vat_try: d.vat.purchase_vat,
        expense_vat_try:  d.vat.expense_vat,
        net_vat_try:      d.vat.net_vat,
        vat_status:       d.vat.net_vat > 0 ? 'payable' : 'carry_forward',
      }))
      .catch(err => { if (err.name !== 'AbortError') setError('KDV verileri yüklenemedi') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [from, to])

  return (
    <div className="flex flex-col gap-4 max-w-2xl print:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-black text-[#0f172a] tracking-tight">KDV Özeti</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">Hesaplanan KDV − İndirilecek KDV = Net KDV</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-[#e2e8f0] rounded px-2 py-1 text-xs" />
          <span className="text-xs text-[#94a3b8]">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-[#e2e8f0] rounded px-2 py-1 text-xs" />
          <PdfExportButton
            label="KDV PDF"
            opts={{
              companyName:  '',
              reportTitle:  'KDV Beyan Özeti',
              subtitle:     `${from} — ${to}`,
              sections: [{
                title: 'KDV Özeti',
                rows: [
                  { label: 'Satış KDV (Hesaplanan — 391)',      value: fmt(kdv?.sales_vat_try ?? 0) },
                  { label: 'Alış KDV (İndirilecek — 191)',      value: fmt(kdv?.purchase_vat_try ?? 0) },
                  { label: 'Gider KDV (İndirilecek — 191)',     value: fmt(kdv?.expense_vat_try ?? 0) },
                  { label: 'Toplam İndirilecek KDV',            value: fmt((kdv?.purchase_vat_try ?? 0) + (kdv?.expense_vat_try ?? 0)) },
                  { label: `Net KDV (${kdv?.vat_status === 'payable' ? 'Ödenecek' : 'Sonraki Dönem Devir'})`, value: fmt(Math.abs(kdv?.net_vat_try ?? 0)), bold: true },
                ],
              }],
            }}
          />
          <Link href="/dashboard/cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">← CFO</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-black">KDV Beyan Özeti</h1>
        <p className="text-sm text-[#64748b]">{from} — {to}</p>
      </div>

      {error && <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg-text">{error}</div>}
      {loading && <Skeleton height="h-40" />}

      {kdv && !loading && (
        <>
          {/* Main card */}
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            {/* Hesaplanan KDV (output) */}
            <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hesaplanan KDV (Çıkış)</div>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748b]">Satış KDV (391)</span>
                <span className="tabular-nums text-sm font-black text-warn">{fmt(kdv.sales_vat_try)}</span>
              </div>
            </div>

            {/* İndirilecek KDV (input) */}
            <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0] border-t border-[#e2e8f0]">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">İndirilecek KDV (Giriş)</div>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748b]">Alış KDV (191)</span>
                <span className="tabular-nums text-sm font-semibold text-pos-text">−{fmt(kdv.purchase_vat_try)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748b]">Gider KDV (191)</span>
                <span className="tabular-nums text-sm font-semibold text-pos-text">−{fmt(kdv.expense_vat_try)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[#e2e8f0] pt-1.5">
                <span className="text-xs font-semibold text-[#334155]">Toplam İndirilecek KDV</span>
                <span className="tabular-nums text-sm font-black text-pos-text">
                  {fmt(kdv.purchase_vat_try + kdv.expense_vat_try)}
                </span>
              </div>
            </div>

            {/* Net */}
            <div className={`px-4 py-4 border-t-2 ${kdv.vat_status === 'payable' ? 'bg-warn-light border-warn/20' : 'bg-pos-light border-pos-light'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-[#0f172a]">Net KDV</div>
                  <div className={`text-[10px] font-semibold mt-0.5 ${kdv.vat_status === 'payable' ? 'text-warn' : 'text-pos-text'}`}>
                    {kdv.vat_status === 'payable' ? '⬆ Ödenecek (beyan döneminde)' : '⬇ Sonraki döneme devir'}
                  </div>
                </div>
                <div className={`text-2xl font-black tabular-nums ${kdv.vat_status === 'payable' ? 'text-warn-text' : 'text-pos-text'}`}>
                  {fmt(Math.abs(kdv.net_vat_try))}
                </div>
              </div>
            </div>
          </div>

          {/* Hesaplama özeti */}
          <div className="bg-info-light border border-info-light rounded px-4 py-3 text-xs text-info-text leading-relaxed">
            <span className="font-bold">KDV Formülü:</span>{' '}
            Hesaplanan KDV ({fmt(kdv.sales_vat_try)}) − İndirilecek KDV ({fmt(kdv.purchase_vat_try + kdv.expense_vat_try)}) ={' '}
            <span className="font-black">{fmt(Math.abs(kdv.net_vat_try))} {kdv.vat_status === 'payable' ? 'Ödenecek' : 'Devir'}</span>
          </div>
        </>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          KDV beyanı kurumlar vergisi ve satışlarla birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/cfo/tax/corporate" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Kurumlar Vergisi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=sales" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Satışlar →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/operations?tab=expenses" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Giderler →
          </Link>
        </div>
      </div>
    </div>
  )
}
