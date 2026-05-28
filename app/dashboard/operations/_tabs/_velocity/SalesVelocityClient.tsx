'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SalesVelocityClient — Product Sales Velocity & Reorder Intelligence panel
//
// Receives companyId as prop. Fetches /api/inventory/sales-velocity via
// TanStack Query (5-min refetch). Displays:
//   • Observation window selector (30 / 60 / 90 days)
//   • Alert strip: Critical / Urgent / No Movement counts
//   • Reorder alerts table (products at or below reorder point)
//   • Full velocity table sorted by urgency
// ─────────────────────────────────────────────────────────────────────────────

import { useState }         from 'react'
import { useQuery }         from '@tanstack/react-query'
import type {
  SalesVelocityReport,
  ProductVelocity,
} from '@/lib/services/inventory/sales-velocity.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: SalesVelocityReport
}

interface Props {
  companyId: string
}

// ── Urgency badge config ──────────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: ProductVelocity['stock_urgency'] }) {
  const config: Record<ProductVelocity['stock_urgency'], { label: string; cls: string }> = {
    critical:    { label: 'Kritik',       cls: 'bg-neg-light text-neg-text' },
    urgent:      { label: 'Acil',         cls: 'bg-orange-50 text-orange-700' },
    low:         { label: 'Düşük',        cls: 'bg-warn-light text-warn-text' },
    healthy:     { label: 'Sağlıklı',     cls: 'bg-pos-light text-pos-text' },
    no_movement: { label: 'Hareketsiz',   cls: 'bg-[#f1f5f9] text-[#64748b]' },
  }
  const { label, cls } = config[urgency]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-12 bg-[#f1f5f9] rounded" />
      <div className="h-20 bg-[#f1f5f9] rounded" />
      <div className="h-48 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVelocity(v: number): string {
  if (v === 0) return '0'
  if (v < 1) return v.toFixed(2)
  return v.toFixed(1)
}

function fmtDays(d: number | null): string {
  if (d === null) return '—'
  if (d === 0)    return 'Tükendi'
  return `${Math.round(d)} gün`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SalesVelocityClient({ companyId }: Props) {
  const [days, setDays] = useState<30 | 60 | 90>(90)

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey:        ['sales-velocity', companyId, days],
    queryFn:         () =>
      fetch(`/api/inventory/sales-velocity?companyId=${companyId}&days=${days}`).then(r => r.json()),
    refetchInterval: 5 * 60 * 1000,
  })

  if (isLoading) return <Skeleton />
  if (!data?.report) return null

  const report = data.report

  // Empty state
  if (report.total_products === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[#e2e8f0]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Satış Hız Analizi
          </span>
        </div>
        <div className="py-10 text-center">
          <div className="text-xs font-medium text-[#334155] mb-1">Stok hareketi bulunamadı</div>
          <div className="text-[0.65rem] text-[#94a3b8]">Seçili dönemde satış verisi yok</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
        <div>
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Satış Hız Analizi
          </span>
          <span className="ml-2 text-[10px] text-[#94a3b8]">
            — hız tahminleri, stok tükenme tarihleri ve sipariş önerileri
          </span>
        </div>
        {/* Observation window selector */}
        <div className="flex items-center gap-1">
          {([30, 60, 90] as const).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors ${
                days === d
                  ? 'bg-brand text-white'
                  : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
              }`}
            >
              {d}g
            </button>
          ))}
        </div>
      </div>

      {/* Alert strip */}
      <div className="px-5 py-3 border-b border-[#e2e8f0] bg-[#fafafa] flex items-center gap-3 flex-wrap">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Stok Durumu:
        </span>
        {report.critical_count > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-neg-light text-neg-text px-2 py-0.5 rounded">
            <span>🔴</span>
            <span>Kritik {report.critical_count}</span>
          </span>
        )}
        {report.urgent_count > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-orange-50 text-orange-700 px-2 py-0.5 rounded">
            <span>🟡</span>
            <span>Acil {report.urgent_count}</span>
          </span>
        )}
        {report.no_movement_count > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-[#f1f5f9] text-[#64748b] px-2 py-0.5 rounded">
            <span>⚪</span>
            <span>Hareketsiz {report.no_movement_count}</span>
          </span>
        )}
        <span className="ml-auto text-[10px] text-[#94a3b8]">
          {report.total_products} ürün · {report.observation_days} günlük gözlem
        </span>
      </div>

      {/* Reorder alerts section */}
      {report.reorder_alerts.length > 0 && (
        <>
          <div className="px-5 py-3 border-b border-[#e2e8f0] bg-neg-light flex items-center gap-2">
            <span className="text-neg-text text-xs font-black uppercase tracking-widest">
              Sipariş Gerekiyor — {report.reorder_alerts.length} Ürün
            </span>
            <span className="text-[10px] text-neg-text">
              (Mevcut stok ≤ yeniden sipariş noktası)
            </span>
          </div>
          <div className="overflow-x-auto border-b border-[#e2e8f0]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="text-left px-5 py-2.5">Ürün</th>
                  <th className="text-right px-4 py-2.5">Mevcut Stok</th>
                  <th className="text-right px-4 py-2.5">Sipariş Noktası</th>
                  <th className="text-right px-4 py-2.5">Hız/Gün</th>
                  <th className="text-right px-4 py-2.5">Kalan Gün</th>
                  <th className="text-right px-5 py-2.5">Önerilen Sipariş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {report.reorder_alerts.map(p => {
                  const isRowCritical = p.stock_urgency === 'critical'
                  return (
                    <tr
                      key={p.product_id}
                      className={isRowCritical ? 'bg-neg-light/40' : 'hover:bg-[#f8fafc]/60'}
                    >
                      <td className="px-5 py-3 font-semibold text-[#0f172a]">
                        {p.product_name}
                        {p.sku && (
                          <span className="ml-2 text-[10px] font-mono text-[#94a3b8]">{p.sku}</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-bold ${
                        isRowCritical ? 'text-neg' : 'text-warn-text'
                      }`}>
                        {p.current_qty.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                        {p.reorder_point.toLocaleString('tr-TR')}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#334155]">
                        {fmtVelocity(p.daily_velocity)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${
                        isRowCritical ? 'text-neg' : 'text-warn-text'
                      }`}>
                        {fmtDays(p.days_to_stockout)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-brand font-semibold">
                        {p.reorder_qty.toLocaleString('tr-TR')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Full velocity table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
              <th className="text-left px-5 py-2.5">Ürün</th>
              <th className="text-left px-4 py-2.5">SKU</th>
              <th className="text-right px-4 py-2.5">Stok</th>
              <th className="text-right px-4 py-2.5">Hız/Gün</th>
              <th className="text-right px-4 py-2.5">Stok Tükenme</th>
              <th className="text-right px-4 py-2.5">Güvenlik Stoku</th>
              <th className="text-right px-5 py-2.5">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {report.products.map(p => (
              <tr key={p.product_id} className="hover:bg-[#f8fafc]/60">
                <td className="px-5 py-3 font-semibold text-[#0f172a]">{p.product_name}</td>
                <td className="px-4 py-3 text-[10px] font-mono text-[#94a3b8]">
                  {p.sku ?? '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[#334155] font-semibold">
                  {p.current_qty.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                  {fmtVelocity(p.daily_velocity)}
                  {p.daily_velocity > 0 && (
                    <div className="text-[9px] text-[#94a3b8]">
                      {fmtVelocity(p.weekly_velocity)}/hf
                    </div>
                  )}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${
                  p.days_to_stockout === null ? 'text-[#94a3b8]'
                  : p.days_to_stockout === 0  ? 'text-neg'
                  : p.days_to_stockout <= 7   ? 'text-neg'
                  : p.days_to_stockout <= 14  ? 'text-orange-600'
                  : p.days_to_stockout <= 30  ? 'text-warn-text'
                  : 'text-pos-text'
                }`}>
                  {fmtDays(p.days_to_stockout)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                  {p.safety_stock > 0 ? p.safety_stock.toLocaleString('tr-TR') : '—'}
                </td>
                <td className="px-5 py-3 text-right">
                  <UrgencyBadge urgency={p.stock_urgency} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#e2e8f0] bg-[#f8fafc]">
        <span className="text-[10px] text-[#94a3b8]">
          {report.as_of_date} tarihli · Güvenlik stoku: hız × temin süresi × 1,5 tampon ·
          Sipariş noktası: güvenlik stoğu + (hız × temin süresi)
        </span>
      </div>
    </div>
  )
}
