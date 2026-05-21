'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SituationBrief — Authoritative situation line + 3 compact pressure signals
//
// One sentence describing company state from SituationEngine output.
// Below: 3 compact pressure indicators (not KPI cards — compact signals).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { fmtTRY, fmtCompact } from '@/lib/format'

export interface SituationBriefProps {
  situationLine:    string
  situationStatus:  'healthy' | 'caution' | 'at-risk' | 'critical'
  compositeScore:   number

  // 3 compact pressure signals
  cashRunwayDays:   number      // -1 = unknown
  receivablesTotal: number
  overdueTotal60:   number
  debtServiceRatio: number      // 0–1
}

type Severity = 'ok' | 'warn' | 'critical' | 'neutral'

function Signal({
  label, value, context, severity, href,
}: {
  label:    string
  value:    string
  context:  string
  severity: Severity
  href:     string
}) {
  const dotColor =
    severity === 'critical' ? 'bg-neg'  :
    severity === 'warn'     ? 'bg-warn' :
    severity === 'ok'       ? 'bg-pos'  :
    'bg-[#475569]'

  const valueColor =
    severity === 'critical' ? 'text-neg-text' :
    severity === 'warn'     ? 'text-warn-text' :
    severity === 'ok'       ? 'text-pos-text'  :
    'text-[#64748b]'

  return (
    <Link href={href}
      className="flex items-center gap-2.5 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded hover:bg-white hover:border-[#cbd5e1] transition-colors group">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
      <div className="min-w-0">
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">{label}</div>
        <div className={`text-[13px] font-black tabular-nums leading-tight ${valueColor}`}>{value}</div>
        <div className="text-[10px] text-[#94a3b8] leading-tight">{context}</div>
      </div>
    </Link>
  )
}

export function SituationBrief({
  situationLine,
  situationStatus,
  compositeScore,
  cashRunwayDays,
  receivablesTotal,
  overdueTotal60,
  debtServiceRatio,
}: SituationBriefProps) {

  const statusColor: Record<string, string> = {
    healthy:  'text-pos-text',
    caution:  'text-warn-text',
    'at-risk':'text-warn-text',
    critical: 'text-neg-text',
  }
  const statusBorder: Record<string, string> = {
    healthy:  'border-pos-light',
    caution:  'border-warn-light',
    'at-risk':'border-warn-light',
    critical: 'border-neg-light',
  }
  const statusLabel: Record<string, string> = {
    healthy:  'Sağlıklı',
    caution:  'Dikkat',
    'at-risk':'Riskli',
    critical: 'Kritik',
  }

  // Signal 1: Cash runway
  const runwaySeverity: Severity =
    cashRunwayDays < 0  ? 'neutral' :
    cashRunwayDays < 45 ? 'critical' :
    cashRunwayDays < 90 ? 'warn'    : 'ok'
  const runwayValue =
    cashRunwayDays < 0  ? '—' :
    cashRunwayDays >= 365 ? `${Math.round(cashRunwayDays / 30)}ay` :
    `${cashRunwayDays}g`
  const runwayCtx =
    cashRunwayDays < 0  ? 'Bakiye girilmedi'  :
    cashRunwayDays < 30 ? 'Nakit tükeniyor!'  :
    cashRunwayDays < 90 ? 'Yakın takip'       : 'Nakit ömrü'

  // Signal 2: Receivables aging
  const agingSev: Severity =
    overdueTotal60 > receivablesTotal * 0.3 && overdueTotal60 > 0 ? 'critical' :
    overdueTotal60 > 0 ? 'warn' :
    receivablesTotal > 0 ? 'neutral' : 'ok'
  const agingValue = fmtCompact(receivablesTotal)
  const agingCtx =
    overdueTotal60 > 0 ? `${fmtCompact(overdueTotal60)} 60g+` :
    receivablesTotal > 0 ? 'Vade içi' : 'Temiz'

  // Signal 3: Debt service ratio
  const dsrSev: Severity =
    debtServiceRatio === 0 ? 'ok' :
    debtServiceRatio > 0.6 ? 'critical' :
    debtServiceRatio > 0.3 ? 'warn' : 'ok'
  const dsrValue = debtServiceRatio > 0
    ? `%${Math.round(debtServiceRatio * 100)}`
    : '—'
  const dsrCtx =
    debtServiceRatio === 0 ? 'Borç servisi yok' :
    debtServiceRatio > 0.6 ? 'DSR kritik düzey' :
    debtServiceRatio > 0.3 ? 'DSR izleme' : 'DSR sürdürülebilir'

  return (
    <div className={`bg-white border rounded shadow-sm overflow-hidden ${statusBorder[situationStatus] ?? 'border-[#e2e8f0]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9]">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Durum Tespiti</span>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-black tabular-nums ${statusColor[situationStatus] ?? 'text-[#64748b]'}`}>
            {compositeScore}/100
          </span>
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${statusBorder[situationStatus]} ${statusColor[situationStatus]}`}>
            {statusLabel[situationStatus] ?? situationStatus}
          </span>
        </div>
      </div>

      {/* Situation line */}
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-[#0f172a] leading-snug">
          {situationLine}
        </p>
      </div>

      {/* 3 compact pressure signals */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
        <Signal
          label="Nakit Ömrü"
          value={runwayValue}
          context={runwayCtx}
          severity={runwaySeverity}
          href="/dashboard/planning?tab=cash-projection"
        />
        <Signal
          label="Alacak"
          value={agingValue}
          context={agingCtx}
          severity={agingSev}
          href="/dashboard/commercial?tab=collections"
        />
        <Signal
          label="DSR"
          value={dsrValue}
          context={dsrCtx}
          severity={dsrSev}
          href="/dashboard/partners?tab=tranches"
        />
      </div>
    </div>
  )
}
