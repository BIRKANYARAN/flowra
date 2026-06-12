'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Skeleton, ErrorBanner } from '@/components/ds'
import { PdfExportButton } from '@/components/reports/PdfExportButton'
import { useWorkspace } from '@/lib/workspace-context'
import type { PdfReportOptions } from '@/lib/utils/pdf-report'
import { formatTRY as fmt } from '@/lib/format'
import { ChartCard, BarCompare, CHART } from '@/components/charts'

interface PnL {
  revenue_try:                 number
  cost_try:                    number
  gross_profit_try:            number
  expenses_total_try:          number
  deductible_expenses_try:     number
  non_deductible_expenses_try: number
  matrah_try:                  number
  corporate_tax_rate:          number
  corporate_tax_try:           number
  net_after_tax_try:           number
}

function pct(n: number, d: number) {
  if (!d) return '—'
  return ((n / d) * 100).toFixed(1) + '%'
}

function compactTRY(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return '₺' + (n / 1e9).toFixed(1).replace('.', ',') + 'Mr'
  if (a >= 1e6) return '₺' + (n / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return '₺' + (n / 1e3).toFixed(0) + 'B'
  return '₺' + Math.round(n).toLocaleString('tr-TR')
}

function currentPeriod() {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to   = now.toISOString().slice(0, 10)
  return { from, to }
}

function Row({ label, value, sub, bold, indent, positive, negative }: {
  label: string; value: string; sub?: string; bold?: boolean; indent?: boolean
  positive?: boolean; negative?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-[#f1f5f9] last:border-0 ${indent ? 'pl-6' : ''}`}>
      <div className="min-w-0">
        <span className={`text-xs ${bold ? 'font-black text-[#0f172a]' : 'font-medium text-[#64748b]'}`}>{label}</span>
        {sub && <span className="text-[10px] text-[#94a3b8] ml-2">{sub}</span>}
      </div>
      <span className={`tabular-nums text-sm shrink-0 ${bold ? 'font-black' : 'font-semibold'} ${
        positive ? 'text-pos-text' : negative ? 'text-neg' : 'text-[#0f172a]'
      }`}>{value}</span>
    </div>
  )
}

export default function IncomeStatementPage() {
  const [pnl,     setPnl]     = useState<PnL | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [from,    setFrom]    = useState(currentPeriod().from)
  const [to,      setTo]      = useState(currentPeriod().to)
  const ws = useWorkspace()

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/financial-summary?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setPnl(d as PnL))
      .catch(err => { if (err.name !== 'AbortError') setError('Veriler yüklenemedi') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [from, to])

  const grossMargin = pnl ? pct(pnl.gross_profit_try, pnl.revenue_try) : '—'
  const ebitda      = pnl ? pnl.gross_profit_try - pnl.expenses_total_try : 0
  const netMargin   = pnl ? pct(pnl.net_after_tax_try, pnl.revenue_try) : '—'

  // Build PDF opts when data is available
  const pdfOpts: PdfReportOptions | null = pnl ? {
    companyName:  ws.companyName ?? 'Şirket',
    reportTitle:  'Gelir Tablosu',
    subtitle:     `${from} — ${to}`,
    filename:     `gelir-tablosu-${from}-${to}`,
    sections: [{
      title: 'Gelir Tablosu',
      rows: [
        { label: 'Satış Gelirleri',            value: fmt(pnl.revenue_try),            bold: true, tone: 'positive' },
        { label: 'Satılan Malın Maliyeti',     value: fmt(pnl.cost_try),               indent: true, tone: 'negative' },
        { label: `Brüt Kâr (Marj: ${grossMargin})`, value: fmt(pnl.gross_profit_try), bold: true },
        { divider: true, label: '', value: '' },
        { label: 'Toplam Faaliyet Giderleri',  value: fmt(pnl.expenses_total_try),     indent: true, tone: 'negative' },
        { label: '— İndirilebilir',            value: fmt(pnl.deductible_expenses_try),     indent: true },
        { label: '— İndirilemez',              value: fmt(pnl.non_deductible_expenses_try), indent: true },
        { label: 'Faaliyet Kârı (EBIT)',        value: fmt(ebitda),                     bold: true, tone: ebitda >= 0 ? 'positive' : 'negative' },
        { divider: true, label: '', value: '' },
        { label: `KV Matrahı`,                 value: fmt(pnl.matrah_try),             indent: true },
        { label: `Kurumlar Vergisi (%${(pnl.corporate_tax_rate * 100).toFixed(0)})`, value: fmt(pnl.corporate_tax_try), indent: true, tone: 'negative' },
        { label: `Dönem Net Kârı (Marj: ${netMargin})`, value: fmt(pnl.net_after_tax_try), bold: true, tone: pnl.net_after_tax_try >= 0 ? 'positive' : 'negative' },
      ],
    }],
  } : null

  return (
    <div className="flex flex-col gap-4 max-w-2xl print:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Gelir Tablosu</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">Kâr / Zarar Özeti</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-[#e8eaef] rounded px-2 py-1 text-xs" />
          <span className="text-xs text-[#94a3b8]">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-[#e8eaef] rounded px-2 py-1 text-xs" />
          {pdfOpts && <PdfExportButton opts={pdfOpts} label="Dışa Aktar ↓" />}
          <Link href="/dashboard/finance" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">← Finans</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-black">Gelir Tablosu</h1>
        <p className="text-sm text-[#64748b]">{from} — {to}</p>
      </div>

      {error && <ErrorBanner msg={error} />}
      {loading && <Skeleton height="h-64" />}

      {/* Profit cascade — revenue → gross → EBIT → net, at a glance */}
      {pnl && !loading && (
        <ChartCard title="Kâr Şelalesi" subtitle="Gelirden net kâra" className="h-44 print:hidden">
          <BarCompare
            layout="horizontal"
            colorByPoint
            data={[
              { label: 'Net Kâr', value: pnl.net_after_tax_try, color: pnl.net_after_tax_try >= 0 ? CHART.pos : CHART.neg },
              { label: 'EBIT',    value: ebitda,                color: ebitda >= 0 ? CHART.info : CHART.neg },
              { label: 'Brüt Kâr', value: pnl.gross_profit_try,  color: '#0891b2' },
              { label: 'Gelir',   value: pnl.revenue_try,       color: CHART.primary },
            ]}
            series={[{ key: 'value', label: 'Tutar' }]}
            valueFormatter={(v) => compactTRY(Number(v))}
          />
        </ChartCard>
      )}

      {pnl && !loading && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden print:border-none print:shadow-none">
          {/* Revenue section */}
          <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#e8eaef]">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Satışlar</div>
          </div>
          <div className="px-4">
            <Row label="Satış Gelirleri"        value={fmt(pnl.revenue_try)} />
            <Row label="Satılan Malın Maliyeti"  value={fmt(-pnl.cost_try)} indent negative={pnl.cost_try > 0} />
            <Row label="Brüt Kâr"               value={fmt(pnl.gross_profit_try)}
              bold sub={`Marj: ${grossMargin}`}
              positive={pnl.gross_profit_try > 0} negative={pnl.gross_profit_try < 0} />
          </div>

          {/* OpEx section */}
          <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#e8eaef] border-t border-[#e8eaef] mt-1">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Faaliyet Giderleri</div>
          </div>
          <div className="px-4">
            <Row label="Toplam Giderler"         value={fmt(-pnl.expenses_total_try)} indent negative={pnl.expenses_total_try > 0} />
            <Row label="  — İndirilebilir"       value={fmt(-pnl.deductible_expenses_try)} indent />
            <Row label="  — İndirilemez"         value={fmt(-pnl.non_deductible_expenses_try)} indent />
            <Row label="Faaliyet Kârı (EBIT)"     value={fmt(ebitda)}
              bold positive={ebitda > 0} negative={ebitda < 0} />
          </div>

          {/* Tax section */}
          <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#e8eaef] border-t border-[#e8eaef] mt-1">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Vergi</div>
          </div>
          <div className="px-4">
            <Row label="Kurumlar Vergisi Matrahı" value={fmt(pnl.matrah_try)} indent sub={`%${pnl.corporate_tax_rate} oran`} />
            <Row label="Kurumlar Vergisi"          value={fmt(-pnl.corporate_tax_try)} indent negative={pnl.corporate_tax_try > 0} />
          </div>

          {/* Net income */}
          <div className={`px-4 py-3 border-t-2 ${pnl.net_after_tax_try >= 0 ? 'border-pos-light bg-pos-light' : 'border-neg-light bg-neg-light'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-[#0f172a]">Dönem Net Kârı</span>
              <span className={`text-xl font-black tabular-nums ${pnl.net_after_tax_try >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                {fmt(pnl.net_after_tax_try)}
              </span>
            </div>
            <div className="text-[10px] text-[#64748b] mt-0.5">Net marj: {netMargin}</div>
          </div>
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Gelir tablosu P&amp;L analizi ve satışlarla birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            P&amp;L Analizi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=quarterly" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Geçici Vergi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=sales" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Satışlar →
          </Link>
        </div>
      </div>
    </div>
  )
}
