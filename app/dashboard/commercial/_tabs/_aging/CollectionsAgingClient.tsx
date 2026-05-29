'use client'
// ── CollectionsAgingClient — Collections Aging Heatmap & Recovery Probability ──
// Client island: fetches /api/commercial/collections-aging via TanStack Query.
// Shows aging bucket bars, write-off risk, expected recovery, priority actions,
// and DSO.

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { AgingBucket } from '@/lib/services/commercial/collections-aging.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgingConcentration {
  current_pct:  number
  overdue_pct:  number
  critical_pct: number
  hhi:          number
}

interface AgingSummary {
  total_outstanding:  number
  current:            number
  overdue_31_60:      number
  overdue_61_90:      number
  overdue_91_120:     number
  overdue_120_plus:   number
  concentration:      AgingConcentration
}

interface CustomerAging {
  customer_name:        string
  total_outstanding:    number
  oldest_invoice_days:  number
  bucket:               AgingBucket
  recovery_probability: number
  priority_score:       number
  invoice_count:        number
}

interface WriteOffRisk {
  high_risk_amount:   number
  medium_risk_amount: number
  low_risk_amount:    number
  high_risk_pct:      number | null
}

interface PriorityAction {
  customer_name:      string
  amount:             number
  days_overdue:       number
  recommended_action: string
}

interface CollectionsAgingReport {
  aging_summary:         AgingSummary
  customer_aging:        CustomerAging[]
  expected_recovery:     number
  write_off_risk:        WriteOffRisk
  dso:                   number | null
  top_priority_actions:  PriorityAction[]
}

// ── Bucket display config ─────────────────────────────────────────────────────

interface BucketConfig {
  label:     string
  barColor:  string
  textColor: string
  bgColor:   string
}

const BUCKET_CFG: Record<AgingBucket, BucketConfig> = {
  current:    { label: 'Güncel (0-30 Gün)',   barColor: '#22c55e', textColor: 'text-[#15803d]',  bgColor: 'bg-[#f0fdf4]' },
  '31_60':    { label: '31-60 Gün',           barColor: '#facc15', textColor: 'text-[#b45309]',  bgColor: 'bg-[#fefce8]' },
  '61_90':    { label: '61-90 Gün',           barColor: '#f97316', textColor: 'text-[#c2410c]',  bgColor: 'bg-[#fff7ed]' },
  '91_120':   { label: '91-120 Gün',          barColor: '#ef4444', textColor: 'text-[#b91c1c]',  bgColor: 'bg-[#fef2f2]' },
  '120_plus': { label: '120+ Gün',            barColor: '#7f1d1d', textColor: 'text-[#7f1d1d]',  bgColor: 'bg-[#fef2f2]' },
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-48 bg-[#f1f5f9] rounded" />
      <div className="flex gap-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex-1 h-12 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-24 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
      <div className="text-[11px] text-neg">{message}</div>
    </div>
  )
}

// ── Bucket bar ────────────────────────────────────────────────────────────────

function BucketBar({
  bucket,
  amount,
  total,
}: {
  bucket:  AgingBucket
  amount:  number
  total:   number
}) {
  const cfg  = BUCKET_CFG[bucket]
  const pct  = total > 0 ? (amount / total) * 100 : 0
  const show = amount > 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#64748b] font-medium">{cfg.label}</span>
        <span className={`font-black tabular-nums ${cfg.textColor}`}>
          {show ? fmtPct(pct) : '—'}
        </span>
      </div>
      <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: cfg.barColor }}
        />
      </div>
      <div className={`text-[10px] font-bold tabular-nums ${cfg.textColor}`}>
        {show ? fmtTRY(amount) : '—'}
      </div>
    </div>
  )
}

// ── Action badge ──────────────────────────────────────────────────────────────

function ActionBadge({ bucket }: { bucket: AgingBucket }) {
  const cfg = BUCKET_CFG[bucket]
  return (
    <span
      className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded ${cfg.bgColor} ${cfg.textColor}`}
    >
      {cfg.label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export default function CollectionsAgingClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: CollectionsAgingReport }>({
    queryKey:  ['collections-aging', companyId],
    queryFn:   () => fetch('/api/commercial/collections-aging').then(r => r.json()),
    staleTime: 4 * 60 * 1000, // 4 minutes
  })

  if (isLoading) return <Skeleton />
  if (isError || !data?.report) {
    return <ErrorState message="Alacak yaşlandırma verisi yüklenemedi." />
  }

  const report = data.report
  const { aging_summary, customer_aging, expected_recovery, write_off_risk, dso, top_priority_actions } = report

  const total = aging_summary.total_outstanding

  const BUCKETS: Array<{ key: AgingBucket; amount: number }> = [
    { key: 'current',    amount: aging_summary.current          },
    { key: '31_60',      amount: aging_summary.overdue_31_60    },
    { key: '61_90',      amount: aging_summary.overdue_61_90    },
    { key: '91_120',     amount: aging_summary.overdue_91_120   },
    { key: '120_plus',   amount: aging_summary.overdue_120_plus },
  ]

  if (total === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Alacak Yaşlandırma</div>
        <div className="text-xs text-[#64748b]">Açık alacak bulunmuyor.</div>
      </div>
    )
  }

  const recoveryRate = total > 0 ? (expected_recovery / total) * 100 : 0

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm space-y-0">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Alacak Yaşlandırma</div>
          <div className="text-xs text-[#64748b] mt-0.5">Müşteri bazlı yaş kovası, tahsilat önceliği ve tahmin edilen tahsilat</div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Toplam Açık</div>
            <div className="font-black tabular-nums text-[#0f172a]">{fmtTRY(total)}</div>
          </div>
          {dso !== null && (
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">DSO</div>
              <div className="font-black tabular-nums text-[#0f172a]">{dso} gün</div>
            </div>
          )}
          {aging_summary.concentration.critical_pct > 0 && (
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Kritik (%)</div>
              <div className="font-black tabular-nums text-neg">
                {fmtPct(aging_summary.concentration.critical_pct)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Stacked progress bar ───────────────────────────────────────────── */}
      <div className="flex h-2 mx-4 mt-3 rounded overflow-hidden gap-px">
        {BUCKETS.map(b => {
          const pct = total > 0 ? (b.amount / total) * 100 : 0
          return pct > 0 ? (
            <div
              key={b.key}
              title={`${BUCKET_CFG[b.key].label}: ${fmtTRY(b.amount)} (${fmtPct(pct)})`}
              style={{ width: `${pct}%`, backgroundColor: BUCKET_CFG[b.key].barColor }}
              className="h-full"
            />
          ) : null
        })}
      </div>

      {/* ── Aging bucket bars ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3 px-4 py-4">
        {BUCKETS.map(b => (
          <BucketBar key={b.key} bucket={b.key} amount={b.amount} total={total} />
        ))}
      </div>

      {/* ── Recovery & Write-off strip ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-[#f1f5f9]">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf4] text-[10px] font-black text-[#15803d]">
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
          Tahmini Tahsilat: {fmtTRY(expected_recovery)} ({fmtPct(recoveryRate)})
        </div>
        {write_off_risk.high_risk_amount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fef2f2] text-[10px] font-black text-neg">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
            Yüksek Silme Riski: {fmtTRY(write_off_risk.high_risk_amount)}
          </div>
        )}
        {write_off_risk.medium_risk_amount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff7ed] text-[10px] font-black text-[#c2410c]">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
            Orta Risk: {fmtTRY(write_off_risk.medium_risk_amount)}
          </div>
        )}
        {write_off_risk.low_risk_amount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fefce8] text-[10px] font-black text-[#b45309]">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
            Düşük Risk: {fmtTRY(write_off_risk.low_risk_amount)}
          </div>
        )}
      </div>

      {/* ── Top 5 priority actions ─────────────────────────────────────────── */}
      {top_priority_actions.length > 0 && (
        <div className="border-t border-[#f1f5f9]">
          <div className="px-4 py-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
              Öncelikli Tahsilat Aksiyonları
            </div>
          </div>
          <div className="divide-y divide-[#f8fafc]">
            {top_priority_actions.map((action, idx) => (
              <div
                key={action.customer_name}
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#fafafa]"
              >
                {/* Rank */}
                <div className="w-5 h-5 rounded-full bg-[#f1f5f9] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[9px] font-black text-[#64748b]">{idx + 1}</span>
                </div>

                {/* Customer + action */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-[#0f172a]">{action.customer_name}</span>
                    <ActionBadge bucket={
                      action.days_overdue <= 30  ? 'current'    :
                      action.days_overdue <= 60  ? '31_60'      :
                      action.days_overdue <= 90  ? '61_90'      :
                      action.days_overdue <= 120 ? '91_120'     : '120_plus'
                    } />
                  </div>
                  <div className="text-[10px] text-[#64748b] mt-0.5">{action.recommended_action}</div>
                  {action.days_overdue > 0 && (
                    <div className="text-[10px] text-neg font-semibold mt-0.5">{action.days_overdue} gün gecikmiş</div>
                  )}
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <div className="font-black tabular-nums text-sm text-[#0f172a]">{fmtTRY(action.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Customer aging table ───────────────────────────────────────────── */}
      {customer_aging.length > 0 && (
        <div className="border-t border-[#f1f5f9] overflow-x-auto">
          <div className="px-4 pt-3 pb-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
              Müşteri Yaşlandırma Detayı
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#f1f5f9]">
                <th className="text-left px-4 py-2 text-[#94a3b8] font-medium">Müşteri</th>
                <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Açık Bakiye</th>
                <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">En Eski (Gün)</th>
                <th className="text-left px-2 py-2 text-[#94a3b8] font-medium">Kova</th>
                <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Tahsilat %</th>
                <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Fatura</th>
              </tr>
            </thead>
            <tbody>
              {customer_aging.slice(0, 15).map(c => {
                const cfg = BUCKET_CFG[c.bucket]
                return (
                  <tr key={c.customer_name} className="border-b border-[#f8fafc] hover:bg-[#f8fafc]">
                    <td className="px-4 py-2 text-[#334155] font-medium truncate max-w-[140px]">
                      {c.customer_name}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-[#0f172a]">
                      {fmtTRY(c.total_outstanding)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[#475569]">
                      {c.oldest_invoice_days > 0 ? `${c.oldest_invoice_days}g` : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded ${cfg.bgColor} ${cfg.textColor}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className={c.recovery_probability >= 70 ? 'text-[#15803d] font-bold' : c.recovery_probability >= 40 ? 'text-[#b45309] font-bold' : 'text-neg font-bold'}>
                        {fmtPct(c.recovery_probability)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[#64748b]">
                      {c.invoice_count}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 text-[10px] text-[#94a3b8]">
            Tahsilat olasılığı; gecikme süresi ve ödeme geçmişine dayalı tahmin
          </div>
        </div>
      )}
    </div>
  )
}
