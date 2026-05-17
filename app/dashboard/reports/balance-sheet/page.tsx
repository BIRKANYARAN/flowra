'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PdfExportButton } from '@/components/reports/PdfExportButton'
import { useWorkspace } from '@/lib/workspace-context'
import type { PdfReportOptions } from '@/lib/utils/pdf-report'
import { formatTRY as fmt } from '@/lib/format'

// Mirrors the nested BalanceSheet shape returned by BalanceSheetService.compute()
interface BSAssets {
  cash_try:              number
  receivables_try:       number
  inventory_try:         number
  other_current_try:     number
  total_current_try:     number
  equipment_try:         number
  deposits_try:          number
  other_non_current_try: number
  total_non_current_try: number
  total_assets_try:      number
}

interface BSLiabilities {
  partner_loans_try:           number
  tax_payable_try:             number
  other_current_payables_try:  number
  total_current_try:           number
  partner_loans_long_term_try: number
  other_non_current_try:       number
  total_non_current_try:       number
  total_liabilities_try:       number
}

interface BSEquity {
  total_partner_capital_try:  number
  retained_earnings_try:      number
  current_period_profit_try:  number
  total_equity_try:           number
}

interface BalanceSheet {
  as_of_date:    string
  assets:        BSAssets
  liabilities:   BSLiabilities
  equity:        BSEquity
  balanced:      boolean
  imbalance_try: number
}

function Section({ title }: { title: string }) {
  return (
    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</div>
    </div>
  )
}

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 ${indent ? 'pl-6' : ''}`}>
      <span className={`text-xs ${bold ? 'font-black text-gray-900' : 'font-medium text-gray-600'}`}>{label}</span>
      <span className={`tabular-nums text-sm shrink-0 ${bold ? 'font-black text-gray-900' : 'font-semibold text-gray-700'}`}>{value}</span>
    </div>
  )
}

export default function BalanceSheetPage() {
  const [bs,      setBs]      = useState<BalanceSheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [asOf,    setAsOf]    = useState(new Date().toISOString().slice(0, 10))
  const ws = useWorkspace()

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/financial-statements/balance-sheet?as_of=${asOf}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setBs(d as BalanceSheet))
      .catch(err => { if (err.name !== 'AbortError') setError('Bilanço yüklenemedi') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [asOf])

  return (
    <div className="flex flex-col gap-4 max-w-3xl print:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Bilanço</h1>
          <p className="text-xs text-gray-400 mt-0.5">Varlıklar = Kaynaklar + Özkaynak</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Tarih itibarıyla:</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
          {bs && <PdfExportButton opts={{
            companyName: ws.companyName ?? 'Şirket',
            reportTitle: 'Bilanço',
            subtitle: `${asOf} itibarıyla`,
            filename: `bilanco-${asOf}`,
            sections: [
              { title: 'Varlıklar', rows: [
                { label: 'Kasa ve Bankalar', value: fmt(bs.assets.cash_try), indent: true },
                { label: 'Alıcılar', value: fmt(bs.assets.receivables_try), indent: true },
                { label: 'Stoklar', value: fmt(bs.assets.inventory_try), indent: true },
                { label: 'Toplam Dönen', value: fmt(bs.assets.total_current_try), bold: true },
                { label: 'Toplam Duran', value: fmt(bs.assets.total_non_current_try), bold: true },
                { label: 'TOPLAM VARLIKLAR', value: fmt(bs.assets.total_assets_try), bold: true, tone: 'positive' },
              ]},
              { title: 'Kaynaklar', rows: [
                { label: 'Ortak Borçları (KV)', value: fmt(bs.liabilities.partner_loans_try), indent: true },
                { label: 'Vergi Borçları', value: fmt(bs.liabilities.tax_payable_try), indent: true },
                { label: 'Toplam Kaynaklar', value: fmt(bs.liabilities.total_liabilities_try), bold: true },
              ]},
              { title: 'Özkaynak', rows: [
                { label: 'Ortak Sermayesi', value: fmt(bs.equity.total_partner_capital_try), indent: true },
                { label: 'Geçmiş Yıllar Kârları', value: fmt(bs.equity.retained_earnings_try), indent: true },
                { label: 'Dönem Net Kârı', value: fmt(bs.equity.current_period_profit_try), indent: true },
                { label: 'TOPLAM ÖZKAYNAK', value: fmt(bs.equity.total_equity_try), bold: true, tone: 'positive' },
              ]},
            ],
          } as PdfReportOptions} label="PDF İndir" />}
          <Link href="/dashboard/cfo" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← CFO</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-black">Bilanço</h1>
        <p className="text-sm text-gray-500">{asOf} itibarıyla</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="bg-gray-100 rounded-xl h-64 animate-pulse" />}

      {bs && !loading && (
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Assets */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden print:border-gray-300">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-blue-600">Varlıklar</span>
                <span className="text-sm font-black tabular-nums text-blue-700">{fmt(bs.assets.total_assets_try)}</span>
              </div>
            </div>
            <Section title="Dönen Varlıklar" />
            <div className="px-4">
              <Row label="Kasa ve Bankalar"   value={fmt(bs.assets.cash_try)}         indent />
              <Row label="Alıcılar"           value={fmt(bs.assets.receivables_try)}  indent />
              <Row label="Stoklar"            value={fmt(bs.assets.inventory_try)}    indent />
              {bs.assets.other_current_try > 0 && <Row label="Diğer Dönen" value={fmt(bs.assets.other_current_try)} indent />}
              <Row label="Toplam Dönen"       value={fmt(bs.assets.total_current_try)} bold />
            </div>
            {bs.assets.total_non_current_try > 0 && (
              <>
                <Section title="Duran Varlıklar" />
                <div className="px-4">
                  {bs.assets.equipment_try > 0 && <Row label="Demirbaşlar (net)" value={fmt(bs.assets.equipment_try)} indent />}
                  {bs.assets.deposits_try  > 0 && <Row label="Depozitolar"       value={fmt(bs.assets.deposits_try)}  indent />}
                  <Row label="Toplam Duran" value={fmt(bs.assets.total_non_current_try)} bold />
                </div>
              </>
            )}
          </div>

          {/* Right: Liabilities + Equity */}
          <div className="flex flex-col gap-4">
            {/* Liabilities */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden print:border-gray-300">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-orange-600">Kaynaklar</span>
                  <span className="text-sm font-black tabular-nums text-orange-700">{fmt(bs.liabilities.total_liabilities_try)}</span>
                </div>
              </div>
              <Section title="Kısa Vadeli" />
              <div className="px-4">
                <Row label="Ortak Borçları (KV)"  value={fmt(bs.liabilities.partner_loans_try)}           indent />
                <Row label="Vergi Borçları"         value={fmt(bs.liabilities.tax_payable_try)}            indent />
                {bs.liabilities.other_current_payables_try > 0 && (
                  <Row label="Diğer Kısa Vadeli"  value={fmt(bs.liabilities.other_current_payables_try)} indent />
                )}
                <Row label="Toplam KV"             value={fmt(bs.liabilities.total_current_try)} bold />
              </div>
              {bs.liabilities.partner_loans_long_term_try > 0 && (
                <>
                  <Section title="Uzun Vadeli" />
                  <div className="px-4">
                    <Row label="Ortak Borçları (UV)" value={fmt(bs.liabilities.partner_loans_long_term_try)} indent />
                    <Row label="Toplam UV"            value={fmt(bs.liabilities.total_non_current_try)}      bold />
                  </div>
                </>
              )}
            </div>

            {/* Equity */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden print:border-gray-300">
              <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-600">Özkaynak</span>
                  <span className="text-sm font-black tabular-nums text-emerald-700">{fmt(bs.equity.total_equity_try)}</span>
                </div>
              </div>
              <div className="px-4">
                <Row label="Ortak Sermayesi"  value={fmt(bs.equity.total_partner_capital_try)}  indent />
                <Row label="Geç. Yıl Kârları" value={fmt(bs.equity.retained_earnings_try)}      indent />
                <Row label="Dönem Net Kârı"   value={fmt(bs.equity.current_period_profit_try)}  indent />
                <Row label="Toplam Özkaynak"  value={fmt(bs.equity.total_equity_try)} bold />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Balance check */}
      {bs && !loading && (
        <div className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
          bs.balanced ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
            bs.balanced ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {bs.balanced ? '✓' : '✗'}
          </span>
          {bs.balanced
            ? 'Bilanço dengeli — Varlıklar = Kaynaklar + Özkaynak'
            : `Bilanço dengeli değil — ${fmt(Math.abs(bs.imbalance_try))} fark var`}
        </div>
      )}
    </div>
  )
}
