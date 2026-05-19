'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
          <h1 className="text-xl font-black text-gray-900 tracking-tight">KDV Özeti</h1>
          <p className="text-xs text-gray-400 mt-0.5">Hesaplanan KDV − İndirilecek KDV = Net KDV</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs" />
          <span className="text-xs text-gray-400">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs" />
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
          <Link href="/dashboard/cfo" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← CFO</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-black">KDV Beyan Özeti</h1>
        <p className="text-sm text-gray-500">{from} — {to}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="bg-gray-100 rounded h-40 animate-pulse" />}

      {kdv && !loading && (
        <>
          {/* Main card */}
          <div className="bg-white border border-gray-100 rounded overflow-hidden shadow-sm">
            {/* Hesaplanan KDV (output) */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Hesaplanan KDV (Çıkış)</div>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Satış KDV (391)</span>
                <span className="tabular-nums text-sm font-black text-orange-600">{fmt(kdv.sales_vat_try)}</span>
              </div>
            </div>

            {/* İndirilecek KDV (input) */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 border-t border-gray-100">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">İndirilecek KDV (Giriş)</div>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Alış KDV (191)</span>
                <span className="tabular-nums text-sm font-semibold text-emerald-700">−{fmt(kdv.purchase_vat_try)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Gider KDV (191)</span>
                <span className="tabular-nums text-sm font-semibold text-emerald-700">−{fmt(kdv.expense_vat_try)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                <span className="text-xs font-semibold text-gray-700">Toplam İndirilecek KDV</span>
                <span className="tabular-nums text-sm font-black text-emerald-700">
                  {fmt(kdv.purchase_vat_try + kdv.expense_vat_try)}
                </span>
              </div>
            </div>

            {/* Net */}
            <div className={`px-4 py-4 border-t-2 ${kdv.vat_status === 'payable' ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-gray-900">Net KDV</div>
                  <div className={`text-[10px] font-semibold mt-0.5 ${kdv.vat_status === 'payable' ? 'text-orange-600' : 'text-emerald-600'}`}>
                    {kdv.vat_status === 'payable' ? '⬆ Ödenecek (beyan döneminde)' : '⬇ Sonraki döneme devir'}
                  </div>
                </div>
                <div className={`text-2xl font-black tabular-nums ${kdv.vat_status === 'payable' ? 'text-orange-700' : 'text-emerald-700'}`}>
                  {fmt(Math.abs(kdv.net_vat_try))}
                </div>
              </div>
            </div>
          </div>

          {/* Hesaplama özeti */}
          <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-xs text-blue-700 leading-relaxed">
            <span className="font-bold">KDV Formülü:</span>{' '}
            Hesaplanan KDV ({fmt(kdv.sales_vat_try)}) − İndirilecek KDV ({fmt(kdv.purchase_vat_try + kdv.expense_vat_try)}) ={' '}
            <span className="font-black">{fmt(Math.abs(kdv.net_vat_try))} {kdv.vat_status === 'payable' ? 'Ödenecek' : 'Devir'}</span>
          </div>
        </>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          KDV beyanı kurumlar vergisi ve satışlarla birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/cfo/tax/corporate" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Kurumlar Vergisi →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/commercial?tab=sales" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Satışlar →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/operations?tab=expenses" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Giderler →
          </Link>
        </div>
      </div>
    </div>
  )
}
