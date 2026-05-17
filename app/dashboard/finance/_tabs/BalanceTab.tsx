// ── BalanceTab — Bilanço (Balance Sheet) ─────────────────────────────────────
//
// Simplified Turkish SME balance sheet, computed from CfoMetrics.
// Two-column layout: Varlıklar (Assets) | Kaynaklar (Liabilities + Equity)
// Balanced check indicator at bottom.

import { getCfoMetrics }   from '@/lib/finance/financial-core'
import { computeBalanceSheet, balanceSheetRows } from '@/lib/finance/balance-sheet'
import type { CfoMetrics } from '@/lib/finance/cfo-metrics'
import { fmtTRY as fmt }  from '@/lib/format'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmtFull(n: number): string {
  return (n < 0 ? '−' : '') + '₺' + TRY.format(Math.abs(n))
}

// ── Column renderer ────────────────────────────────────────────────────────────

function BSColumn({ title, rows }: {
  title: string
  rows: { label: string; amount: number; indent?: boolean; isTotal?: boolean; sub?: string }[]
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{title}</span>
      </div>
      <div className="flex-1 divide-y divide-gray-50 px-4 py-2">
        {rows.map((row, i) => (
          <div key={i}
            className={`flex items-center justify-between py-2 gap-2 ${
              row.isTotal ? 'font-black' : ''
            }`}>
            <div className="min-w-0 flex-1">
              <span className={`text-xs leading-snug ${
                row.isTotal
                  ? 'font-black text-gray-900'
                  : row.indent
                  ? 'text-gray-400 pl-4 font-medium'
                  : 'text-gray-700 font-semibold'
              }`}>
                {row.label}
              </span>
              {row.sub && (
                <span className="text-[9px] text-gray-300 ml-1.5">{row.sub}</span>
              )}
            </div>
            <span className={`tabular-nums shrink-0 text-xs font-black ${
              row.isTotal
                ? row.amount >= 0 ? 'text-gray-900' : 'text-red-600'
                : row.indent
                ? 'text-gray-600 font-semibold'
                : row.amount < 0 ? 'text-red-600 font-bold' : 'text-gray-700 font-bold'
            }`}>
              {row.amount === 0 && row.sub ? '—' : fmtFull(row.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function BalanceTab({ userId: _userId, companyId }: Props) {
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const from  = `${year}-${mon}-01`

  const ZERO: CfoMetrics = {
    cash:        { true_cash_position: 0, operational_cash: 0, restricted_cash: 0, distributable_cash: 0 },
    burn:        { monthly_burn_rate: 0, runway_months: null, runway_days: null, cash_exhaustion_date: null },
    receivables: { total_outstanding: 0, overdue_30d: 0, overdue_60d: 0, overdue_90d: 0, collection_rate_pct: 100 },
    tax:         { kdv_net: 0, corporate_tax_estimate: 0, total_fiscal_obligation: 0 },
    partner:     { total_equity: 0, total_loans: 0, total_dividends: 0, company_owes: 0 },
    stock:       { fifo_value: 0, coverage_months: null },
  }

  const metrics = await getCfoMetrics(companyId, { from, to: today }).catch(() => ZERO)
  const bs      = computeBalanceSheet(metrics)
  const { assets, liabilitiesAndEquity } = balanceSheetRows(bs)

  const totalDiff = Math.abs(bs.totalAssets - bs.totalLiabilitiesAndEquity)

  return (
    <div className="space-y-4">

      {/* Header metrics */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Toplam Varlıklar',    value: fmt(bs.totalAssets),       color: 'text-gray-900' },
          { label: 'Toplam Yükümlülükler', value: fmt(bs.totalLiabilities), color: bs.totalLiabilities > 0 ? 'text-amber-700' : 'text-gray-400' },
          { label: 'Özsermaye',           value: fmt(bs.equity.total),      color: bs.equity.total >= 0 ? 'text-emerald-700' : 'text-red-600' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Two-column balance sheet */}
      <div className="grid grid-cols-2 gap-4">
        <BSColumn title="Varlıklar (Assets)" rows={assets} />
        <BSColumn title="Kaynaklar (Liabilities + Equity)" rows={liabilitiesAndEquity} />
      </div>

      {/* Balance check */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold ${
        totalDiff < 1
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          : 'bg-amber-50 border border-amber-200 text-amber-700'
      }`}>
        {totalDiff < 1 ? (
          <>✓ Bilanço dengeli — Varlıklar = Kaynaklar ({fmtFull(bs.totalAssets)})</>
        ) : (
          <>⚠ Fark: {fmtFull(totalDiff)} — Bazı varlık/yükümlülük kalemleri sisteme henüz girilmemiş olabilir.</>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-gray-400 leading-relaxed">
        Bu bilanço, Flowra&apos;ya girilen verilerden otomatik üretilmektedir. Duran varlıklar, uzun vadeli yükümlülükler ve
        amortismanlar şu an için sıfır gösterilmektedir. Resmi muhasebe bildirimleri için muhasebeciye danışınız.
      </p>
    </div>
  )
}
