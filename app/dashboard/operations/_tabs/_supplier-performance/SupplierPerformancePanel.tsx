'use client'

// ── SupplierPerformancePanel — PO-based supplier performance & KPIs ───────────
// Client component — fetches /api/commercial/supplier-performance on mount.

import { useState, useEffect } from 'react'
import { fmtTRY, fmtDate } from '@/lib/format'
import type {
  SupplierPerformanceReport,
  SupplierPerformanceProfile,
} from '@/lib/services/commercial/supplier-performance.service'

// ── Grade badge colors ─────────────────────────────────────────────────────────

const GRADE_COLORS: Record<SupplierPerformanceProfile['performance_grade'], string> = {
  excellent:        'bg-[#dcfce7] text-[#15803d]',
  good:             'bg-[#dbeafe] text-[#1d4ed8]',
  fair:             'bg-[#fef9c3] text-[#854d0e]',
  poor:             'bg-[#fee2e2] text-[#991b1b]',
  insufficient_data:'bg-[#f1f5f9] text-[#64748b]',
}

const GRADE_LABELS: Record<SupplierPerformanceProfile['performance_grade'], string> = {
  excellent:        'Mükemmel',
  good:             'İyi',
  fair:             'Orta',
  poor:             'Zayıf',
  insufficient_data:'Yetersiz Veri',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SupplierPerformancePanel() {
  const [report, setReport] = useState<SupplierPerformanceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/commercial/supplier-performance', { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { report: SupplierPerformanceReport }) => {
        setReport(data.report)
      })
      .catch(e => {
        if (e?.name !== 'AbortError') {
          console.error('[SupplierPerformancePanel]', e)
          setError('Tedarikçi performansı yüklenemedi')
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Tedarikçi Performansı
        </div>
        <div className="text-xs text-[#94a3b8]">Yükleniyor…</div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Tedarikçi Performansı
        </div>
        <div className="text-xs text-[#94a3b8]">{error ?? 'Veri bulunamadı'}</div>
      </div>
    )
  }

  const { summary, suppliers } = report
  const top8 = suppliers.slice(0, 8)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 space-y-4 shadow-sm">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Tedarikçi Performansı
        </span>
        <span className="text-[9px] text-[#94a3b8]">{report.as_of_date} itibarıyla · Son 12 ay</span>
      </div>

      {/* ── Summary KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 border border-[#e2e8f0] rounded overflow-hidden">
        {[
          {
            label: 'Toplam Sipariş',
            value: summary.total_pos.toString(),
            color: 'text-[#0f172a]',
          },
          {
            label: 'Bekleyen',
            value: summary.pending_pos.toString(),
            color: summary.pending_pos > 0 ? 'text-[#d97706]' : 'text-[#94a3b8]',
          },
          {
            label: 'Gecikmiş',
            value: summary.overdue_pos.toString(),
            color: summary.overdue_pos > 0 ? 'text-[#dc2626]' : 'text-[#94a3b8]',
          },
          {
            label: 'Toplam Değer',
            value: fmtTRY(summary.total_value_try),
            color: 'text-[#0f172a]',
          },
          {
            label: 'Gecikmiş Değer',
            value: summary.overdue_value_try > 0 ? fmtTRY(summary.overdue_value_try) : '—',
            color: summary.overdue_value_try > 0 ? 'text-[#dc2626]' : 'text-[#94a3b8]',
          },
          {
            label: 'Bu Ay Teslim',
            value: summary.received_this_month.toString(),
            color: summary.received_this_month > 0 ? 'text-[#15803d]' : 'text-[#94a3b8]',
          },
        ].map((card, i) => (
          <div
            key={card.label}
            className={`p-3 ${
              i % 3 < 2 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''
            } ${i < 3 ? 'border-b border-[#e2e8f0]' : ''}`}
          >
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              {card.label}
            </div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Portfolio fulfillment ──────────────────────────────────────────── */}
      {report.avg_portfolio_fulfillment_pct !== null && (
        <div className="flex items-center gap-3 bg-[#f8fafc] rounded px-3 py-2">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Ortalama Portföy Karşılama Oranı
          </span>
          <span className={`text-sm font-black tabular-nums ${
            report.avg_portfolio_fulfillment_pct >= 90
              ? 'text-[#15803d]'
              : report.avg_portfolio_fulfillment_pct >= 75
              ? 'text-[#d97706]'
              : 'text-[#dc2626]'
          }`}>
            %{report.avg_portfolio_fulfillment_pct.toFixed(1)}
          </span>
        </div>
      )}

      {/* ── Supplier performance table ─────────────────────────────────────── */}
      {top8.length > 0 && (
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
            Tedarikçi Performans Tablosu
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  <th className="text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 pr-2">Tedarikçi</th>
                  <th className="text-center text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">Derece</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">Karşılama</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">Zamanında</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 px-2">Ort. Teslimat</th>
                  <th className="text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] pb-1.5 pl-2">Son Sipariş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {top8.map(sup => (
                  <tr key={sup.supplier_name} className="hover:bg-[#f8fafc]/60">
                    <td className="py-1.5 pr-2 font-medium text-[#334155] max-w-[140px] truncate">
                      {sup.supplier_name}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${GRADE_COLORS[sup.performance_grade]}`}>
                        {GRADE_LABELS[sup.performance_grade]}
                      </span>
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${
                      sup.fulfillment_rate_pct >= 90
                        ? 'text-[#15803d]'
                        : sup.fulfillment_rate_pct >= 70
                        ? 'text-[#d97706]'
                        : 'text-[#dc2626]'
                    }`}>
                      %{sup.fulfillment_rate_pct.toFixed(1)}
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${
                      sup.on_time_rate_pct === null
                        ? 'text-[#94a3b8]'
                        : sup.on_time_rate_pct >= 90
                        ? 'text-[#15803d]'
                        : sup.on_time_rate_pct >= 75
                        ? 'text-[#d97706]'
                        : 'text-[#dc2626]'
                    }`}>
                      {sup.on_time_rate_pct !== null ? `%${sup.on_time_rate_pct.toFixed(1)}` : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-[#64748b]">
                      {sup.avg_lead_time_days !== null ? `${sup.avg_lead_time_days} gün` : '—'}
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums text-[#94a3b8]">
                      {sup.last_order_date ? fmtDate(sup.last_order_date) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {suppliers.length > 8 && (
            <div className="mt-1.5 text-[10px] text-[#94a3b8]">
              +{suppliers.length - 8} tedarikçi daha
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {suppliers.length === 0 && (
        <div className="py-4 text-center text-xs text-[#94a3b8]">
          Son 12 ayda kayıtlı satın alma siparişi bulunamadı.
        </div>
      )}
    </div>
  )
}
