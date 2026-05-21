'use client'

// ─────────────────────────────────────────────────────────────────────────────
// TreasuryBlotter — 5-row institutional ledger
//
// Rows: Cash · Receivables · Payables · Partner Debt · Period P&L
// Style: bg-[#0f172a] dark blotter (institutional look)
// No charts, no sparklines. Pure ledger.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { fmtTRY, fmtCompact } from '@/lib/format'

export interface TreasuryBlotterProps {
  // Cash row
  cash:              number
  cashDelta:         number
  cashRunwayMonths:  number

  // Receivables row
  receivables:       number
  receivablesDelta:  number
  avgAgingDays:      number

  // Payables row
  payables:          number
  payablesDue30:     number

  // Partner Debt row
  partnerDebt:       number
  nextTrancheDays:   number | null
  nextTrancheAmt:    number

  // Period P&L row
  periodPnl:         number
  ytdPnl:            number
  periodLabel:       string
}

function DeltaBadge({ value, inverse = false }: { value: number; inverse?: boolean }) {
  if (value === 0) return <span className="text-[#475569]">—</span>
  const positive = inverse ? value < 0 : value > 0
  return (
    <span className={`tabular-nums text-[11px] font-semibold ${positive ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
      {value > 0 ? '+' : ''}{fmtTRY(value, 0)}
    </span>
  )
}

function BlotterRow({
  label,
  amount,
  delta,
  deltaInverse = false,
  context,
  contextSeverity = 'neutral',
  href,
}: {
  label:            string
  amount:           number
  delta:            number
  deltaInverse?:    boolean
  context:          string
  contextSeverity?: 'neutral' | 'warn' | 'critical' | 'ok'
  href:             string
}) {
  const ctxColor =
    contextSeverity === 'critical' ? 'text-[#f87171]' :
    contextSeverity === 'warn'     ? 'text-[#fbbf24]' :
    contextSeverity === 'ok'       ? 'text-[#4ade80]' :
    'text-[#64748b]'

  return (
    <Link href={href}
      className="grid grid-cols-[6rem_1fr_auto_auto] items-center gap-4 px-4 py-2.5 border-b border-[#1e293b] hover:bg-[#1e293b]/60 transition-colors group last:border-b-0">
      {/* Label */}
      <span className="text-[10px] font-black uppercase tracking-widest text-[#475569] group-hover:text-[#64748b] transition-colors">
        {label}
      </span>
      {/* Amount */}
      <span className="text-sm font-black tabular-nums text-white font-mono">
        {fmtTRY(amount, 0)}
      </span>
      {/* Delta */}
      <div className="text-right">
        <DeltaBadge value={delta} inverse={deltaInverse} />
      </div>
      {/* Context */}
      <span className={`text-[11px] text-right tabular-nums ${ctxColor} font-mono w-28`}>
        {context}
      </span>
    </Link>
  )
}

export function TreasuryBlotter({
  cash, cashDelta, cashRunwayMonths,
  receivables, receivablesDelta, avgAgingDays,
  payables, payablesDue30,
  partnerDebt, nextTrancheDays, nextTrancheAmt,
  periodPnl, ytdPnl, periodLabel,
}: TreasuryBlotterProps) {

  const runwayStr = (() => {
    if (cashRunwayMonths <= 0) return 'nakit yok'
    if (cashRunwayMonths >= 24) return `${Math.floor(cashRunwayMonths / 12)} yıl+`
    if (cashRunwayMonths >= 1)  return `${Math.round(cashRunwayMonths)} ay ömür`
    return `${Math.round(cashRunwayMonths * 30)} gün ömür`
  })()
  const runwaySeverity: 'critical' | 'warn' | 'ok' | 'neutral' =
    cashRunwayMonths <= 0 ? 'critical' :
    cashRunwayMonths < 1.5 ? 'critical' :
    cashRunwayMonths < 3 ? 'warn' : 'ok'

  const agingStr = avgAgingDays > 0 ? `ort. ${Math.round(avgAgingDays)} g` : 'vade içi'
  const agingSev: 'critical' | 'warn' | 'ok' | 'neutral' =
    avgAgingDays > 60 ? 'critical' :
    avgAgingDays > 30 ? 'warn' :
    avgAgingDays > 0  ? 'neutral' : 'ok'

  const due30Str = payablesDue30 > 0 ? `${fmtCompact(payablesDue30)} 30g içinde` : '30g içinde yok'
  const due30Sev: 'critical' | 'warn' | 'neutral' =
    payablesDue30 > 0 && payablesDue30 > payables * 0.5 ? 'critical' :
    payablesDue30 > 0 ? 'warn' : 'neutral'

  const trancheStr = nextTrancheDays == null
    ? 'vade yok'
    : nextTrancheDays === 0
      ? `bugün! ${fmtCompact(nextTrancheAmt)}`
      : `${nextTrancheDays}g — ${fmtCompact(nextTrancheAmt)}`
  const trancheSev: 'critical' | 'warn' | 'ok' | 'neutral' =
    nextTrancheDays == null ? 'neutral' :
    nextTrancheDays <= 7  ? 'critical' :
    nextTrancheDays <= 21 ? 'warn' : 'neutral'

  const pnlStr   = `YTD: ${fmtCompact(ytdPnl)}`
  const pnlSev: 'ok' | 'critical' | 'neutral' =
    periodPnl >= 0 && ytdPnl >= 0 ? 'ok' :
    periodPnl < 0 || ytdPnl < 0   ? 'critical' : 'neutral'

  return (
    <div className="bg-[#0f172a] rounded overflow-hidden border border-[#1e293b]">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e293b]">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#475569]">
          Hazine Defteri
        </span>
        <span className="text-[9px] text-[#334155] tabular-nums">{periodLabel}</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[6rem_1fr_auto_auto] gap-4 px-4 py-1.5 border-b border-[#1e293b]/60">
        <span className="text-[8px] uppercase tracking-widest text-[#334155]">Kalem</span>
        <span className="text-[8px] uppercase tracking-widest text-[#334155]">Tutar</span>
        <span className="text-[8px] uppercase tracking-widest text-[#334155] text-right">Değişim</span>
        <span className="text-[8px] uppercase tracking-widest text-[#334155] text-right w-28">Bağlam</span>
      </div>

      {/* Rows */}
      <BlotterRow
        label="Nakit"
        amount={cash}
        delta={cashDelta}
        context={runwayStr}
        contextSeverity={runwaySeverity}
        href="/dashboard/planning?tab=cash-projection"
      />
      <BlotterRow
        label="Alacaklar"
        amount={receivables}
        delta={receivablesDelta}
        deltaInverse
        context={agingStr}
        contextSeverity={agingSev}
        href="/dashboard/commercial?tab=collections"
      />
      <BlotterRow
        label="Borçlar"
        amount={payables}
        delta={0}
        deltaInverse
        context={due30Str}
        contextSeverity={due30Sev}
        href="/dashboard/operations?tab=expenses"
      />
      <BlotterRow
        label="Ortak Borç"
        amount={partnerDebt}
        delta={0}
        deltaInverse
        context={trancheStr}
        contextSeverity={trancheSev}
        href="/dashboard/partners?tab=tranches"
      />
      <BlotterRow
        label="Dönem K/Z"
        amount={periodPnl}
        delta={0}
        context={pnlStr}
        contextSeverity={pnlSev}
        href="/dashboard/finance?tab=pnl"
      />
    </div>
  )
}
