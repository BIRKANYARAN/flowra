'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LoanCovenantPanel — Partner Loan Covenant Monitoring
//
// Displays:
//   - Company-level DSR and ICR gauges with color-coded status
//   - Overall covenant risk score (0–100)
//   - Critical alerts banner
//   - Per-tranche covenant status table
//   - Metrics explanation footer
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import type {
  CovenantMonitoringReport,
  DsrStatus,
  IcrStatus,
} from '@/lib/services/pcle/loan-covenant.service'
import { fmtTRY, fmtNum } from '@/lib/format'

interface Props {
  companyId: string
}

// ── Status color helpers ──────────────────────────────────────────────────────

function dsrColor(status: DsrStatus): string {
  switch (status) {
    case 'healthy':  return 'text-pos-text bg-pos-light border-pos-light'
    case 'elevated': return 'text-warn-text bg-warn-light border-warn-light'
    case 'high':     return 'text-orange-700 bg-orange-50 border-orange-200'
    case 'critical': return 'text-neg-text bg-neg-light border-neg-light'
    default:         return 'text-[#64748b] bg-[#f8fafc] border-[#e2e8f0]'
  }
}

function icrColor(status: IcrStatus): string {
  switch (status) {
    case 'strong':   return 'text-pos-text bg-pos-light border-pos-light'
    case 'adequate': return 'text-info-text bg-info-light border-info-light'
    case 'thin':     return 'text-warn-text bg-warn-light border-warn-light'
    case 'breached': return 'text-neg-text bg-neg-light border-neg-light'
    default:         return 'text-[#64748b] bg-[#f8fafc] border-[#e2e8f0]'
  }
}

function riskScoreColor(score: number): string {
  if (score <= 20) return 'text-pos-text bg-pos-light border-pos-light'
  if (score <= 45) return 'text-warn-text bg-warn-light border-warn-light'
  if (score <= 70) return 'text-orange-700 bg-orange-50 border-orange-200'
  return 'text-neg-text bg-neg-light border-neg-light'
}

function rowBg(dsrStatus: DsrStatus, icrStatus: IcrStatus): string {
  if (dsrStatus === 'critical' || icrStatus === 'breached') return 'bg-neg-light/30'
  if (dsrStatus === 'high' || icrStatus === 'thin') return 'bg-orange-50/40'
  return ''
}

// ── DSR status label ──────────────────────────────────────────────────────────

function dsrLabel(status: DsrStatus): string {
  switch (status) {
    case 'healthy':  return 'Sağlıklı'
    case 'elevated': return 'Yükselen'
    case 'high':     return 'Yüksek'
    case 'critical': return 'Kritik'
    default:         return 'Bilinmiyor'
  }
}

function icrLabel(status: IcrStatus): string {
  switch (status) {
    case 'strong':   return 'Güçlü'
    case 'adequate': return 'Yeterli'
    case 'thin':     return 'Zayıf'
    case 'breached': return 'İhlal'
    default:         return 'Bilinmiyor'
  }
}

// ── Gauge bar component ───────────────────────────────────────────────────────

function GaugeBar({
  label,
  value,
  displayText,
  statusLabel,
  colorClass,
  fillPct,
}: {
  label: string
  value: string
  displayText: string
  statusLabel: string
  colorClass: string
  fillPct: number
}) {
  return (
    <div className={`border rounded px-4 py-3 ${colorClass}`}>
      <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-2xl font-black tabular-nums leading-none">{value}</span>
        <span className="text-xs font-semibold opacity-70">{statusLabel}</span>
      </div>
      <div className="h-1.5 bg-white/40 rounded-full overflow-hidden">
        <div
          className="h-1.5 bg-current rounded-full transition-all opacity-70"
          style={{ width: `${Math.min(100, Math.max(2, fillPct))}%` }}
        />
      </div>
      <div className="text-[10px] opacity-60 mt-1">{displayText}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function LoanCovenantPanel({ companyId: _companyId }: Props) {
  const [report, setReport] = useState<CovenantMonitoringReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/partners/loan-covenants', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setReport((d as { report: CovenantMonitoringReport }).report)
        setLoading(false)
      })
      .catch(err => {
        if ((err as Error)?.name !== 'AbortError') {
          setError('Kredi kovenanı verileri yüklenemedi')
          setLoading(false)
        }
      })
    return () => ctrl.abort()
  }, [])

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-6 bg-[#f1f5f9] rounded w-40" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-20 bg-[#f1f5f9] rounded" />
          <div className="h-20 bg-[#f1f5f9] rounded" />
          <div className="h-20 bg-[#f1f5f9] rounded" />
        </div>
        <div className="h-32 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text">
        {error}
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!report || report.tranches.length === 0) {
    return (
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-8 text-center text-xs text-[#94a3b8]">
        Aktif kredi dilimi bulunamadı
      </div>
    )
  }

  const {
    company_dsr,
    company_icr,
    company_dsr_status,
    company_icr_status,
    overall_covenant_risk_score,
    total_annual_debt_service_try,
    total_outstanding_loans_try,
    tranches,
    critical_alerts,
    ytd_net_income_try,
    ytd_ebitda_try,
  } = report

  // DSR fill: 0 = 0%, 0.70 = 100%
  const dsrFill = company_dsr !== null ? Math.min(100, (company_dsr / 0.70) * 100) : 50
  // ICR fill: 0 = 0%, 5+ = 100% (inverted: high ICR is good)
  const icrFill = company_icr !== null ? Math.min(100, (company_icr / 5) * 100) : 50

  return (
    <div className="space-y-3">

      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
        Kredi Kovenanı İzleme
      </div>

      {/* ── Critical alerts banner ───────────────────────────────────────────── */}
      {critical_alerts.length > 0 && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-neg-text mb-2">
            Kritik Kovenan Uyarıları
          </div>
          <div className="space-y-1">
            {critical_alerts.map((alert, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-neg-text">
                <span className="shrink-0 font-black mt-px">{i + 1}.</span>
                <span>{alert}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Covenant health gauges ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* DSR gauge */}
        <GaugeBar
          label="Borç Servis Oranı (DSR)"
          value={company_dsr !== null ? `%${Math.round(company_dsr * 100)}` : 'N/A'}
          statusLabel={dsrLabel(company_dsr_status)}
          displayText="Düşük daha iyi · Hedef: <0.30"
          colorClass={dsrColor(company_dsr_status)}
          fillPct={dsrFill}
        />

        {/* ICR gauge */}
        <GaugeBar
          label="Faiz Karşılama Oranı (ICR)"
          value={company_icr !== null ? `${company_icr.toFixed(1)}x` : 'N/A'}
          statusLabel={icrLabel(company_icr_status)}
          displayText="Yüksek daha iyi · Hedef: >3.0x"
          colorClass={icrColor(company_icr_status)}
          fillPct={icrFill}
        />

        {/* Overall risk score */}
        <div className={`border rounded px-4 py-3 ${riskScoreColor(overall_covenant_risk_score)}`}>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">
            Kovenan Risk Skoru
          </div>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-2xl font-black tabular-nums leading-none">
              {overall_covenant_risk_score.toFixed(0)}
            </span>
            <span className="text-xs font-semibold opacity-70">/ 100</span>
          </div>
          <div className="h-1.5 bg-white/40 rounded-full overflow-hidden">
            <div
              className="h-1.5 bg-current rounded-full transition-all opacity-70"
              style={{ width: `${Math.min(100, overall_covenant_risk_score)}%` }}
            />
          </div>
          <div className="text-[10px] opacity-60 mt-1">Düşük daha iyi</div>
        </div>
      </div>

      {/* ── Portfolio summary row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white border border-[#e2e8f0] rounded px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Toplam Borç</div>
          <div className="text-sm font-black text-[#0f172a] tabular-nums">{fmtTRY(total_outstanding_loans_try, 0)}</div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Yıllık Borç Servisi</div>
          <div className="text-sm font-black text-[#0f172a] tabular-nums">{fmtTRY(total_annual_debt_service_try, 0)}</div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">YTD Net Gelir</div>
          <div className={`text-sm font-black tabular-nums ${ytd_net_income_try >= 0 ? 'text-pos-text' : 'text-neg-text'}`}>
            {fmtTRY(ytd_net_income_try, 0)}
          </div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">YTD EBITDA</div>
          <div className={`text-sm font-black tabular-nums ${ytd_ebitda_try >= 0 ? 'text-pos-text' : 'text-neg-text'}`}>
            {fmtTRY(ytd_ebitda_try, 0)}
          </div>
        </div>
      </div>

      {/* ── Per-tranche table ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]/60">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Tranche Bazında Kovenan Durumu
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] sticky left-0 z-10 min-w-[120px]">
                  Ortak
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] whitespace-nowrap">
                  Bakiye
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] whitespace-nowrap">
                  Yıllık Oran
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] whitespace-nowrap">
                  Yıllık Faiz
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] whitespace-nowrap">
                  DSR Durumu
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] whitespace-nowrap">
                  ICR Durumu
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] whitespace-nowrap">
                  Risk Skoru
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {tranches.map(t => (
                <tr
                  key={t.tranche_id}
                  className={`hover:bg-[#fafafa] transition-colors ${rowBg(t.dsr_status, t.icr_status)}`}
                >
                  <td className="px-3 py-2 sticky left-0 z-10 bg-inherit whitespace-nowrap">
                    <div className="font-semibold text-[#0f172a]">{t.partner_name}</div>
                    {t.alerts.length > 0 && (
                      <div className="text-[10px] text-neg-text mt-0.5">
                        {t.alerts[0]}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-[#0f172a] tabular-nums whitespace-nowrap">
                    {fmtTRY(t.outstanding_try, 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#64748b] tabular-nums whitespace-nowrap">
                    %{fmtNum(t.annual_rate_pct, 1)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#64748b] tabular-nums whitespace-nowrap">
                    {fmtTRY(t.annual_interest_try, 0)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] font-black border px-1.5 py-0.5 rounded tracking-wide ${dsrColor(t.dsr_status)}`}>
                      {dsrLabel(t.dsr_status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] font-black border px-1.5 py-0.5 rounded tracking-wide ${icrColor(t.icr_status)}`}>
                      {icrLabel(t.icr_status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] font-black border px-2 py-0.5 rounded tabular-nums ${riskScoreColor(t.covenant_risk_score)}`}>
                      {t.covenant_risk_score.toFixed(0)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Metrics explanation ───────────────────────────────────────────────── */}
      <div className="text-[10px] text-[#94a3b8] leading-relaxed px-1 space-y-0.5">
        <div>
          <span className="font-bold text-[#64748b]">DSR: Borç Servis Oranı</span>
          {' '}— düşük daha iyi (hedef: &lt;0.30) · Sağlıklı &lt;0.30 · Yükselen 0.30–0.50 · Yüksek 0.50–0.70 · Kritik &gt;0.70
        </div>
        <div>
          <span className="font-bold text-[#64748b]">ICR: Faiz Karşılama Oranı</span>
          {' '}— yüksek daha iyi (hedef: &gt;3.0x) · Güçlü &gt;3.0x · Yeterli 2.0–3.0x · Zayıf 1.0–2.0x · İhlal &lt;1.0x
        </div>
      </div>

    </div>
  )
}
