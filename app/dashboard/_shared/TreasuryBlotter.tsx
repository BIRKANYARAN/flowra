'use client'

// ─────────────────────────────────────────────────────────────────────────────
// TreasuryBlotter — 5-row institutional ledger
//
// Rows: Cash · Receivables · Payables · Partner Debt · Period P&L
// Style: white card — matches SituationBrief / DecisionQueue vocabulary
// Severity: left-border accent + muted pill (no standalone dark-bg island)
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

type Severity = 'ok' | 'warn' | 'critical' | 'neutral'

const SEV_LEFT: Record<Severity, string> = {
  critical: 'border-l-[3px] border-l-[#ef4444]',
  warn:     'border-l-[3px] border-l-[#f59e0b]',
  ok:       'border-l-[3px] border-l-[#22c55e]',
  neutral:  'border-l-[3px] border-l-transparent',
}

const SEV_PILL: Record<Severity, string> = {
  critical: 'bg-[#fef2f2] text-[#dc2626]',
  warn:     'bg-[#fffbeb] text-[#d97706]',
  ok:       'bg-[#f0fdf4] text-[#16a34a]',
  neutral:  'bg-[#f8fafc]  text-[#64748b]',
}

const DELTA_POS = 'text-[#16a34a]'
const DELTA_NEG = 'text-[#dc2626]'

function DeltaBadge({ value, inverse = false }: { value: number; inverse?: boolean }) {
  if (value === 0) return <span className="text-[#cbd5e1] text-[11px]">—</span>
  const positive = inverse ? value < 0 : value > 0
  return (
    <span className={`tabular-nums text-[11px] font-semibold ${positive ? DELTA_POS : DELTA_NEG}`}>
      {value > 0 ? '+' : ''}{fmtTRY(value, 0)}
    </span>
  )
}

function BlotterRow({
  label,
  amount,
  amountNegative = false,
  delta,
  deltaInverse = false,
  context,
  severity = 'neutral',
  href,
}: {
  label:           string
  amount:          number
  amountNegative?: boolean
  delta:           number
  deltaInverse?:   boolean
  context:         string
  severity?:       Severity
  href:            string
}) {
  const amountColor = amountNegative
    ? amount < 0 ? DELTA_NEG : 'text-[#0f172a]'
    : 'text-[#0f172a]'

  return (
    <Link
      href={href}
      className={`grid grid-cols-[5.5rem_1fr_auto_auto] items-center gap-3 px-4 py-3 border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors group last:border-b-0 ${SEV_LEFT[severity]}`}
    >
      {/* Label */}
      <span className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8] group-hover:text-[#64748b] transition-colors truncate">
        {label}
      </span>

      {/* Amount */}
      <span className={`text-[13px] font-black tabular-nums font-mono leading-none ${amountColor}`}>
        {fmtTRY(amount, 0)}
      </span>

      {/* Delta */}
      <div className="text-right min-w-[3rem]">
        <DeltaBadge value={delta} inverse={deltaInverse} />
      </div>

      {/* Context pill */}
      <span className={`text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded whitespace-nowrap ${SEV_PILL[severity]}`}>
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

  // ── Runway ───────────────────────────────────────────────────────────────
  const runwayStr =
    cashRunwayMonths <= 0   ? 'nakit yok' :
    cashRunwayMonths >= 24  ? `${Math.floor(cashRunwayMonths / 12)} yıl+` :
    cashRunwayMonths >= 1   ? `${Math.round(cashRunwayMonths)} ay ömür` :
    `${Math.round(cashRunwayMonths * 30)} gün ömür`
  const runwaySev: Severity =
    cashRunwayMonths <= 0   ? 'critical' :
    cashRunwayMonths < 1.5  ? 'critical' :
    cashRunwayMonths < 3    ? 'warn' : 'ok'

  // ── Aging ────────────────────────────────────────────────────────────────
  const agingStr = avgAgingDays > 0 ? `ort. ${Math.round(avgAgingDays)} gün` : 'vade içi'
  const agingSev: Severity =
    avgAgingDays > 60 ? 'critical' :
    avgAgingDays > 30 ? 'warn' :
    avgAgingDays > 0  ? 'neutral' : 'ok'

  // ── Due-30 ───────────────────────────────────────────────────────────────
  const due30Str = payablesDue30 > 0 ? `${fmtCompact(payablesDue30)} / 30 gün` : '30 gün içinde yok'
  const due30Sev: Severity =
    payablesDue30 > 0 && payablesDue30 > payables * 0.5 ? 'critical' :
    payablesDue30 > 0 ? 'warn' : 'neutral'

  // ── Tranche ──────────────────────────────────────────────────────────────
  const trancheStr =
    nextTrancheDays == null  ? 'vade yok' :
    nextTrancheDays === 0    ? `bugün! ${fmtCompact(nextTrancheAmt)}` :
    `${nextTrancheDays} gün — ${fmtCompact(nextTrancheAmt)}`
  const trancheSev: Severity =
    nextTrancheDays == null  ? 'neutral' :
    nextTrancheDays <= 7     ? 'critical' :
    nextTrancheDays <= 21    ? 'warn' : 'neutral'

  // ── P&L ──────────────────────────────────────────────────────────────────
  const pnlStr  = `YTD: ${fmtTRY(ytdPnl, 0)}`
  const pnlSev: Severity =
    periodPnl >= 0 && ytdPnl >= 0 ? 'ok' :
    periodPnl < 0 || ytdPnl < 0   ? 'critical' : 'neutral'

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9]">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
          Hazine Defteri
        </span>
        <span className="text-[9px] text-[#cbd5e1] tabular-nums">{periodLabel}</span>
      </div>

      {/* Rows */}
      <BlotterRow
        label="Nakit"
        amount={cash}
        delta={cashDelta}
        context={runwayStr}
        severity={runwaySev}
        href="/dashboard/planning?tab=cash-projection"
      />
      <BlotterRow
        label="Alacaklar"
        amount={receivables}
        delta={receivablesDelta}
        deltaInverse
        context={agingStr}
        severity={agingSev}
        href="/dashboard/commercial?tab=collections"
      />
      <BlotterRow
        label="Borçlar"
        amount={payables}
        delta={0}
        deltaInverse
        context={due30Str}
        severity={due30Sev}
        href="/dashboard/operations?tab=expenses"
      />
      <BlotterRow
        label="Ortak Borç"
        amount={partnerDebt}
        delta={0}
        deltaInverse
        context={trancheStr}
        severity={trancheSev}
        href="/dashboard/partners?tab=tranches"
      />
      <BlotterRow
        label="Dönem K/Z"
        amount={periodPnl}
        amountNegative
        delta={0}
        context={pnlStr}
        severity={pnlSev}
        href="/dashboard/finance?tab=pnl"
      />
    </div>
  )
}
