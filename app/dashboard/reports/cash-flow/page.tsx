'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PdfExportButton } from '@/components/reports/PdfExportButton'
import { useWorkspace }    from '@/lib/workspace-context'
import type { PdfReportOptions } from '@/lib/utils/pdf-report'
import { formatTRY as fmt } from '@/lib/format'

// Mirrors CashFlowStatement returned by CashFlowStatementService.compute()
interface CFLine { label: string; amount: number }

interface CashFlowStatement {
  period: { from: string; to: string }
  operating: {
    net_income_try:         number
    receivables_change_try: number
    inventory_change_try:   number
    payables_change_try:    number
    other_adjustments:      CFLine[]
    net_operating_try:      number
  }
  investing: {
    equipment_purchases_try: number
    other:                   CFLine[]
    net_investing_try:       number
  }
  financing: {
    partner_loans_received_try: number
    partner_loans_repaid_try:   number
    dividends_paid_try:         number
    capital_injected_try:       number
    other:                      CFLine[]
    net_financing_try:          number
  }
  net_change_try:      number
  opening_balance_try: number
  closing_balance_try: number
}

function currentPeriod() {
  const now  = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to   = now.toISOString().slice(0, 10)
  return { from, to }
}

function CFSection({ title, total, children }: {
  title: string; total: number; children?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</span>
        <span className={`text-sm font-black tabular-nums ${
          total > 0 ? 'text-pos-text' : total < 0 ? 'text-neg' : 'text-gray-500'
        }`}>{fmt(total)}</span>
      </div>
      {children && <div className="px-4 py-2 divide-y divide-[#f1f5f9]">{children}</div>}
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`tabular-nums text-xs font-semibold ${value >= 0 ? 'text-gray-700' : 'text-neg'}`}>{fmt(value)}</span>
    </div>
  )
}

export default function CashFlowPage() {
  const [cf,      setCf]      = useState<CashFlowStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [from,    setFrom]    = useState(currentPeriod().from)
  const [to,      setTo]      = useState(currentPeriod().to)
  const ws = useWorkspace()

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/financial-statements/cash-flow?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setCf(d as CashFlowStatement))
      .catch(err => { if (err.name !== 'AbortError') setError('Nakit akışı yüklenemedi') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [from, to])

  return (
    <div className="flex flex-col gap-4 max-w-2xl print:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Nakit Akış Tablosu</h1>
          <p className="text-xs text-gray-400 mt-0.5">Faaliyet / Yatırım / Finansman</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-[#e2e8f0] rounded px-2 py-1 text-xs" />
          <span className="text-xs text-gray-400">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-[#e2e8f0] rounded px-2 py-1 text-xs" />
          {cf && (
            <PdfExportButton label="PDF İndir" opts={{
              companyName: ws.companyName ?? 'Şirket',
              reportTitle: 'Nakit Akış Tablosu',
              subtitle:    `${from} — ${to}`,
              filename:    `nakit-akis-${from}-${to}`,
              sections: [
                { title: 'Faaliyet Nakit Akışı', rows: [
                  { label: 'Dönem Başı Nakit',        value: fmt(cf.opening_balance_try) },
                  { label: 'Alacak Değişimi',         value: fmt(cf.operating.receivables_change_try), indent: true },
                  { label: 'Stok Değişimi',           value: fmt(cf.operating.inventory_change_try), indent: true },
                  { label: 'Borç Değişimi',           value: fmt(cf.operating.payables_change_try), indent: true },
                  { label: 'Net Faaliyet Nakit',      value: fmt(cf.operating.net_operating_try), bold: true,
                    tone: cf.operating.net_operating_try >= 0 ? 'positive' : 'negative' },
                ]},
                { title: 'Yatırım & Finansman', rows: [
                  { label: 'Ekipman Alımları',        value: fmt(-cf.investing.equipment_purchases_try), indent: true, tone: 'negative' },
                  { label: 'Net Yatırım',             value: fmt(cf.investing.net_investing_try), bold: true,
                    tone: cf.investing.net_investing_try >= 0 ? 'positive' : 'negative' },
                  { label: 'Ortak Borç Girişi',       value: fmt(cf.financing.partner_loans_received_try), indent: true },
                  { label: 'Ortak Borç Ödemesi',      value: fmt(cf.financing.partner_loans_repaid_try), indent: true },
                  { label: 'Temettü Ödemeleri',       value: fmt(cf.financing.dividends_paid_try), indent: true, tone: 'negative' },
                  { label: 'Net Finansman',           value: fmt(cf.financing.net_financing_try), bold: true,
                    tone: cf.financing.net_financing_try >= 0 ? 'positive' : 'negative' },
                ]},
                { title: 'Özet', rows: [
                  { label: 'Net Nakit Değişim',       value: fmt(cf.net_change_try), bold: true,
                    tone: cf.net_change_try >= 0 ? 'positive' : 'negative' },
                  { label: 'Dönem Sonu Nakit',        value: fmt(cf.closing_balance_try), bold: true, tone: 'positive' },
                ]},
              ],
            } as PdfReportOptions} />
          )}
          <Link href="/dashboard/cfo" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← CFO</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-black">Nakit Akış Tablosu</h1>
        <p className="text-sm text-gray-500">{from} — {to}</p>
      </div>

      {error && <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg-text">{error}</div>}
      {loading && <div className="bg-gray-100 rounded h-64 animate-pulse" />}

      {cf && !loading && (
        <>
          {/* Opening balance */}
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Dönem Başı Nakit</span>
            <span className="tabular-nums text-sm font-black text-gray-900">{fmt(cf.opening_balance_try)}</span>
          </div>

          {/* Operating */}
          <CFSection title="Faaliyet Nakit Akışı" total={cf.operating.net_operating_try}>
            {cf.operating.other_adjustments.map((l, i) => (
              <Line key={i} label={l.label} value={l.amount} />
            ))}
            {cf.operating.receivables_change_try !== 0 && (
              <Line label="Alacak değişimi" value={cf.operating.receivables_change_try} />
            )}
            {cf.operating.inventory_change_try !== 0 && (
              <Line label="Stok değişimi" value={cf.operating.inventory_change_try} />
            )}
            {cf.operating.payables_change_try !== 0 && (
              <Line label="Borç değişimi" value={cf.operating.payables_change_try} />
            )}
          </CFSection>

          {/* Investing */}
          <CFSection title="Yatırım Nakit Akışı" total={cf.investing.net_investing_try}>
            {cf.investing.equipment_purchases_try !== 0 && (
              <Line label="Ekipman alımları" value={-cf.investing.equipment_purchases_try} />
            )}
            {cf.investing.other.map((l, i) => (
              <Line key={i} label={l.label} value={l.amount} />
            ))}
          </CFSection>

          {/* Financing */}
          <CFSection title="Finansman Nakit Akışı" total={cf.financing.net_financing_try}>
            {cf.financing.partner_loans_received_try !== 0 && (
              <Line label="Ortak borç girişi" value={cf.financing.partner_loans_received_try} />
            )}
            {cf.financing.partner_loans_repaid_try !== 0 && (
              <Line label="Ortak borç ödemesi" value={cf.financing.partner_loans_repaid_try} />
            )}
            {cf.financing.capital_injected_try !== 0 && (
              <Line label="Sermaye girişi" value={cf.financing.capital_injected_try} />
            )}
            {cf.financing.dividends_paid_try !== 0 && (
              <Line label="Temettü ödemeleri" value={cf.financing.dividends_paid_try} />
            )}
            {cf.financing.other.map((l, i) => (
              <Line key={i} label={l.label} value={l.amount} />
            ))}
          </CFSection>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Net Nakit Değişim</div>
              <div className={`text-lg font-black tabular-nums ${cf.net_change_try >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                {fmt(cf.net_change_try)}
              </div>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Dönem Sonu Nakit</div>
              <div className="text-lg font-black tabular-nums text-gray-900">{fmt(cf.closing_balance_try)}</div>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Faaliyet Nakit</div>
              <div className={`text-lg font-black tabular-nums ${cf.operating.net_operating_try >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                {fmt(cf.operating.net_operating_try)}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Nakit akışı bilanço ve P&amp;L ile birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=cashflow" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Nakit Projeksiyonu →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=balance" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Bilanço →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            P&amp;L →
          </Link>
        </div>
      </div>
    </div>
  )
}
