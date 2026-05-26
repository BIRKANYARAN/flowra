'use client'
// ── CustomerIntelligenceTable — sortable intelligence table with expandable rows
// Displays per-customer payment behavior profiles: risk tier, outstanding,
// avg days to pay, on-time rate, trend, last sale date.

import { useState } from 'react'
import { cn } from '@/components/ds'
import { fmtTRY as fmt, fmtDate } from '@/lib/format'
import type { CustomerPaymentProfile } from '@/lib/services/commercial/customer-intelligence.service'

// ── Risk tier display config ──────────────────────────────────────────────────

const TIER_CFG = {
  critical: { label: 'Kritik',       badge: 'bg-[#fee2e2] text-[#b91c1c]',  dot: 'bg-[#ef4444]' },
  high:     { label: 'Yüksek',       badge: 'bg-neg-light text-neg-text',    dot: 'bg-neg'        },
  medium:   { label: 'Orta',         badge: 'bg-warn-light text-warn-text',  dot: 'bg-warn'       },
  low:      { label: 'Düşük',        badge: 'bg-pos-light text-pos-text',    dot: 'bg-pos'        },
} as const

// ── Trend icons ───────────────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: CustomerPaymentProfile['trend'] }) {
  if (trend === 'improving')        return <span className="text-pos-text font-bold text-sm" title="İyileşiyor">↑</span>
  if (trend === 'deteriorating')    return <span className="text-neg font-bold text-sm" title="Kötüleşiyor">↓</span>
  if (trend === 'stable')           return <span className="text-[#94a3b8] font-bold text-sm" title="Stabil">→</span>
  return <span className="text-[#cbd5e1] text-xs" title="Yetersiz veri">–</span>
}

// ── Sort types ────────────────────────────────────────────────────────────────

type SortKey = 'risk' | 'name' | 'outstanding' | 'avg_days' | 'on_time' | 'last_sale'
type SortDir = 'asc' | 'desc'

const RISK_ORDER: Record<CustomerPaymentProfile['risk_tier'], number> = {
  critical: 0, high: 1, medium: 2, low: 3,
}

function sortProfiles(
  profiles: CustomerPaymentProfile[],
  key: SortKey,
  dir: SortDir,
): CustomerPaymentProfile[] {
  const sorted = [...profiles].sort((a, b) => {
    let v = 0
    switch (key) {
      case 'risk':
        v = RISK_ORDER[a.risk_tier] - RISK_ORDER[b.risk_tier]
        if (v === 0) v = b.overdue_amount_try - a.overdue_amount_try
        break
      case 'name':
        v = a.customer_name.localeCompare(b.customer_name, 'tr')
        break
      case 'outstanding':
        v = a.total_outstanding_try - b.total_outstanding_try
        break
      case 'avg_days':
        v = (a.avg_days_to_pay ?? 999) - (b.avg_days_to_pay ?? 999)
        break
      case 'on_time':
        v = a.on_time_rate - b.on_time_rate
        break
      case 'last_sale':
        v = (a.last_sale_date ?? '').localeCompare(b.last_sale_date ?? '')
        break
    }
    return dir === 'asc' ? v : -v
  })
  return sorted
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function ProfileDetail({ p, onClose }: { p: CustomerPaymentProfile; onClose: () => void }) {
  const tier = TIER_CFG[p.risk_tier]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-[#e2e8f0] shadow-xl w-full max-w-lg mx-4 p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Müşteri Profili</div>
            <h2 className="text-lg font-black text-[#0f172a] leading-tight">{p.customer_name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded', tier.badge)}>
              {tier.label}
            </span>
            <button
              onClick={onClose}
              className="text-[#94a3b8] hover:text-[#475569] text-lg leading-none p-1"
              aria-label="Kapat"
            >
              ×
            </button>
          </div>
        </div>

        {/* Volume */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Toplam Satış', value: String(p.total_sales) },
            { label: 'Toplam Ciro', value: fmt(p.total_revenue_try) },
            { label: 'Tahsil Edilen', value: fmt(p.total_paid_try) },
            { label: 'Bekleyen', value: p.total_outstanding_try > 0 ? fmt(p.total_outstanding_try) : '—', neg: p.total_outstanding_try > 0 },
          ].map(row => (
            <div key={row.label} className="bg-[#f8fafc] rounded p-3">
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">{row.label}</div>
              <div className={cn('text-sm font-black tabular-nums mt-0.5', row.neg ? 'text-neg' : 'text-[#0f172a]')}>{row.value}</div>
            </div>
          ))}
        </div>

        {/* Payment behavior */}
        <div className="space-y-1.5">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ödeme Davranışı</div>
          {[
            { label: 'Ort. Ödeme Süresi', value: p.avg_days_to_pay !== null ? `${Math.round(p.avg_days_to_pay)} gün` : '—' },
            { label: 'Ort. Vade Sapması', value: p.avg_days_overdue !== null ? `${Math.round(p.avg_days_overdue) >= 0 ? '+' : ''}${Math.round(p.avg_days_overdue)} gün` : '—' },
            { label: 'Zamanında Ödeme', value: `%${Math.round(p.on_time_rate * 100)}` },
            { label: 'Trend', value: p.trend === 'improving' ? 'İyileşiyor ↑' : p.trend === 'deteriorating' ? 'Kötüleşiyor ↓' : p.trend === 'stable' ? 'Stabil →' : 'Yetersiz Veri' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between text-xs py-1 border-b border-[#f1f5f9] last:border-0">
              <span className="text-[#64748b]">{row.label}</span>
              <span className="font-semibold text-[#1e293b]">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Risk signals */}
        {(p.overdue_sales_count > 0 || p.last_overdue_date) && (
          <div className="space-y-1.5">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Risk Sinyalleri</div>
            {[
              p.overdue_sales_count > 0 && { label: 'Gecikmiş Satış', value: String(p.overdue_sales_count) },
              p.overdue_amount_try > 0  && { label: 'Vadesi Geçmiş Tutar', value: fmt(p.overdue_amount_try) },
              p.last_overdue_date       && { label: 'Son Gecikme Tarihi', value: fmtDate(p.last_overdue_date) },
            ].filter(Boolean).map(row => {
              const r = row as { label: string; value: string }
              return (
                <div key={r.label} className="flex items-center justify-between text-xs py-1 border-b border-[#f1f5f9] last:border-0">
                  <span className="text-[#64748b]">{r.label}</span>
                  <span className="font-semibold text-neg">{r.value}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Activity */}
        <div className="flex gap-3 text-[10px] text-[#94a3b8]">
          {p.first_sale_date && <span>İlk satış: {fmtDate(p.first_sale_date)}</span>}
          {p.last_sale_date  && <span>Son satış: {fmtDate(p.last_sale_date)}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  profiles: CustomerPaymentProfile[]
}

export default function CustomerIntelligenceTable({ profiles }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('risk')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selected, setSelected] = useState<CustomerPaymentProfile | null>(null)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = sortProfiles(profiles, sortKey, sortDir)

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <button
        onClick={() => toggleSort(k)}
        className={cn(
          'text-[0.6rem] font-black uppercase tracking-widest whitespace-nowrap transition-colors',
          active ? 'text-brand' : 'text-[#94a3b8] hover:text-[#475569]',
        )}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    )
  }

  return (
    <>
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        {/* Table header */}
        <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Müşteri Ödeme Zekası — {profiles.length} müşteri
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-[#cbd5e1]">Sırala:</span>
            <SortBtn k="risk"        label="Risk"       />
            <SortBtn k="outstanding" label="Bekleyen"   />
            <SortBtn k="name"        label="Ad"         />
          </div>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-[#f8fafc] border-b border-[#f1f5f9]">
          <SortBtn k="name"        label="Müşteri"          />
          <SortBtn k="risk"        label="Risk"             />
          <SortBtn k="outstanding" label="Bekleyen"         />
          <SortBtn k="avg_days"    label="Ort. Gün"         />
          <SortBtn k="on_time"     label="Zamanında"        />
          <SortBtn k="last_sale"   label="Son Satış"        />
        </div>

        {/* Rows */}
        <div className="divide-y divide-[#f1f5f9]">
          {sorted.map(p => {
            const tier = TIER_CFG[p.risk_tier]
            return (
              <button
                key={p.customer_name}
                onClick={() => setSelected(p)}
                className="w-full text-left px-4 py-3 hover:bg-[#f8fafc]/60 transition-colors"
              >
                {/* Mobile layout */}
                <div className="sm:hidden flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', tier.dot)} />
                      <span className="text-xs font-bold text-[#1e293b] truncate">{p.customer_name}</span>
                    </div>
                    <div className="text-[10px] text-[#94a3b8] flex items-center gap-2 flex-wrap">
                      {p.total_outstanding_try > 0 && <span className="text-neg font-semibold">{fmt(p.total_outstanding_try)} bekliyor</span>}
                      {p.avg_days_to_pay !== null && <span>{Math.round(p.avg_days_to_pay)}g ort.</span>}
                      <TrendArrow trend={p.trend} />
                    </div>
                  </div>
                  <span className={cn('text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0', tier.badge)}>
                    {tier.label}
                  </span>
                </div>

                {/* Desktop layout */}
                <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 items-center">
                  {/* Name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', tier.dot)} />
                    <span className="text-xs font-bold text-[#1e293b] truncate">{p.customer_name}</span>
                  </div>

                  {/* Risk badge */}
                  <div>
                    <span className={cn('text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded', tier.badge)}>
                      {tier.label}
                    </span>
                  </div>

                  {/* Outstanding */}
                  <div className={cn('text-xs font-semibold tabular-nums', p.total_outstanding_try > 0 ? 'text-neg' : 'text-[#94a3b8]')}>
                    {p.total_outstanding_try > 0 ? fmt(p.total_outstanding_try) : '—'}
                  </div>

                  {/* Avg days to pay */}
                  <div className="text-xs tabular-nums text-[#334155]">
                    {p.avg_days_to_pay !== null ? `${Math.round(p.avg_days_to_pay)}g` : '—'}
                  </div>

                  {/* On-time rate */}
                  <div className={cn(
                    'text-xs font-semibold tabular-nums',
                    p.on_time_rate >= 0.8 ? 'text-pos-text' : p.on_time_rate >= 0.5 ? 'text-warn-text' : 'text-neg',
                  )}>
                    {p.total_sales > 0 && p.on_time_rate > 0
                      ? `%${Math.round(p.on_time_rate * 100)}`
                      : '—'}
                  </div>

                  {/* Trend + Last sale */}
                  <div className="flex items-center gap-2">
                    <TrendArrow trend={p.trend} />
                    <span className="text-[10px] text-[#94a3b8]">
                      {p.last_sale_date ? fmtDate(p.last_sale_date) : '—'}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {profiles.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
            Henüz satış verisi yok.
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <ProfileDetail p={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
