'use client'

// ── SupplierAnalyticsPanel — AP aging, supplier concentration, payment behavior
// Client component — fetches /api/commercial/supplier-analytics on mount.
// No skeleton: simple loading state (text only) while data loads.

import { useState, useEffect } from 'react'
import { fmtTRY } from '@/lib/format'
import type { SupplierAnalyticsReport, SupplierProfile } from '@/lib/services/commercial/supplier-analytics.service'

// ── Risk tier badge colors ─────────────────────────────────────────────────────

const RISK_COLORS: Record<SupplierProfile['risk_tier'], string> = {
  low:      'bg-[#dcfce7] text-[#15803d]',
  medium:   'bg-[#fef9c3] text-[#854d0e]',
  high:     'bg-[#ffedd5] text-[#9a3412]',
  critical: 'bg-[#fee2e2] text-[#991b1b]',
}

const RISK_LABELS: Record<SupplierProfile['risk_tier'], string> = {
  low:      'Düşük',
  medium:   'Orta',
  high:     'Yüksek',
  critical: 'Kritik',
}

const CONCENTRATION_COLORS: Record<SupplierAnalyticsReport['concentration_status'], string> = {
  low:      'bg-[#dcfce7] text-[#15803d]',
  moderate: 'bg-[#fef9c3] text-[#854d0e]',
  high:     'bg-[#fee2e2] text-[#991b1b]',
}

const CONCENTRATION_LABELS: Record<SupplierAnalyticsReport['concentration_status'], string> = {
  low:      'Düşük Konsantrasyon',
  moderate: 'Orta Konsantrasyon',
  high:     'Yüksek Konsantrasyon',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SupplierAnalyticsPanel() {
  const [report, setReport] = useState<SupplierAnalyticsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/commercial/supplier-analytics', { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { report: SupplierAnalyticsReport }) => {
        setReport(data.report)
      })
      .catch(e => {
        if (e?.name !== 'AbortError') {
          console.error('[SupplierAnalyticsPanel]', e)
          setError('Tedarikçi verileri yüklenemedi')
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Tedarikçi Analizi
        </div>
        <div className="text-xs text-[#94a3b8]">Yükleniyor…</div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Tedarikçi Analizi
        </div>
        <div className="text-xs text-[#94a3b8]">{error ?? 'Veri bulunamadı'}</div>
      </div>
    )
  }

  const top5 = report.suppliers.slice(0, 5)

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 space-y-4 shadow-sm">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Tedarikçi Analizi
        </span>
        <span className="text-[9px] text-[#94a3b8]">{report.period_label}</span>
      </div>

      {/* ── Summary row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border border-[#e8eaef] rounded overflow-hidden">
        {[
          {
            label: 'Toplam Borç',
            value: fmtTRY(report.total_payables_try),
            color: report.total_payables_try > 0 ? 'text-[#0f172a]' : 'text-[#94a3b8]',
          },
          {
            label: 'Gecikmiş Borç',
            value: fmtTRY(report.total_overdue_try),
            color: report.total_overdue_try > 0 ? 'text-[#dc2626]' : 'text-[#94a3b8]',
          },
          {
            label: 'Gecikme Oranı',
            value: report.total_payables_try > 0
              ? `%${(report.overdue_ratio * 100).toFixed(1)}`
              : '—',
            color: report.overdue_ratio > 0.3 ? 'text-[#dc2626]' : report.overdue_ratio > 0.1 ? 'text-[#d97706]' : 'text-[#15803d]',
          },
          {
            label: 'Konsantrasyon',
            value: null,
            badge: report.concentration_status,
            color: '',
          },
        ].map((card, i) => (
          <div
            key={card.label}
            className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e8eaef]' : ''}`}
          >
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              {card.label}
            </div>
            {card.badge ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${CONCENTRATION_COLORS[card.badge]}`}>
                {CONCENTRATION_LABELS[card.badge]}
              </span>
            ) : (
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>
                {card.value}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── AP Aging table ─────────────────────────────────────────────────── */}
      {report.aging.some(b => b.count > 0) && (
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
            AP Aging (Ödenecekler Yaşlandırma)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e8eaef]">
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 pr-2">Dönem</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">Kayıt</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 pl-2">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {report.aging.map(bucket => (
                  <tr key={bucket.bucket} className="hover:bg-[#f8fafc]/60">
                    <td className="py-1.5 pr-2 font-medium text-[#334155]">{bucket.label}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-[#64748b]">{bucket.count}</td>
                    <td className={`py-1.5 pl-2 text-right tabular-nums font-semibold ${
                      bucket.bucket === 'current'
                        ? 'text-[#1e293b]'
                        : bucket.count > 0 ? 'text-[#dc2626]' : 'text-[#94a3b8]'
                    }`}>
                      {bucket.total_try > 0 ? fmtTRY(bucket.total_try) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#e8eaef]">
                  <td className="py-1.5 pr-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[#64748b] text-xs font-semibold">
                    {report.aging.reduce((s, b) => s + b.count, 0)}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-xs font-black text-[#1e293b]">
                    {fmtTRY(report.total_payables_try)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Top 5 suppliers table ──────────────────────────────────────────── */}
      {top5.length > 0 && (
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
            En Büyük Tedarikçiler (İlk 5)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e8eaef]">
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 pr-2">Tedarikçi</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">Toplam</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">Ödenmemiş</th>
                  <th className="text-center text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 pl-2">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {top5.map(sup => (
                  <tr key={sup.supplier_name} className="hover:bg-[#f8fafc]/60">
                    <td className="py-1.5 pr-2 font-medium text-[#334155] max-w-[140px] truncate">
                      {sup.supplier_name}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-[#1e293b] font-semibold">
                      {fmtTRY(sup.total_expenses_try)}
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${
                      sup.unpaid_try > 0 ? 'text-[#dc2626]' : 'text-[#94a3b8]'
                    }`}>
                      {sup.unpaid_try > 0 ? fmtTRY(sup.unpaid_try) : '—'}
                    </td>
                    <td className="py-1.5 pl-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${RISK_COLORS[sup.risk_tier]}`}>
                        {RISK_LABELS[sup.risk_tier]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.suppliers.length > 5 && (
            <div className="mt-1.5 text-[10px] text-[#94a3b8]">
              +{report.suppliers.length - 5} tedarikçi daha
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {report.suppliers.length === 0 && (
        <div className="py-4 text-center text-xs text-[#94a3b8]">
          Son 6 ayda kayıtlı tedarikçi gideri bulunamadı.
        </div>
      )}
    </div>
  )
}
