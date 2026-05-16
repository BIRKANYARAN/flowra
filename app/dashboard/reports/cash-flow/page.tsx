'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PrintButton } from '@/components/reports/PrintButton'

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

const _fmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmt(n: number) {
  const v = Number(n) || 0
  return (v < 0 ? '−' : '') + _fmt.format(Math.abs(v)) + ' TL'
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
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</span>
        <span className={`text-sm font-black tabular-nums ${
          total > 0 ? 'text-emerald-700' : total < 0 ? 'text-red-600' : 'text-gray-500'
        }`}>{fmt(total)}</span>
      </div>
      {children && <div className="px-4 py-2 divide-y divide-gray-50">{children}</div>}
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`tabular-nums text-xs font-semibold ${value >= 0 ? 'text-gray-700' : 'text-red-600'}`}>{fmt(value)}</span>
    </div>
  )
}

export default function CashFlowPage() {
  const [cf,      setCf]      = useState<CashFlowStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [from,    setFrom]    = useState(currentPeriod().from)
  const [to,      setTo]      = useState(currentPeriod().to)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/financial-statements/cash-flow?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => setCf(d as CashFlowStatement))
      .catch(() => setError('Nakit akışı yüklenemedi'))
      .finally(() => setLoading(false))
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
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
          <span className="text-xs text-gray-400">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
          <PrintButton label="PDF İndir" />
          <Link href="/dashboard/cfo" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← CFO</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-black">Nakit Akış Tablosu</h1>
        <p className="text-sm text-gray-500">{from} — {to}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="bg-gray-100 rounded-xl h-64 animate-pulse" />}

      {cf && !loading && (
        <>
          {/* Opening balance */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
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
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Net Nakit Değişim</div>
              <div className={`text-lg font-black tabular-nums ${cf.net_change_try >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmt(cf.net_change_try)}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Dönem Sonu Nakit</div>
              <div className="text-lg font-black tabular-nums text-gray-900">{fmt(cf.closing_balance_try)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Faaliyet Nakit</div>
              <div className={`text-lg font-black tabular-nums ${cf.operating.net_operating_try >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmt(cf.operating.net_operating_try)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
