// ── IntelligencePanel — financial context layer ───────────────────────────────
//
// Below-the-fold intelligence: WHY do the decisions above matter?
// Three panels side by side:
//   LEFT  (6 cols) — Nakit Akışı chart (12-month cashflow timeline)
//   MID   (3 cols) — Bu Ay: accrual P&L waterfall for current period
//   RIGHT (3 cols) — Vergi durumu: KDV + Kurumlar Vergisi + partner distribution

import Link          from 'next/link'
import { CashflowChart } from '@/components/dashboard/CashflowChart'
import type { CfoMetrics }     from '@/lib/finance/cfo-metrics'
import type { EqResult }       from '@/lib/finance/executive-summary'

// ── Formatting ────────────────────────────────────────────────────────────────

const TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmt(n: number): string {
  const abs = Math.abs(Number(n || 0))
  const s   = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${s}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${s}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${s}₺${TRY.format(abs)}`
}

function fmtFull(n: number): string {
  const abs = Math.abs(Number(n || 0))
  return (n < 0 ? '−' : '') + '₺' + TRY.format(abs)
}

function pct(v: number): string {
  return `%${(v * 100).toFixed(1).replace('.', ',')}`
}

// ── Waterfall row ─────────────────────────────────────────────────────────────

function WRow({ label, value, sub, isTotal }: {
  label: string; value: number; sub?: string; isTotal?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className={`text-[11px] ${isTotal ? 'font-black text-gray-900' : 'font-semibold text-gray-500'}`}>
          {label}
        </span>
        {sub && <span className="text-[9px] text-gray-400 ml-1.5">{sub}</span>}
      </div>
      <span className={`tabular-nums shrink-0 font-black ${
        isTotal
          ? `text-sm ${value >= 0 ? 'text-emerald-700' : 'text-red-600'}`
          : `text-xs ${value >= 0 ? 'text-gray-700' : 'text-red-500'}`
      }`}>
        {fmtFull(value)}
      </span>
    </div>
  )
}

// ── Panel card wrapper ─────────────────────────────────────────────────────────

function Panel({ title, href, linkLabel, children }: {
  title: string; href?: string; linkLabel?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
          {title}
        </span>
        {href && linkLabel && (
          <Link href={href} className="text-[10px] font-semibold text-primary-600 hover:text-primary-700 transition-colors">
            {linkLabel} →
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  pnl: {
    revenue:          number
    grossMarginPct:   number
    netAfterTax:      number
    expensesTotal:    number
    vatNet:           number
    corporateTax:     number
    matrah:           number
    monthlyBurn:      number
    breakEvenRevenue: number | null
    periodCollected:  number
    collectionRate:   number
  }
  metrics:          CfoMetrics
  equalization:     EqResult
  openProformas:    { count: number; total: number }
}

export function IntelligencePanel({ pnl, metrics, equalization, openProformas }: Props) {
  const vatPayable = pnl.vatNet > 0

  return (
    <div className="grid grid-cols-12 gap-3 items-start">

      {/* ── Nakit Akışı Chart ─────────────────────────────────────────────── */}
      <div className="col-span-6">
        <Panel title="Nakit Akışı" href="/dashboard/cashflow" linkLabel="Detay">
          <CashflowChart className="w-full" />
        </Panel>
      </div>

      {/* ── Bu Ay — P&L Waterfall ─────────────────────────────────────────── */}
      <div className="col-span-3">
        <Panel title="Bu Ay" href="/dashboard/analytics" linkLabel="Analiz">
          <div className="flex flex-col gap-2">
            <WRow
              label="Ciro"
              value={pnl.revenue}
              sub={pnl.revenue > 0 ? `Brüt marj ${pct(pnl.grossMarginPct)}` : 'Satış yok'}
            />
            <WRow
              label="Tahsilat"
              value={pnl.periodCollected}
              sub={`%${Math.round(pnl.collectionRate)} tahsil`}
            />
            <WRow
              label="Giderler"
              value={-pnl.expensesTotal}
              sub={pnl.monthlyBurn > 0 ? `~${fmt(pnl.monthlyBurn)}/ay` : undefined}
            />
            <div className="border-t border-dashed border-gray-100 pt-2 mt-0.5">
              <WRow
                label="Net (vergi sonrası)"
                value={pnl.netAfterTax}
                sub={pnl.breakEvenRevenue !== null ? `BB: ${fmt(pnl.breakEvenRevenue)}/ay` : undefined}
                isTotal
              />
            </div>

            {/* Open proformas teaser */}
            {openProformas.count > 0 && (
              <Link href="/dashboard/proformas"
                className="mt-2 flex items-center justify-between rounded-lg bg-primary-50 border border-primary-100 px-3 py-2 hover:bg-primary-100 transition-colors">
                <span className="text-[10px] font-semibold text-primary-700">
                  {openProformas.count} açık proforma
                </span>
                <span className="text-xs font-black text-primary-700 tabular-nums">
                  {fmt(openProformas.total)}
                </span>
              </Link>
            )}
          </div>
        </Panel>
      </div>

      {/* ── Vergi + Partner Dağıtım ──────────────────────────────────────── */}
      <div className="col-span-3 flex flex-col gap-3">

        {/* Vergi durumu */}
        <Panel title="Vergi Durumu" href="/dashboard/analytics" linkLabel="Projeksiyon">
          <div className="space-y-2.5">

            {/* KDV */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">KDV Net</div>
                <div className={`text-base font-black tabular-nums ${vatPayable ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {fmtFull(Math.abs(pnl.vatNet))}
                </div>
              </div>
              <div className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                vatPayable ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {vatPayable ? '⬆ Ödenecek' : '⬇ Devir'}
              </div>
            </div>

            {/* Kurumlar Vergisi */}
            {pnl.corporateTax > 0 && (
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Kurumlar V.</div>
                  <div className="text-sm font-black tabular-nums text-gray-800">
                    {fmtFull(pnl.corporateTax)}
                  </div>
                  <div className="text-[9px] text-gray-400">Matrah: {fmt(pnl.matrah)}</div>
                </div>
                <div className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-lg font-bold">
                  %25
                </div>
              </div>
            )}

            {/* Stock coverage */}
            {metrics.stock.coverage_months !== null && (
              <div className="pt-2 border-t border-gray-100">
                <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Stok Değeri</div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-gray-800 tabular-nums">{fmt(metrics.stock.fifo_value)}</span>
                  <span className="text-[10px] text-gray-400">
                    {metrics.stock.coverage_months.toFixed(1)} ay karşılık
                  </span>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Ortak Dağıtım */}
        {metrics.cash.distributable_cash > 0 && equalization.entries.length > 0 && (
          <Panel title="Ortak Dağıtım" href="/dashboard/partners" linkLabel="Detay">
            <div className="space-y-1.5">
              {equalization.entries.slice(0, 3).map(e => (
                <div key={e.partner_id} className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-600 font-semibold truncate max-w-[90px]">
                    {e.partner_name}
                  </span>
                  <span className="text-xs font-black tabular-nums text-emerald-700">
                    {fmt(e.total_payout)}
                  </span>
                </div>
              ))}
              {equalization.entries.length > 3 && (
                <div className="text-[10px] text-gray-400">
                  +{equalization.entries.length - 3} ortak daha
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* No distributable */}
        {metrics.cash.distributable_cash <= 0 && (
          <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-[10px] text-gray-500 font-semibold">
            Dağıtılabilir nakit yok
            {metrics.receivables.total_outstanding > 0 && (
              <span className="block text-[9px] text-gray-400 font-normal mt-0.5">
                {fmt(metrics.receivables.total_outstanding)} tahsilat bekleniyor
              </span>
            )}
          </div>
        )}

      </div>

    </div>
  )
}
