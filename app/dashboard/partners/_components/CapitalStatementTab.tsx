'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CapitalStatementTab — Sermaye Hesap Özeti
//
// Shows each partner's running capital account for the selected year.
// Each partner has a collapsible 12-month statement table showing:
//   opening equity, contributions, profit allocation, dividends, compensation,
//   and closing equity.
//
// Data: GET /api/partners/capital-statement?year=YYYY
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import type {
  CapitalStatementReport,
  PartnerCapitalAccount,
  CapitalStatementLine,
} from '@/lib/services/pcle/capital-statement.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: CapitalStatementReport
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchCapitalStatement(year: number): Promise<CapitalStatementReport> {
  const res = await fetch(`/api/partners/capital-statement?year=${year}`)
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).report
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: string
  tone?: 'pos' | 'neg' | 'neutral'
  sub?: string
}) {
  const toneClass =
    tone === 'pos'     ? 'text-pos-text'
    : tone === 'neg'   ? 'text-neg'
    : 'text-[#0f172a]'

  return (
    <div className="flex flex-col gap-0.5 p-3 rounded border border-[#e8eaef] bg-[#f8fafc] min-w-[140px]">
      <span className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">{label}</span>
      <span className={`text-base font-black ${toneClass}`}>{value}</span>
      {sub && <span className="text-[0.6rem] text-[#94a3b8]">{sub}</span>}
    </div>
  )
}

function CapitalLine({ line }: { line: CapitalStatementLine }) {
  const netChange = line.equity_contributions + line.profit_allocation - line.dividends_declared - line.compensation_paid + line.other_adjustments
  const isPositive = netChange >= 0

  return (
    <tr className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors">
      <td className="py-2 px-3 text-xs font-semibold text-[#334155] whitespace-nowrap">
        {line.period_label}
      </td>
      <td className="py-2 px-3 text-xs text-right text-[#475569] tabular-nums">
        {fmtTRY(line.opening_equity)}
      </td>
      <td className="py-2 px-3 text-xs text-right text-pos-text tabular-nums">
        {line.equity_contributions > 0 ? `+${fmtTRY(line.equity_contributions)}` : '—'}
      </td>
      <td className={`py-2 px-3 text-xs text-right tabular-nums ${line.profit_allocation >= 0 ? 'text-pos-text' : 'text-neg'}`}>
        {line.profit_allocation !== 0
          ? (line.profit_allocation >= 0 ? '+' : '') + fmtTRY(line.profit_allocation)
          : '—'}
      </td>
      <td className="py-2 px-3 text-xs text-right text-neg tabular-nums">
        {line.dividends_declared > 0 ? `-${fmtTRY(line.dividends_declared)}` : '—'}
      </td>
      <td className="py-2 px-3 text-xs text-right text-neg tabular-nums">
        {line.compensation_paid > 0 ? `-${fmtTRY(line.compensation_paid)}` : '—'}
      </td>
      <td className={`py-2 px-3 text-xs text-right font-bold tabular-nums ${isPositive ? 'text-pos-text' : 'text-neg'}`}>
        {fmtTRY(line.closing_equity)}
      </td>
    </tr>
  )
}

function PartnerCard({ account }: { account: PartnerCapitalAccount }) {
  const [expanded, setExpanded] = useState(false)
  const isPositive = account.net_equity_change_ytd >= 0

  return (
    <div className="rounded border border-[#e8eaef] bg-white overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#f8fafc] transition-colors bg-transparent border-0 cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-white text-xs font-black flex-shrink-0">
            {account.partner_name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-bold text-[#0f172a]">{account.partner_name}</div>
            <div className="text-[0.65rem] text-[#94a3b8]">%{account.share_pct.toFixed(1)} pay oranı</div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Dönem Sonu Sermaye</div>
            <div className={`text-sm font-black ${account.current_equity >= 0 ? 'text-[#0f172a]' : 'text-neg'}`}>
              {fmtTRY(account.current_equity)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Net Değişim</div>
            <div className={`text-sm font-bold ${isPositive ? 'text-pos-text' : 'text-neg'}`}>
              {isPositive ? '+' : ''}{fmtTRY(account.net_equity_change_ytd)}
            </div>
          </div>
          <span className="text-[#94a3b8] text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Summary strip */}
      {expanded && (
        <>
          <div className="flex gap-3 px-4 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex-wrap">
            <SummaryCard
              label="Toplam Katkı"
              value={fmtTRY(account.total_contributions_ytd)}
              tone="pos"
            />
            <SummaryCard
              label="Toplam Temettü"
              value={fmtTRY(account.total_dividends_ytd)}
              tone={account.total_dividends_ytd > 0 ? 'neg' : 'neutral'}
            />
            <SummaryCard
              label="Toplam Huzur Hakkı"
              value={fmtTRY(account.total_compensation_ytd)}
              tone={account.total_compensation_ytd > 0 ? 'neg' : 'neutral'}
            />
            <SummaryCard
              label="Kapanış Sermayesi"
              value={fmtTRY(account.current_equity)}
              tone={account.current_equity >= 0 ? 'pos' : 'neg'}
            />
          </div>

          {/* Monthly table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="py-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] text-left">Dönem</th>
                  <th className="py-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] text-right">Açılış</th>
                  <th className="py-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] text-right">Katkı</th>
                  <th className="py-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] text-right">Kâr Payı</th>
                  <th className="py-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] text-right">Temettü</th>
                  <th className="py-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] text-right">Huzur Hakkı</th>
                  <th className="py-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] text-right">Kapanış</th>
                </tr>
              </thead>
              <tbody>
                {account.lines.map(line => (
                  <CapitalLine key={line.period_key} line={line} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#f8fafc] border-t-2 border-[#e8eaef]">
                  <td className="py-2 px-3 text-xs font-black text-[#0f172a]">TOPLAM</td>
                  <td className="py-2 px-3 text-xs text-right text-[#475569] tabular-nums">—</td>
                  <td className="py-2 px-3 text-xs text-right font-bold text-pos-text tabular-nums">
                    {fmtTRY(account.total_contributions_ytd)}
                  </td>
                  <td className="py-2 px-3 text-xs text-right font-bold tabular-nums text-[#0f172a]">—</td>
                  <td className="py-2 px-3 text-xs text-right font-bold text-neg tabular-nums">
                    {fmtTRY(account.total_dividends_ytd)}
                  </td>
                  <td className="py-2 px-3 text-xs text-right font-bold text-neg tabular-nums">
                    {fmtTRY(account.total_compensation_ytd)}
                  </td>
                  <td className="py-2 px-3 text-xs text-right font-black text-[#0f172a] tabular-nums">
                    {fmtTRY(account.current_equity)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main tab component ────────────────────────────────────────────────────────

export function CapitalStatementTab() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const { data, isLoading, error } = useQuery<CapitalStatementReport, Error>({
    queryKey: ['capital-statement', year],
    queryFn:  () => fetchCapitalStatement(year),
    staleTime: 5 * 60 * 1000,
  })

  const yearOptions = [currentYear, currentYear - 1, currentYear - 2]

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
            Sermaye Hesap Özeti
          </div>
          <p className="text-xs text-[#64748b]">
            Ortak bazında sermaye hesabı — katkılar, kâr payı dağılımı, temettü ve huzur hakkı
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#64748b]">Yıl:</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-xs border border-[#e8eaef] rounded px-2 py-1.5 bg-white text-[#0f172a] font-semibold focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-xs text-[#94a3b8]">
          Sermaye hesapları hesaplanıyor...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-medium">
          {error.message}
        </div>
      )}

      {/* Content */}
      {data && (
        <>
          {/* Company totals strip */}
          <div className="flex gap-3 flex-wrap">
            <SummaryCard
              label="Toplam Ödenmiş Sermaye"
              value={fmtTRY(data.total_paid_in_capital)}
              tone="pos"
              sub={`${data.year} YTD`}
            />
            <SummaryCard
              label="Dağıtılmamış Kârlar"
              value={fmtTRY(data.total_retained_earnings)}
              tone={data.total_retained_earnings >= 0 ? 'pos' : 'neg'}
            />
            <SummaryCard
              label="Toplam Özkaynak"
              value={fmtTRY(data.total_equity)}
              tone={data.total_equity >= 0 ? 'pos' : 'neg'}
              sub={`${data.partners.length} ortak`}
            />
          </div>

          {/* Per-partner cards */}
          {data.partners.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-xs text-[#94a3b8] border border-dashed border-[#e8eaef] rounded">
              Bu yıl için aktif ortak bulunamadı.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {data.partners.map(account => (
                <PartnerCard key={account.partner_id} account={account} />
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="text-[0.6rem] text-[#94a3b8] text-right">
            Hesaplandı: {new Date(data.computed_at).toLocaleString('tr-TR')}
          </div>
        </>
      )}
    </div>
  )
}
