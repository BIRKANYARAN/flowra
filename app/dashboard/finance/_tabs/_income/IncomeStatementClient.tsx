'use client'

// ─────────────────────────────────────────────────────────────────────────────
// IncomeStatementClient
//
// Formal multi-period income statement (Gelir Tablosu) formatted per Turkish
// accounting standards (MSUGT).
//
// Features:
//   - Mode toggle: "Aylık" (monthly) / "Yıllık" (annual)
//   - Monthly: period selector — last 12 months
//   - Annual:  year selector — current + prior 2 years
//   - "Karşılaştırma Dönemi Ekle" toggle — prior period column
//   - Income statement table with variance arrows and colors
//   - Subtotal rows (Brüt Kâr, EBITDA, Net Gelir) bold with top border
//   - Margin summary: Brüt Marj / Faaliyet Marjı / Net Marj
//   - TanStack Query — queryKey includes all selector state
// ─────────────────────────────────────────────────────────────────────────────

import { useState }       from 'react'
import { useQuery }       from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  IncomeStatement,
  IncomeStatementLine,
} from '@/lib/services/finance/income-statement.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ocak',    '02': 'Şubat', '03': 'Mart',
  '04': 'Nisan',   '05': 'Mayıs', '06': 'Haziran',
  '07': 'Temmuz',  '08': 'Ağustos', '09': 'Eylül',
  '10': 'Ekim',    '11': 'Kasım',   '12': 'Aralık',
}

/** Build last N period keys (YYYY-MM) ending at current month. */
function buildLastNMonths(n: number): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    )
  }
  return keys
}

function periodKeyLabel(pk: string): string {
  const [y, m] = pk.split('-')
  return `${MONTH_NAMES[m] ?? m} ${y}`
}

function varianceColor(dir: IncomeStatementLine['variance_direction']): string {
  if (dir === 'favorable')   return 'text-[#16a34a]'
  if (dir === 'unfavorable') return 'text-[#dc2626]'
  return 'text-[#94a3b8]'
}

function varianceArrow(dir: IncomeStatementLine['variance_direction'], change: number | null): string {
  if (change === null || change === 0) return '—'
  if (dir === 'favorable')   return change > 0 ? '▲' : '▼'
  if (dir === 'unfavorable') return change > 0 ? '▲' : '▼'
  return '—'
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(9)].map((_, i) => (
        <div key={i} className="h-8 bg-[#f1f5f9] rounded animate-pulse" />
      ))}
    </div>
  )
}

// ── Income Statement Row ──────────────────────────────────────────────────────

function StatementRow({
  line,
  showPrior,
}: {
  line: IncomeStatementLine
  showPrior: boolean
}) {
  const isSubtotal   = line.is_subtotal
  const indentClass  = line.indent_level === 1 ? 'pl-6' : ''
  const rowBg        = isSubtotal ? 'bg-[#f8fafc] border-t border-[#e2e8f0]' : 'hover:bg-[#fafafa]'
  const fontClass    = isSubtotal ? 'font-black text-[#0f172a]' : 'font-medium text-[#334155]'
  const valueFont    = isSubtotal ? 'font-black' : 'font-mono'
  const netColor     =
    line.current_try < 0
      ? 'text-[#dc2626]'
      : isSubtotal && line.current_try > 0
        ? 'text-[#16a34a]'
        : 'text-[#0f172a]'

  return (
    <tr className={`${rowBg} text-xs`}>
      {/* Label */}
      <td className={`px-4 py-2.5 ${indentClass} ${fontClass}`}>
        {line.label}
      </td>

      {/* Current period */}
      <td className={`px-4 py-2.5 text-right tabular-nums ${valueFont} ${netColor}`}>
        {fmtTRY(line.current_try)}
      </td>

      {/* Prior period column */}
      {showPrior && (
        <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[#64748b]">
          {line.prior_try !== null ? fmtTRY(line.prior_try) : '—'}
        </td>
      )}

      {/* Change column */}
      {showPrior && (
        <td className={`px-4 py-2.5 text-right tabular-nums text-xs ${varianceColor(line.variance_direction)}`}>
          {line.change_try !== null ? (
            <span className="flex items-center justify-end gap-1">
              <span className="text-[10px]">
                {varianceArrow(line.variance_direction, line.change_try)}
              </span>
              <span>
                {line.change_try !== 0
                  ? fmtTRY(Math.abs(line.change_try))
                  : '—'}
              </span>
              {line.change_pct !== null && (
                <span className="text-[10px] opacity-80">
                  ({line.change_pct >= 0 ? '+' : ''}{line.change_pct.toFixed(1)}%)
                </span>
              )}
            </span>
          ) : '—'}
        </td>
      )}
    </tr>
  )
}

// ── Margin Summary ────────────────────────────────────────────────────────────

function MarginSummary({ statement }: { statement: IncomeStatement }) {
  const margins = [
    { label: 'Brüt Marj',      value: statement.gross_margin_pct,     ok: statement.gross_margin_pct >= 30 },
    { label: 'Faaliyet Marjı', value: statement.operating_margin_pct,  ok: statement.operating_margin_pct >= 10 },
    { label: 'Net Marj',       value: statement.net_margin_pct,        ok: statement.net_margin_pct >= 5 },
    { label: 'Efektif Vergi',  value: statement.effective_tax_rate,    ok: true },
  ]

  return (
    <div className="grid grid-cols-4 gap-2 pt-3 border-t border-[#e2e8f0]">
      {margins.map(m => (
        <div key={m.label} className="text-center">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            {m.label}
          </div>
          <div className={`text-sm font-black tabular-nums ${
            m.label === 'Efektif Vergi'
              ? 'text-[#64748b]'
              : m.ok
                ? 'text-[#16a34a]'
                : 'text-[#dc2626]'
          }`}>
            {fmtPct(m.value)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function IncomeStatementClient({ companyId }: Props) {
  const now          = new Date()
  const currentYear  = now.getFullYear()
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // ── State ──────────────────────────────────────────────────────────────────
  const [mode, setMode]           = useState<'monthly' | 'annual'>('monthly')
  const [period, setPeriod]       = useState(currentMonth)
  const [year, setYear]           = useState(currentYear)
  const [showPrior, setShowPrior] = useState(false)

  const monthOptions = buildLastNMonths(12)
  const yearOptions  = [currentYear, currentYear - 1, currentYear - 2]

  // ── Query ──────────────────────────────────────────────────────────────────
  const queryKey = ['income-statement', companyId, mode, mode === 'monthly' ? period : year, showPrior]

  const { data, isLoading, isError } = useQuery<{ statement: IncomeStatement }>({
    queryKey,
    queryFn: async () => {
      let url: string
      if (mode === 'annual') {
        url = `/api/finance/income-statement?year=${year}&includePriorYear=${showPrior}`
      } else {
        url = `/api/finance/income-statement?period=${period}&includePrior=${showPrior}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const statement = data?.statement

  // ── Row ordering ───────────────────────────────────────────────────────────
  const rows: Array<{ line: IncomeStatementLine }> = statement
    ? [
        { line: statement.revenue },
        { line: statement.cogs },
        { line: statement.gross_profit },
        { line: statement.operating_expenses },
        { line: statement.ebitda },
        { line: statement.interest_expense },
        { line: statement.ebt },
        { line: statement.tax_provision },
        { line: statement.net_income },
      ]
    : []

  return (
    <div className="space-y-4">

      {/* ── Header + Controls ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Gelir Tablosu
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            MSUGT standartlarına uygun · {statement?.period_label ?? '—'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode toggle */}
          <div className="flex border border-[#e2e8f0] rounded overflow-hidden">
            {(['monthly', 'annual'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === m
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'
                }`}
              >
                {m === 'monthly' ? 'Aylık' : 'Yıllık'}
              </button>
            ))}
          </div>

          {/* Period / Year selector */}
          {mode === 'monthly' ? (
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="text-xs border border-[#e2e8f0] rounded px-2 py-1.5 bg-white text-[#334155] font-semibold focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
            >
              {monthOptions.map(pk => (
                <option key={pk} value={pk}>{periodKeyLabel(pk)}</option>
              ))}
            </select>
          ) : (
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="text-xs border border-[#e2e8f0] rounded px-2 py-1.5 bg-white text-[#334155] font-semibold focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y} Yılı</option>
              ))}
            </select>
          )}

          {/* Prior period toggle */}
          <button
            onClick={() => setShowPrior(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold transition-colors ${
              showPrior
                ? 'bg-[#6366f1] text-white border-[#6366f1]'
                : 'bg-white text-[#64748b] border-[#e2e8f0] hover:bg-[#f8fafc]'
            }`}
          >
            <span>{showPrior ? '✓' : '+'}</span>
            <span>Karşılaştırma Dönemi Ekle</span>
          </button>
        </div>
      </div>

      {/* Data-completeness warning — COGS source hit a row cap, figures may understate cost */}
      {statement?.data_completeness_warning && (
        <div className="flex items-start gap-2 text-xs text-[#92400e] bg-[#fffbeb] border border-[#fde68a] rounded px-3 py-2">
          <span aria-hidden>⚠️</span>
          <span>
            Veri tamlığı uyarısı: bazı maliyet kayıtları satır sınırına ulaştı; satılan malın maliyeti
            eksik, dolayısıyla kâr ve vergi olduğundan yüksek görünebilir. ({statement.data_completeness_warning})
          </span>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

        {/* Table header */}
        <div className="border-b border-[#e2e8f0] bg-[#f8fafc]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                <th className="text-left px-4 py-2.5 w-1/2">Kalem</th>
                <th className="text-right px-4 py-2.5">
                  {statement?.period_label ?? (mode === 'monthly' ? periodKeyLabel(period) : `${year} Yılı`)}
                </th>
                {showPrior && (
                  <>
                    <th className="text-right px-4 py-2.5">
                      {statement?.prior_period_label ?? 'Önceki Dönem'}
                    </th>
                    <th className="text-right px-4 py-2.5">Değişim</th>
                  </>
                )}
              </tr>
            </thead>
          </table>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="p-4">
            <TableSkeleton />
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="px-4 py-6 text-center text-xs text-[#dc2626] font-semibold">
            Veri yüklenirken hata oluştu. Lütfen sayfayı yenileyin.
          </div>
        )}

        {/* Data */}
        {!isLoading && !isError && statement && (
          <table className="w-full text-xs">
            <tbody className="divide-y divide-[#f1f5f9]">
              {rows.map(({ line }) => (
                <StatementRow
                  key={line.label}
                  line={line}
                  showPrior={showPrior}
                />
              ))}
            </tbody>
          </table>
        )}

        {/* Empty */}
        {!isLoading && !isError && !statement && (
          <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
            Seçilen dönem için veri bulunamadı.
          </div>
        )}
      </div>

      {/* ── Margin summary ────────────────────────────────────────────────── */}
      {!isLoading && !isError && statement && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            Kâr Marjları
          </div>
          <MarginSummary statement={statement} />
        </div>
      )}
    </div>
  )
}
