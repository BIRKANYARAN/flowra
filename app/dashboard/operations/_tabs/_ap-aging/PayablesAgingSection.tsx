'use client'

// ── PayablesAgingSection — Full AP Aging Entry List
// Client component — fetches /api/finance/ap-aging on mount.
// Displays bucket-colored rows with Turkish bucket labels.

import { useState, useEffect } from 'react'
import { fmtTRY } from '@/lib/format'
import type { APAgingReport, APAgingEntry, APAgingBucketSummary } from '@/lib/services/finance/ap-aging.service'

// ── Bucket row colors ─────────────────────────────────────────────────────────

const BUCKET_ROW_COLORS: Record<APAgingEntry['bucket'], string> = {
  current:      'bg-[#dcfce7]',
  days_1_30:    'bg-white',
  days_31_60:   'bg-[#fef9c3]',
  days_61_90:   'bg-[#ffedd5]',
  days_91_plus: 'bg-[#fee2e2]',
}

const BUCKET_TEXT_COLORS: Record<APAgingEntry['bucket'], string> = {
  current:      'text-[#15803d]',
  days_1_30:    'text-[#334155]',
  days_31_60:   'text-[#854d0e]',
  days_61_90:   'text-[#9a3412]',
  days_91_plus: 'text-[#991b1b]',
}

const BUCKET_BADGE_COLORS: Record<APAgingEntry['bucket'], string> = {
  current:      'bg-[#dcfce7] text-[#15803d]',
  days_1_30:    'bg-[#f1f5f9] text-[#64748b]',
  days_31_60:   'bg-[#fef9c3] text-[#854d0e]',
  days_61_90:   'bg-[#ffedd5] text-[#9a3412]',
  days_91_plus: 'bg-[#fee2e2] text-[#991b1b]',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PayablesAgingSection() {
  const [report, setReport] = useState<APAgingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/finance/ap-aging', { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ report: APAgingReport }>
      })
      .then(json => {
        setReport(json.report)
        setLoading(false)
      })
      .catch(err => {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
        setLoading(false)
      })

    return () => controller.abort()
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Borç Yaşlandırma
        </div>
        <div className="text-xs text-[#94a3b8] animate-pulse">Yükleniyor…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-neg-light border border-neg-light rounded p-4">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-neg-text mb-1">
          Borç Yaşlandırma
        </div>
        <div className="text-xs text-neg-text">Veri yüklenemedi: {error}</div>
      </div>
    )
  }

  if (!report || report.total_count === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
          Borç Yaşlandırma
        </div>
        <div className="text-xs text-[#94a3b8]">Bekleyen veya kısmi ödemeli gider bulunamadı.</div>
      </div>
    )
  }

  const fmt = (n: number) => fmtTRY(n)

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8eaef] flex items-center justify-between">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Borç Yaşlandırma (AP Aging)
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {report.as_of_date} itibarıyla · bekleyen ve kısmi ödemeli giderler
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-extrabold tabular-nums text-[#0f172a]">{fmt(report.total_outstanding_try)}</div>
          <div className="text-[10px] text-[#94a3b8]">{report.total_count} kayıt</div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 divide-x divide-[#f1f5f9] border-b border-[#e8eaef]">
        <div className="px-4 py-2.5 text-center">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">Kritik (&gt;30 Gün)</div>
          <div className={`text-sm font-extrabold tabular-nums ${report.critical_try > 0 ? 'text-[#991b1b]' : 'text-[#94a3b8]'}`}>
            {fmt(report.critical_try)}
          </div>
          <div className="text-[10px] text-[#94a3b8]">{report.critical_count} kayıt</div>
        </div>
        <div className="px-4 py-2.5 text-center">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">Ort. Gecikme</div>
          <div className="text-sm font-extrabold tabular-nums text-[#0f172a]">
            {report.avg_days_outstanding !== null ? `${Math.round(report.avg_days_outstanding)} gün` : '—'}
          </div>
        </div>
        <div className="px-4 py-2.5 text-center">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">En Eski</div>
          <div className={`text-sm font-extrabold tabular-nums ${(report.oldest_entry_days ?? 0) > 90 ? 'text-[#991b1b]' : 'text-[#0f172a]'}`}>
            {report.oldest_entry_days !== null ? `${report.oldest_entry_days} gün` : '—'}
          </div>
        </div>
      </div>

      {/* Bucket summary */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">Vade Dağılımı</div>
        <div className="grid grid-cols-5 gap-2">
          {report.buckets.map((b: APAgingBucketSummary) => (
            <div key={b.bucket} className={`rounded px-2 py-2 text-center ${BUCKET_BADGE_COLORS[b.bucket]}`}>
              <div className="text-[0.65rem] font-bold">{b.label}</div>
              <div className="text-sm font-extrabold tabular-nums mt-0.5">{fmt(b.total_try)}</div>
              <div className="text-[10px] mt-0.5">{b.count} kayıt · %{b.pct_of_total.toFixed(0)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Entry list */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Tedarikçi</th>
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Tür</th>
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Tarih</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Tutar</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Gün</th>
              <th className="text-center px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Vade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {report.entries.map((entry: APAgingEntry) => (
              <tr key={entry.id} className={`${BUCKET_ROW_COLORS[entry.bucket]} hover:brightness-95 transition-colors`}>
                <td className={`px-4 py-2 font-semibold ${BUCKET_TEXT_COLORS[entry.bucket]} truncate max-w-[160px]`}>
                  {entry.supplier_name}
                </td>
                <td className="px-4 py-2 text-[#64748b]">{entry.expense_type}</td>
                <td className="px-4 py-2 text-[#64748b] tabular-nums">{entry.expense_date}</td>
                <td className={`px-4 py-2 text-right font-mono font-bold tabular-nums ${BUCKET_TEXT_COLORS[entry.bucket]}`}>
                  {fmt(entry.amount_try)}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums font-semibold ${BUCKET_TEXT_COLORS[entry.bucket]}`}>
                  {entry.days_outstanding > 0 ? entry.days_outstanding : '—'}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${BUCKET_BADGE_COLORS[entry.bucket]}`}>
                    {report.buckets.find((b: APAgingBucketSummary) => b.bucket === entry.bucket)?.label ?? entry.bucket}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.total_count > 20 && (
        <div className="px-4 py-2 border-t border-[#e8eaef] text-[10px] text-[#94a3b8]">
          Tüm {report.total_count} kayıt gösteriliyor — vadesi geçenler en üstte
        </div>
      )}
    </div>
  )
}
