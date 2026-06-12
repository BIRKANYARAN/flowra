'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Skeleton, ErrorBanner } from '@/components/ds'
import { PdfExportButton } from '@/components/reports/PdfExportButton'
import { useWorkspace } from '@/lib/workspace-context'
import type { PdfReportOptions } from '@/lib/utils/pdf-report'
import { formatTRY as fmt } from '@/lib/format'
import { ChartCard, DonutBreakdown, CHART } from '@/components/charts'

function compactTRY(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return '₺' + (n / 1e9).toFixed(1).replace('.', ',') + 'Mr'
  if (a >= 1e6) return '₺' + (n / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return '₺' + (n / 1e3).toFixed(0) + 'B'
  return '₺' + Math.round(n).toLocaleString('tr-TR')
}

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
    <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#e8eaef]">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">{title}</div>
    </div>
  )
}

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-[#f1f5f9] last:border-0 ${indent ? 'pl-6' : ''}`}>
      <span className={`text-xs ${bold ? 'font-black text-[#0f172a]' : 'font-medium text-[#64748b]'}`}>{label}</span>
      <span className={`tabular-nums text-sm shrink-0 ${bold ? 'font-black text-[#0f172a]' : 'font-semibold text-[#334155]'}`}>{value}</span>
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
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Bilanço</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">Varlıklar = Kaynaklar + Özkaynak</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[#64748b]">Tarih itibarıyla:</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            className="border border-[#e8eaef] rounded px-2 py-1 text-xs" />
          {bs && <PdfExportButton label="Dışa Aktar ↓" opts={{
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
          } as PdfReportOptions} />}
          <Link href="/dashboard/finance" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">← Finans</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-black">Bilanço</h1>
        <p className="text-sm text-[#64748b]">{asOf} itibarıyla</p>
      </div>

      {error && <ErrorBanner msg={error} />}
      {loading && <Skeleton height="h-64" />}

      {/* Asset composition — where value is held */}
      {bs && !loading && (
        <ChartCard title="Varlık Kompozisyonu" subtitle="Likidite yapısı" className="h-48 print:hidden">
          <DonutBreakdown
            centerLabel="Varlık"
            centerValue={compactTRY(bs.assets.total_assets_try)}
            valueFormatter={(v) => compactTRY(Number(v))}
            data={[
              { name: 'Kasa & Banka', value: bs.assets.cash_try,        color: CHART.pos },
              { name: 'Alıcılar',     value: bs.assets.receivables_try,  color: CHART.info },
              { name: 'Stoklar',      value: bs.assets.inventory_try,    color: CHART.warn },
              { name: 'Diğer Dönen',  value: bs.assets.other_current_try },
              { name: 'Duran',        value: bs.assets.total_non_current_try, color: CHART.ink3 },
            ].filter(d => d.value > 0)}
          />
        </ChartCard>
      )}

      {bs && !loading && (
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Assets */}
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden print:border-[#e8eaef]">
            <div className="px-4 py-3 bg-info-light border-b border-info-light">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-info-text">Varlıklar</span>
                <span className="text-sm font-extrabold tabular-nums text-info-text">{fmt(bs.assets.total_assets_try)}</span>
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
            <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden print:border-[#e8eaef]">
              <div className="px-4 py-3 bg-warn-light border-b border-warn/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-warn">Kaynaklar</span>
                  <span className="text-sm font-extrabold tabular-nums text-warn-text">{fmt(bs.liabilities.total_liabilities_try)}</span>
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
            <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden print:border-[#e8eaef]">
              <div className="px-4 py-3 bg-pos-light border-b border-pos-light">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-pos-text">Özkaynak</span>
                  <span className="text-sm font-extrabold tabular-nums text-pos-text">{fmt(bs.equity.total_equity_try)}</span>
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
        <div className={`px-4 py-2.5 rounded border text-xs font-semibold flex items-center gap-2 ${
          bs.balanced ? 'bg-pos-light border-pos-light text-pos-text' : 'bg-neg-light border-neg-light text-neg-text'
        }`}>
          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
            bs.balanced ? 'bg-pos-light text-pos-text' : 'bg-neg-light text-neg-text'
          }`}>
            {bs.balanced ? '✓' : '✗'}
          </span>
          {bs.balanced
            ? 'Bilanço dengeli — Varlıklar = Kaynaklar + Özkaynak'
            : `Bilanço dengeli değil — ${fmt(Math.abs(bs.imbalance_try))} fark var`}
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Bilanço nakit akışı ve P&amp;L ile entegre olarak değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=cashflow" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Nakit Akışı →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            P&amp;L →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/partners" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Ortak Özkaynakları →
          </Link>
        </div>
      </div>
    </div>
  )
}
