'use client'
// ── InvoiceAgingClient — Invoice Aging Tracker with Urgency Scoring ───────────
// Client island: fetches /api/commercial/invoice-aging via TanStack Query.
// Shows portfolio risk score, aging bucket bars, collection priority table.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { InvoiceAgingReport, InvoiceAgingEntry, AgingBucket } from '@/lib/services/commercial/invoice-aging.service'

// ── Format helpers ────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const parts = d.slice(0, 10).split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

// ── Bucket display config ─────────────────────────────────────────────────────

const BUCKET_CFG: Record<AgingBucket, { label: string; barColor: string; textColor: string }> = {
  current:        { label: 'Cari',       barColor: '#22c55e', textColor: 'text-[#15803d]' },
  overdue_30:     { label: '1-30 Gün',   barColor: '#facc15', textColor: 'text-[#b45309]' },
  overdue_60:     { label: '31-60 Gün',  barColor: '#f97316', textColor: 'text-[#c2410c]' },
  overdue_90:     { label: '61-90 Gün',  barColor: '#ef4444', textColor: 'text-[#b91c1c]' },
  overdue_90plus: { label: '+90 Gün',    barColor: '#7f1d1d', textColor: 'text-[#7f1d1d]' },
}

// ── Risk level config ─────────────────────────────────────────────────────────

function riskLevel(score: number): { label: string; bg: string; text: string } {
  if (score <= 30) return { label: 'Düşük Risk',  bg: 'bg-[#f0fdf4]', text: 'text-[#15803d]' }
  if (score <= 60) return { label: 'Orta Risk',   bg: 'bg-[#fefce8]', text: 'text-[#b45309]' }
  if (score <= 80) return { label: 'Yüksek Risk', bg: 'bg-[#fff7ed]', text: 'text-[#c2410c]' }
  return               { label: 'Kritik Risk',  bg: 'bg-[#fef2f2]', text: 'text-[#b91c1c]' }
}

function urgencyColor(score: number): string {
  if (score >= 80) return 'text-[#b91c1c] font-black'
  if (score >= 60) return 'text-[#c2410c] font-bold'
  if (score >= 40) return 'text-[#b45309] font-semibold'
  return 'text-[#475569]'
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-56 bg-[#f1f5f9] rounded" />
      <div className="flex gap-4">
        <div className="h-10 w-24 bg-[#f1f5f9] rounded" />
        <div className="h-10 w-24 bg-[#f1f5f9] rounded" />
      </div>
      <div className="space-y-1.5">
        {[0,1,2,3,4].map(i => <div key={i} className="h-4 bg-[#f8fafc] rounded" />)}
      </div>
      <div className="h-32 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export default function InvoiceAgingClient({ companyId }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [asOfDate, setAsOfDate] = useState(today)

  const { data, isLoading, isError } = useQuery<{ report: InvoiceAgingReport }>({
    queryKey: ['invoice-aging', companyId, asOfDate],
    queryFn:  async () => {
      const params = new URLSearchParams({ asOf: asOfDate })
      const res = await fetch(`/api/commercial/invoice-aging?${params}`)
      if (!res.ok) throw new Error('Fatura yaşlandırma verisi alınamadı')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <Skeleton />

  if (isError) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 text-xs text-[#ef4444]">
        Fatura yaşlandırma verisi yüklenemedi.
      </div>
    )
  }

  const report = data?.report

  if (!report || report.all_invoices.length === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-xs text-[#94a3b8]">Bekleyen fatura bulunamadı</p>
      </div>
    )
  }

  const risk      = riskLevel(report.portfolio_risk_score)
  const maxBucket = Math.max(...report.bucket_summary.map(b => b.total_try), 1)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">

      {/* ── Header + date selector ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Fatura Yaşlandırma</div>
          <div className="text-xs text-[#64748b] mt-0.5">Tahsilat aciliyet skoru ve öncelik sırası</div>
        </div>

        {/* As-of date picker */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#94a3b8]">Tarih</span>
          <input
            type="date"
            value={asOfDate}
            max={today}
            onChange={e => setAsOfDate(e.target.value || today)}
            className="text-[11px] border border-[#e2e8f0] rounded px-2 py-1 text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#94a3b8]"
          />
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 border-b border-[#f1f5f9]">

        {/* Portfolio risk score */}
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[#94a3b8] font-medium">Portföy Risk Skoru</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black tabular-nums text-[#0f172a] leading-none">
                {Math.round(report.portfolio_risk_score)}
              </span>
              <span className="text-[10px] text-[#94a3b8]">/100</span>
            </div>
          </div>
          <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded ${risk.bg} ${risk.text}`}>
            {risk.label}
          </span>
        </div>

        <div className="h-8 w-px bg-[#f1f5f9]" />

        {/* Totals */}
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Toplam Açık</div>
          <div className="font-black tabular-nums text-sm text-[#0f172a]">{fmtTRY(report.total_outstanding_try)}</div>
        </div>

        {report.total_overdue_try > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Vadesi Geçmiş</div>
            <div className="font-black tabular-nums text-sm text-[#b91c1c]">{fmtTRY(report.total_overdue_try)}</div>
          </div>
        )}

        {report.total_current_try > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Cari (Vadesi Gelmemiş)</div>
            <div className="font-black tabular-nums text-sm text-[#15803d]">{fmtTRY(report.total_current_try)}</div>
          </div>
        )}
      </div>

      {/* ── +90 day warning banner ─────────────────────────────────────────── */}
      {report.overdue_90plus_count > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-[#fef2f2] border border-[#fecaca] rounded text-[11px] font-semibold text-[#b91c1c]">
          <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0" />
          {report.overdue_90plus_count} fatura +90 günde — tahsilat riski yüksek
        </div>
      )}

      {/* ── Aging bucket bars ──────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-[#f1f5f9]">
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Yaşlandırma Dağılımı
        </div>
        <div className="space-y-2">
          {report.bucket_summary.map(b => {
            const cfg   = BUCKET_CFG[b.bucket as AgingBucket]
            const width = maxBucket > 0 ? (b.total_try / maxBucket) * 100 : 0
            return (
              <div key={b.bucket} className="flex items-center gap-3">
                <div className="w-20 text-[10px] text-[#64748b] shrink-0">{cfg.label}</div>
                <div className="flex-1 h-4 bg-[#f8fafc] rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{ width: `${width}%`, backgroundColor: cfg.barColor }}
                  />
                </div>
                <div className="w-24 text-right text-[10px] tabular-nums font-semibold text-[#334155]">
                  {b.count > 0 ? fmtTRY(b.total_try) : '—'}
                </div>
                <div className="w-10 text-right text-[10px] tabular-nums text-[#94a3b8]">
                  {b.count > 0 ? `%${b.pct_of_total.toFixed(0)}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Collection priority table (top 10) ────────────────────────────── */}
      <div className="px-4 pt-3 pb-1">
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Tahsilat Öncelik Sırası (İlk 10)
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 text-[#94a3b8] font-medium">Müşteri</th>
              <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Kalan Tutar</th>
              <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Gecikme (Gün)</th>
              <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Aciliyet</th>
              <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Tahmini Tahsilat</th>
              <th className="text-right px-4 py-2 text-[#94a3b8] font-medium">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {report.collection_priority.map((inv: InvoiceAgingEntry) => {
              const bucketCfg  = BUCKET_CFG[inv.bucket]
              const isOverdue  = inv.aging_days > 0
              return (
                <tr key={inv.sale_id} className="border-b border-[#f8fafc] hover:bg-[#fafafa]">
                  {/* Customer */}
                  <td className="px-4 py-2">
                    <div className="font-medium text-[#334155] truncate max-w-[160px]">
                      {inv.customer_name ?? 'Bilinmeyen'}
                    </div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">
                      {fmtDate(inv.due_date ?? inv.invoice_date)}
                    </div>
                  </td>

                  {/* Amount due */}
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-[#0f172a]">
                    {fmtTRY(inv.remaining_try)}
                  </td>

                  {/* Days overdue */}
                  <td className="px-2 py-2 text-right">
                    {isOverdue ? (
                      <span className={`tabular-nums font-semibold ${bucketCfg.textColor}`}>
                        {inv.aging_days} gün
                      </span>
                    ) : (
                      <span className="text-[#22c55e] font-medium tabular-nums">
                        {Math.abs(inv.aging_days)} gün kaldı
                      </span>
                    )}
                  </td>

                  {/* Urgency score */}
                  <td className="px-2 py-2 text-right">
                    <span className={`tabular-nums text-sm ${urgencyColor(inv.urgency_score)}`}>
                      {inv.urgency_score}
                    </span>
                  </td>

                  {/* Estimated collection */}
                  <td className="px-2 py-2 text-right tabular-nums text-[#64748b]">
                    ~{inv.estimated_collection_days} gün
                  </td>

                  {/* Action */}
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold bg-[#f1f5f9] text-[#334155] hover:bg-[#e2e8f0] transition-colors"
                      onClick={() => {/* no-op visual only */}}
                    >
                      Ara
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-[10px] text-[#94a3b8]">
        Aciliyet skoru 0-100; gecikme süresi, tutar ve müşteri güvenilirliğine dayanır
      </div>
    </div>
  )
}
