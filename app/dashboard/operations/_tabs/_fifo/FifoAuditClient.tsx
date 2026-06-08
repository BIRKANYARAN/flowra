'use client'
// ─────────────────────────────────────────────────────────────────────────────
// FifoAuditClient — FIFO lot integrity audit panel
//
// Receives companyId as prop. Fetches /api/inventory/fifo-audit via TanStack
// Query (5-min refetch). Displays integrity score, summary counts, and a
// sortable lots table with health badges.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }       from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { FifoAuditSummary, LotAuditEntry } from '@/lib/services/inventory/fifo-audit.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  audit: FifoAuditSummary
}

interface Props {
  companyId: string
}

// ── Grade color mapping ────────────────────────────────────────────────────────

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-pos-text'
    case 'B': return 'text-teal-600'
    case 'C': return 'text-warn-text'
    case 'D': return 'text-orange-600'
    case 'F': return 'text-neg'
    default:  return 'text-[#94a3b8]'
  }
}

function gradeBg(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-pos-light'
    case 'B': return 'bg-teal-50'
    case 'C': return 'bg-warn-light'
    case 'D': return 'bg-orange-50'
    case 'F': return 'bg-neg-light'
    default:  return 'bg-[#f1f5f9]'
  }
}

// ── Health badge ──────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: LotAuditEntry['health'] }) {
  const config = {
    clean:         { label: 'Temiz',        cls: 'bg-[#f1f5f9] text-[#64748b]' },
    over_consumed: { label: 'Aşım',         cls: 'bg-neg-light text-neg-text' },
    orphaned:      { label: 'Yetim Lot',    cls: 'bg-orange-50 text-orange-700' },
    cost_drift:    { label: 'Maliyet Kayması', cls: 'bg-warn-light text-warn-text' },
  }
  const { label, cls } = config[health]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-20 bg-[#f1f5f9] rounded" />
      <div className="h-4 bg-[#f1f5f9] rounded w-2/3" />
      <div className="h-40 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FifoAuditClient({ companyId }: Props) {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey:       ['fifo-audit', companyId],
    queryFn:        () =>
      fetch(`/api/inventory/fifo-audit?companyId=${companyId}`).then(r => r.json()),
    refetchInterval: 5 * 60 * 1000,
  })

  if (isLoading) return <Skeleton />
  if (!data?.audit) return null

  const audit = data.audit

  // Empty state
  if (audit.total_lots === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[#e8eaef]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            FIFO Lot Denetimi
          </span>
        </div>
        <div className="py-10 text-center">
          <div className="text-xs font-medium text-[#334155] mb-1">Lot bulunamadı</div>
          <div className="text-[0.65rem] text-[#94a3b8]">Henüz stok lotu kaydedilmemiş</div>
        </div>
      </div>
    )
  }

  const hasIssues = audit.over_consumed_lots > 0 || audit.orphaned_lots > 0 || audit.cost_drift_lots > 0

  // Split lots: non-clean first, then clean
  const issueLots = audit.lots.filter(l => l.health !== 'clean')
  const cleanLots = audit.lots.filter(l => l.health === 'clean')

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e8eaef] flex items-center justify-between">
        <div>
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            FIFO Lot Denetimi
          </span>
          <span className="ml-2 text-[10px] text-[#94a3b8]">
            — lot bütünlüğü, aşım ve maliyet kayması analizi
          </span>
        </div>
        <span className="text-[10px] text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded">
          {fmtTRY(audit.total_inventory_value_try)} toplam değer
        </span>
      </div>

      {/* Integrity score + grade */}
      <div className={`px-5 py-4 border-b border-[#e8eaef] flex items-center gap-5 ${gradeBg(audit.grade)}`}>
        <div className={`text-5xl font-black leading-none tabular-nums ${gradeColor(audit.grade)}`}>
          {audit.grade}
        </div>
        <div>
          <div className={`text-xl font-black tabular-nums leading-none ${gradeColor(audit.grade)}`}>
            {audit.integrity_score}<span className="text-sm font-semibold ml-0.5">/ 100</span>
          </div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mt-1">
            Bütünlük Skoru
          </div>
        </div>
        <div className="ml-4 flex gap-4 text-xs">
          <div className="text-center">
            <div className="text-lg font-black text-[#0f172a] tabular-nums">{audit.total_lots}</div>
            <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">Toplam Lot</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-black text-pos-text tabular-nums">{audit.clean_lots}</div>
            <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">Temiz</div>
          </div>
          {audit.over_consumed_lots > 0 && (
            <div className="text-center">
              <div className="text-lg font-black text-neg tabular-nums">{audit.over_consumed_lots}</div>
              <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">Aşım</div>
            </div>
          )}
          {audit.orphaned_lots > 0 && (
            <div className="text-center">
              <div className="text-lg font-black text-orange-600 tabular-nums">{audit.orphaned_lots}</div>
              <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">Yetim</div>
            </div>
          )}
          {audit.cost_drift_lots > 0 && (
            <div className="text-center">
              <div className="text-lg font-black text-warn-text tabular-nums">{audit.cost_drift_lots}</div>
              <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">Maliyet Kayması</div>
            </div>
          )}
        </div>
      </div>

      {/* All clean message */}
      {!hasIssues && (
        <div className="px-5 py-4 bg-pos-light border-b border-[#e8eaef]">
          <div className="flex items-center gap-2">
            <span className="text-pos-text text-base">✓</span>
            <span className="text-xs font-semibold text-pos-text">
              Tüm stok lotları temiz — FIFO bütünlüğü doğrulandı
            </span>
          </div>
        </div>
      )}

      {/* Issues breakdown — only if there are problems */}
      {hasIssues && (
        <div className="px-5 py-3 border-b border-[#e8eaef] bg-[#fafafa] flex items-center gap-3 flex-wrap">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tespit Edilen Sorunlar:</span>
          {audit.over_consumed_lots > 0 && (
            <span className="text-[10px] font-semibold bg-neg-light text-neg-text px-2 py-0.5 rounded">
              {audit.over_consumed_lots} Aşım (ayrılan &gt; mevcut)
            </span>
          )}
          {audit.orphaned_lots > 0 && (
            <span className="text-[10px] font-semibold bg-orange-50 text-orange-700 px-2 py-0.5 rounded">
              {audit.orphaned_lots} Yetim Lot (alım kaydı eksik)
            </span>
          )}
          {audit.cost_drift_lots > 0 && (
            <span className="text-[10px] font-semibold bg-warn-light text-warn-text px-2 py-0.5 rounded">
              {audit.cost_drift_lots} Maliyet Kayması (&gt;%20 fark)
            </span>
          )}
        </div>
      )}

      {/* Lots table — issue lots first */}
      {issueLots.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e8eaef]">
                <th className="text-left px-5 py-2.5">Ürün</th>
                <th className="text-right px-4 py-2.5">Mevcut Miktar</th>
                <th className="text-right px-4 py-2.5">Kullanılan</th>
                <th className="text-right px-4 py-2.5">Kalan</th>
                <th className="text-right px-4 py-2.5">Giriş Maliyeti</th>
                <th className="text-right px-4 py-2.5">Tüketim %</th>
                <th className="text-right px-5 py-2.5">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {issueLots.map(lot => (
                <LotRow key={lot.lot_id} lot={lot} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Clean lots — collapsed section */}
      {cleanLots.length > 0 && (
        <details className="group">
          <summary className="px-5 py-3 border-t border-[#e8eaef] bg-[#f8fafc] cursor-pointer list-none flex items-center justify-between hover:bg-[#f1f5f9]">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Temiz Lotlar ({cleanLots.length})
            </span>
            <span className="text-[10px] text-[#94a3b8] group-open:rotate-180 inline-block transition-transform">
              ▼
            </span>
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="text-left px-5 py-2.5">Ürün</th>
                  <th className="text-right px-4 py-2.5">Mevcut Miktar</th>
                  <th className="text-right px-4 py-2.5">Kullanılan</th>
                  <th className="text-right px-4 py-2.5">Kalan</th>
                  <th className="text-right px-4 py-2.5">Giriş Maliyeti</th>
                  <th className="text-right px-4 py-2.5">Tüketim %</th>
                  <th className="text-right px-5 py-2.5">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {cleanLots.map(lot => (
                  <LotRow key={lot.lot_id} lot={lot} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#e8eaef] bg-[#f8fafc]">
        <span className="text-[10px] text-[#94a3b8]">
          Denetim tamamlandı · {audit.total_lots} lot incelendi · Skor hesabı: aşım ×20p, yetim ×10p, maliyet kayması ×5p
        </span>
      </div>
    </div>
  )
}

// ── Lot table row ─────────────────────────────────────────────────────────────

function LotRow({ lot }: { lot: LotAuditEntry }) {
  const consumedColor =
    lot.consumed_pct > 100 ? 'text-neg font-bold'
    : lot.consumed_pct === 100 ? 'text-[#64748b]'
    : 'text-[#334155]'

  return (
    <tr className="hover:bg-[#f8fafc]/60">
      <td className="px-5 py-3 font-semibold text-[#0f172a]">
        {lot.product_name}
        <div className="text-[10px] font-mono text-[#94a3b8] mt-0.5">{lot.entry_date}</div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-[#334155]">
        {lot.qty_available.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-[#334155]">
        {lot.qty_allocated.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#1e293b]">
        {lot.qty_remaining.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-brand">
        {fmtTRY(lot.entry_cost_try)}
      </td>
      <td className={`px-4 py-3 text-right tabular-nums ${consumedColor}`}>
        {fmtPct(lot.consumed_pct)}
        {lot.cost_drift_pct !== null && (
          <div className={`text-[10px] ${Math.abs(lot.cost_drift_pct) > 20 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>
            drift {lot.cost_drift_pct > 0 ? '+' : ''}{lot.cost_drift_pct.toFixed(1)}%
          </div>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <HealthBadge health={lot.health} />
      </td>
    </tr>
  )
}
