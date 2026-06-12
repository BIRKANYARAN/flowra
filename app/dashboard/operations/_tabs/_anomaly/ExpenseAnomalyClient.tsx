'use client'
// ── ExpenseAnomalyClient — Statistical Expense Anomaly Detection UI ────────────
// Client island: fetches /api/finance/expense-anomaly via TanStack Query.
// Provides an analysis window selector, summary strip, severity breakdown,
// anomaly table, and a chip list of affected categories.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import type { ExpenseAnomalyReport, ExpenseAnomaly } from '@/lib/services/finance/expense-anomaly.service'

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── API response shape ─────────────────────────────────────────────────────────

interface ApiResponse {
  report: ExpenseAnomalyReport
}

// ── Window options ─────────────────────────────────────────────────────────────

const WINDOW_OPTIONS: { label: string; days: number }[] = [
  { label: '30 Gün',  days: 30  },
  { label: '60 Gün',  days: 60  },
  { label: '90 Gün',  days: 90  },
  { label: '180 Gün', days: 180 },
]

// ── Severity badge ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: ExpenseAnomaly['severity'] }) {
  if (severity === 'high') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#fee2e2] text-[#b91c1c] border border-[#fca5a5]">
        Yüksek
      </span>
    )
  }
  if (severity === 'medium') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-warn-light text-warn-text border border-warn/30">
        Orta
      </span>
    )
  }
  if (severity === 'low') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#fefce8] text-[#a16207] border border-[#fde047]/50">
        Düşük
      </span>
    )
  }
  return null
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ExpenseAnomalyClient({ companyId }: Props) {
  const [windowDays, setWindowDays] = useState(90)

  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['expense-anomaly', companyId, windowDays],
    queryFn: async () => {
      const res = await fetch(`/api/finance/expense-anomaly?days=${windowDays}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 5 * 60_000,
  })

  const report = data?.report

  // Count by severity
  const highCount   = report?.anomalies.filter(a => a.severity === 'high').length ?? 0
  const mediumCount = report?.anomalies.filter(a => a.severity === 'medium').length ?? 0
  const lowCount    = report?.anomalies.filter(a => a.severity === 'low').length ?? 0

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#f1f5f9]">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Anormal Gider Tespiti
        </span>

        {/* Window selector */}
        <div className="flex items-center gap-1">
          {WINDOW_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setWindowDays(opt.days)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                windowDays === opt.days
                  ? 'bg-[#0f172a] text-white'
                  : 'text-[#64748b] hover:bg-[#f1f5f9]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="px-4 py-6 space-y-2 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 bg-[#f1f5f9] rounded" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="px-4 py-6 text-center text-xs text-neg">
          Anomali raporu yüklenemedi. Lütfen sayfayı yenileyin.
        </div>
      )}

      {/* Report loaded */}
      {report && !isLoading && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-[#e8eaef]">
            {[
              {
                label: 'İncelenen',
                value: String(report.total_expenses_analyzed),
                sub:   `${windowDays} günlük pencere`,
                color: 'text-[#0f172a]',
              },
              {
                label: 'Anomali',
                value: String(report.anomalies_found),
                sub:   'tespit edildi',
                color: report.anomalies_found > 0 ? 'text-warn-text' : 'text-pos-text',
              },
              {
                label: 'Yüksek Risk',
                value: String(report.high_severity_count),
                sub:   'yüksek ciddiyet',
                color: report.high_severity_count > 0 ? 'text-neg' : 'text-[#94a3b8]',
              },
              {
                label: 'Kopya Şüphesi',
                value: String(report.duplicate_suspects),
                sub:   'olası kopya fatura',
                color: report.duplicate_suspects > 0 ? 'text-neg' : 'text-[#94a3b8]',
              },
            ].map((card, i) => (
              <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e8eaef]' : ''}`}>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{card.label}</div>
                <div className={`text-xl font-extrabold tabular-nums leading-none ${card.color}`}>{card.value}</div>
                <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Severity breakdown chips */}
          {report.anomalies_found > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#f1f5f9]">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Ciddiyet</span>
              {highCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#fee2e2] text-[#b91c1c] border border-[#fca5a5]">
                  Yüksek {highCount}
                </span>
              )}
              {mediumCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-warn-light text-warn-text border border-warn/30">
                  Orta {mediumCount}
                </span>
              )}
              {lowCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#fefce8] text-[#a16207] border border-[#fde047]/50">
                  Düşük {lowCount}
                </span>
              )}
              <span className="ml-auto text-[10px] text-[#94a3b8] tabular-nums">
                Toplam: <strong className="text-neg">{fmtTRY(report.total_anomalous_amount_try)}</strong>
              </span>
            </div>
          )}

          {/* Empty state */}
          {report.anomalies_found === 0 && (
            <div className="px-4 py-8 text-center">
              <div className="text-2xl mb-2">✓</div>
              <div className="text-sm font-semibold text-pos-text">{windowDays} günde anomali tespit edilmedi</div>
              <div className="text-xs text-[#94a3b8] mt-1">{report.total_expenses_analyzed} gider istatistiksel olarak normal görünüyor</div>
            </div>
          )}

          {/* Anomaly table */}
          {report.anomalies.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e8eaef]">
                    <th className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-4 py-2">Tedarikçi</th>
                    <th className="text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">Tutar</th>
                    <th className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">Kategori</th>
                    <th className="text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">Z-Skoru</th>
                    <th className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">Ciddiyet</th>
                    <th className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-2 py-2">Sebepler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f8fafc]">
                  {report.anomalies.map(anomaly => {
                    const isHighRow = anomaly.severity === 'high'
                    return (
                      <tr
                        key={anomaly.expense_id}
                        className={isHighRow ? 'bg-[#fff5f5]' : 'hover:bg-[#f8fafc]/60'}
                      >
                        <td className="px-4 py-2 text-[#334155] max-w-[140px]">
                          <div className="flex items-center gap-1 truncate">
                            {anomaly.is_potential_duplicate && (
                              <span title="Olası kopya fatura">⚠️</span>
                            )}
                            <span className="truncate">{anomaly.supplier_name ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold text-neg whitespace-nowrap">
                          {fmtTRY(anomaly.amount_try)}
                        </td>
                        <td className="px-2 py-2 text-[#334155] whitespace-nowrap">
                          {anomaly.expense_label}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                          {anomaly.z_score !== null ? (
                            <span className={Math.abs(anomaly.z_score) > 2 ? 'text-neg font-bold' : 'text-[#64748b]'}>
                              {anomaly.z_score.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[#94a3b8]">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <SeverityBadge severity={anomaly.severity} />
                        </td>
                        <td className="px-2 py-2 text-[#64748b] max-w-[240px]">
                          {anomaly.anomaly_reasons.length > 0 ? (
                            <ul className="space-y-0.5">
                              {anomaly.anomaly_reasons.map((reason, i) => (
                                <li key={i} className="text-[10px]">{reason}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-[#94a3b8]">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Categories with anomalies */}
          {report.categories_with_anomalies.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[#f1f5f9]">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                Etkilenen Kategoriler
              </span>
              {report.categories_with_anomalies.map(cat => (
                <span
                  key={cat}
                  className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold bg-[#f1f5f9] text-[#475569] border border-[#e8eaef]"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
