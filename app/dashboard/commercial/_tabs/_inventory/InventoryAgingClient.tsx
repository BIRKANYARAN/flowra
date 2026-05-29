'use client'
// ── InventoryAgingClient — Inventory Turnover & Aging Analysis ────────────────
// Fetches /api/commercial/inventory-aging via TanStack Query.
// Features:
//   • Health score gauge + inventory health badge
//   • Turnover metrics (DIO, turnover rate, health)
//   • Aging buckets bar chart (CSS)
//   • Obsolescence risk indicator
//   • Top aging lots table
//   • Turkish narrative summary
//   • Empty state

import { useQuery } from '@tanstack/react-query'
import type { InventoryAgingReport, AgingBucket } from '@/lib/services/commercial/inventory-aging.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const PCT_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number): string {
  return `%${PCT_FMT.format(n)}`
}

function fmtDays(n: number | null): string {
  if (n === null) return 'N/A'
  return `${Math.round(n)} gün`
}

// ── Badge configs ─────────────────────────────────────────────────────────────

const HEALTH_CFG: Record<string, { label: string; bg: string; text: string }> = {
  excellent: { label: 'Mükemmel', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  good:      { label: 'İyi',      bg: 'bg-teal-100',    text: 'text-teal-700'    },
  fair:      { label: 'Orta',     bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  poor:      { label: 'Zayıf',    bg: 'bg-orange-100',  text: 'text-orange-700'  },
  critical:  { label: 'Kritik',   bg: 'bg-red-100',     text: 'text-red-700'     },
}

const TURNOVER_CFG: Record<string, { label: string; bg: string; text: string }> = {
  excellent:         { label: 'Mükemmel',       bg: 'bg-emerald-100', text: 'text-emerald-800' },
  good:              { label: 'İyi',            bg: 'bg-teal-100',    text: 'text-teal-700'    },
  acceptable:        { label: 'Kabul Edilebilir', bg: 'bg-blue-100',  text: 'text-blue-700'    },
  slow:              { label: 'Yavaş',          bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  critical:          { label: 'Kritik',         bg: 'bg-red-100',     text: 'text-red-700'     },
  insufficient_data: { label: 'Veri Yetersiz',  bg: 'bg-gray-100',    text: 'text-gray-600'    },
}

const OBSOLESCENCE_CFG: Record<string, { label: string; bg: string; text: string }> = {
  low:      { label: 'Düşük',    bg: 'bg-emerald-100', text: 'text-emerald-800' },
  moderate: { label: 'Orta',     bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  high:     { label: 'Yüksek',   bg: 'bg-orange-100',  text: 'text-orange-700'  },
  critical: { label: 'Kritik',   bg: 'bg-red-100',     text: 'text-red-700'     },
}

const TIER_COLORS: Record<string, string> = {
  fresh:       'bg-emerald-400',
  normal:      'bg-teal-400',
  aging:       'bg-yellow-400',
  slow_moving: 'bg-orange-400',
  obsolete:    'bg-red-500',
}

function Badge({ cfg }: { cfg: { label: string; bg: string; text: string } }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Aging bucket bar ──────────────────────────────────────────────────────────

function AgingBucketRow({ bucket, maxPct }: { bucket: AgingBucket; maxPct: number }) {
  const tier = bucket.min_days === 0    ? 'fresh'
             : bucket.min_days === 31   ? 'normal'
             : bucket.min_days === 91   ? 'aging'
             : bucket.min_days === 181  ? 'slow_moving'
             : 'obsolete'
  const barWidth = maxPct > 0 ? (bucket.pct_of_total_value / maxPct) * 100 : 0
  const color = TIER_COLORS[tier] ?? 'bg-gray-400'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#64748b] font-medium">{bucket.label}</span>
        <div className="flex items-center gap-3 text-[#94a3b8]">
          <span>{bucket.lot_count} lot</span>
          <span>{TRY_FMT.format(Math.round(bucket.total_units))} birim</span>
          <span className="text-[#1e293b] font-medium">{fmtTRY(bucket.total_value_try)}</span>
          <span className="w-10 text-right">{fmtPct(bucket.pct_of_total_value)}</span>
        </div>
      </div>
      <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InventoryAgingClient() {
  const { data, isLoading, isError } = useQuery<{ report: InventoryAgingReport }>({
    queryKey: ['inventory-aging'],
    queryFn:  () => fetch('/api/commercial/inventory-aging').then(r => {
      if (!r.ok) throw new Error('Stok yaşlanma verisi alınamadı')
      return r.json()
    }),
    staleTime: 1800_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#94a3b8] text-sm">
        Stok yaşlanma analizi yükleniyor…
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="flex items-center justify-center py-16 text-[#ef4444] text-sm">
        Stok yaşlanma verisi yüklenemedi.
      </div>
    )
  }

  const r = data.report

  if (r.total_lots === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <p className="text-[#94a3b8] text-sm">Aktif stok lotu bulunamadı.</p>
        <p className="text-[#cbd5e1] text-xs">Stok girişi yapıldıktan sonra bu rapor otomatik güncellenir.</p>
      </div>
    )
  }

  const healthCfg      = HEALTH_CFG[r.inventory_health]     ?? HEALTH_CFG.fair
  const turnoverCfg    = TURNOVER_CFG[r.turnover_health]     ?? TURNOVER_CFG.insufficient_data
  const obsolescCfg    = OBSOLESCENCE_CFG[r.obsolescence_risk_level] ?? OBSOLESCENCE_CFG.low
  const maxBucketPct   = Math.max(...r.aging_buckets.map(b => b.pct_of_total_value), 1)

  return (
    <div className="space-y-6">

      {/* ── Header KPI row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Health score */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex flex-col gap-1">
          <span className="text-xs text-[#94a3b8] font-medium uppercase tracking-wide">Sağlık Skoru</span>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-[#1e293b]">{r.health_score}</span>
            <span className="text-sm text-[#94a3b8] mb-0.5">/ 100</span>
          </div>
          <Badge cfg={healthCfg} />
        </div>

        {/* DIO */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex flex-col gap-1">
          <span className="text-xs text-[#94a3b8] font-medium uppercase tracking-wide">Stok Devir Süresi</span>
          <span className="text-3xl font-bold text-[#1e293b]">{fmtDays(r.days_inventory_outstanding)}</span>
          <Badge cfg={turnoverCfg} />
        </div>

        {/* Total value */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex flex-col gap-1">
          <span className="text-xs text-[#94a3b8] font-medium uppercase tracking-wide">Toplam Stok Değeri</span>
          <span className="text-3xl font-bold text-[#1e293b]">{fmtTRY(r.total_inventory_value_try)}</span>
          <span className="text-xs text-[#94a3b8]">{r.total_lots} lot · {TRY_FMT.format(Math.round(r.total_units))} birim</span>
        </div>

        {/* Obsolescence risk */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex flex-col gap-1">
          <span className="text-xs text-[#94a3b8] font-medium uppercase tracking-wide">Eskimiş Stok Riski</span>
          <span className="text-3xl font-bold text-[#1e293b]">{fmtPct(r.obsolescence_risk_pct)}</span>
          <Badge cfg={obsolescCfg} />
        </div>
      </div>

      {/* ── Aging buckets ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#1e293b]">Stok Yaşlanma Dağılımı</h3>
        <div className="space-y-3">
          {r.aging_buckets.map(bucket => (
            <AgingBucketRow key={bucket.label} bucket={bucket} maxPct={maxBucketPct} />
          ))}
        </div>
      </div>

      {/* ── Secondary metrics ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Turnover metrics */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#1e293b]">Devir Metrikleri</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#64748b]">Envanter Devir Hızı</dt>
              <dd className="font-medium text-[#1e293b]">
                {r.inventory_turnover !== null ? r.inventory_turnover.toFixed(2) + '×' : 'N/A'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#64748b]">Stok Devir Süresi (DIO)</dt>
              <dd className="font-medium text-[#1e293b]">{fmtDays(r.days_inventory_outstanding)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#64748b]">Yavaş Hareket Eden Stok</dt>
              <dd className="font-medium text-[#1e293b]">{fmtTRY(r.slow_moving_value_try)}</dd>
            </div>
          </dl>
        </div>

        {/* Narrative */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <h3 className="text-sm font-semibold text-[#1e293b] mb-2">Analiz Özeti</h3>
          <p className="text-sm text-[#475569] leading-relaxed">{r.narrative}</p>
        </div>
      </div>

      {/* ── Top aging lots table ─────────────────────────────────────────────── */}
      {r.top_aging_lots.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f1f5f9]">
            <h3 className="text-sm font-semibold text-[#1e293b]">En Uzun Süre Stoktaki Lotlar</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f8fafc]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#94a3b8] uppercase tracking-wide">Ürün</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[#94a3b8] uppercase tracking-wide">Stokta Gün</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[#94a3b8] uppercase tracking-wide">Değer</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[#94a3b8] uppercase tracking-wide">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {r.top_aging_lots.map((lot, i) => {
                  const tierLabel: Record<string, string> = {
                    fresh:       'Taze',
                    normal:      'Normal',
                    aging:       'Eskiyen',
                    slow_moving: 'Yavaş Hareket',
                    obsolete:    'Eskimiş',
                  }
                  const tierBg: Record<string, string> = {
                    fresh:       'bg-emerald-100 text-emerald-800',
                    normal:      'bg-teal-100 text-teal-700',
                    aging:       'bg-yellow-100 text-yellow-700',
                    slow_moving: 'bg-orange-100 text-orange-700',
                    obsolete:    'bg-red-100 text-red-700',
                  }
                  return (
                    <tr key={`${lot.product_id}-${i}`} className="hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#1e293b]">{lot.product_name}</td>
                      <td className="px-4 py-3 text-right text-[#475569]">{lot.days_in_stock} gün</td>
                      <td className="px-4 py-3 text-right font-medium text-[#1e293b]">{fmtTRY(lot.total_value_try)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierBg[lot.aging_tier] ?? 'bg-gray-100 text-gray-600'}`}>
                          {tierLabel[lot.aging_tier] ?? lot.aging_tier}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
