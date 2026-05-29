'use client'
// ── SupplierPaymentTermsClient ────────────────────────────────────────────────
// Fetches /api/commercial/supplier-payment-terms via TanStack Query.
// Features:
//   • Optimization score gauge
//   • On-time payment rate
//   • Discount opportunities table
//   • Vendor profiles list
//   • Supplier concentration badge

import { useQuery } from '@tanstack/react-query'
import type {
  SupplierPaymentTermsReport,
  PaymentTermsProfile,
  DiscountOpportunity,
} from '@/lib/services/commercial/supplier-payment-terms.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number, decimals = 1): string {
  const fmt = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `%${fmt.format(n)}`
}

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_CFG = {
  excellent: { label: 'Mükemmel', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  good:      { label: 'İyi',      bg: 'bg-teal-100',    text: 'text-teal-700'    },
  fair:      { label: 'Orta',     bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  poor:      { label: 'Zayıf',    bg: 'bg-red-100',     text: 'text-red-700'     },
} as const

type Health = keyof typeof HEALTH_CFG

function HealthBadge({ health }: { health: Health }) {
  const cfg = HEALTH_CFG[health]
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Optimization score gauge ──────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const clamp = Math.max(0, Math.min(100, score))
  const color =
    clamp >= 80 ? 'bg-emerald-500'
    : clamp >= 60 ? 'bg-teal-500'
    : clamp >= 40 ? 'bg-yellow-500'
    : 'bg-red-500'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-3xl font-black tabular-nums text-[#0f172a]">{Math.round(clamp)}</div>
      <div className="w-full h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${clamp}%` }} />
      </div>
      <div className="text-[9px] text-[#94a3b8] font-medium">/ 100</div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-52 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Concentration badge ───────────────────────────────────────────────────────

function ConcentrationBadge({ topVendorPct, hhi }: { topVendorPct: number; hhi: number }) {
  const risk =
    topVendorPct >= 60 || hhi >= 0.5 ? 'high'
    : topVendorPct >= 40 || hhi >= 0.25 ? 'medium'
    : 'low'

  const cfg = {
    high:   { label: 'Yüksek Konsantrasyon', bg: 'bg-red-100',    text: 'text-red-700'    },
    medium: { label: 'Orta Konsantrasyon',   bg: 'bg-yellow-100', text: 'text-yellow-700' },
    low:    { label: 'Dengeli Tedarikçi',    bg: 'bg-emerald-100',text: 'text-emerald-700'},
  }[risk]

  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Discount opportunities table ──────────────────────────────────────────────

function DiscountTable({ opportunities }: { opportunities: DiscountOpportunity[] }) {
  if (opportunities.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Açık iskonto fırsatı bulunamadı</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Tedarikçi
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Açık Bakiye
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              İskonto
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              İskonto Tutarı
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Yıl. Getiri
            </th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Durum
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {opportunities.map(opp => (
            <tr key={opp.vendor_name} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2 text-[11px] font-bold text-[#334155] max-w-[180px] truncate">
                {opp.vendor_name}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#64748b]">
                {fmtTRY(opp.outstanding_amount)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#64748b]">
                {fmtPct(opp.discount_pct)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-emerald-700">
                {fmtTRY(opp.discount_amount)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#64748b]">
                {fmtPct(opp.annualized_return_pct)}
              </td>
              <td className="px-3 py-2 text-center">
                {opp.should_capture ? (
                  <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Değerlendir
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#94a3b8]">
                    Bekle
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Vendor profiles ───────────────────────────────────────────────────────────

function VendorProfileRow({ profile }: { profile: PaymentTermsProfile }) {
  const onTimePct = profile.on_time_payment_rate * 100
  const behavior =
    onTimePct >= 95 ? 'excellent'
    : onTimePct >= 80 ? 'good'
    : onTimePct >= 60 ? 'fair'
    : 'poor'

  const barColor =
    behavior === 'excellent' ? 'bg-emerald-500'
    : behavior === 'good'    ? 'bg-teal-500'
    : behavior === 'fair'    ? 'bg-yellow-500'
    : 'bg-red-500'

  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#f8fafc] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold text-[#334155] truncate">{profile.vendor_name}</div>
        <div className="text-[9px] text-[#94a3b8] mt-0.5">
          {profile.total_transactions} işlem · {profile.late_payment_count} gecikmeli
          {profile.avg_payment_days !== null && (
            <> · Ort. {profile.avg_payment_days} gün</>
          )}
        </div>
      </div>

      {/* On-time bar */}
      <div className="w-24 shrink-0">
        <div className="flex justify-between text-[9px] text-[#94a3b8] mb-0.5">
          <span>Zamanında</span>
          <span>{fmtPct(onTimePct, 0)}</span>
        </div>
        <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
          <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${onTimePct}%` }} />
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-[11px] font-bold tabular-nums text-[#0f172a]">
          {fmtTRY(profile.total_spend_try)}
        </div>
        <HealthBadge health={behavior} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: SupplierPaymentTermsReport
}

export default function SupplierPaymentTermsClient({ companyId: _companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['supplier-payment-terms'],
    queryFn: async () => {
      const res = await fetch('/api/commercial/supplier-payment-terms')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 30 * 60 * 1000, // 30 min
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report
  if (!report || report.vendor_profiles.length === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Son 90 günde tedarikçi gideri bulunamadı</p>
      </div>
    )
  }

  const totalDiscountAvailable = report.total_discount_opportunity.total_discount_available
  const capturableCount        = report.total_discount_opportunity.capturable_count

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Tedarikçi Ödeme Koşulları
        </span>
        <ConcentrationBadge
          topVendorPct={report.supplier_concentration.top_vendor_pct}
          hhi={report.supplier_concentration.hhi}
        />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        {/* Optimization score */}
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
            Optimizasyon Skoru
          </div>
          <ScoreGauge score={report.optimization_score} />
        </div>

        {/* On-time rate */}
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Zamanında Ödeme
          </div>
          <div className={`text-2xl font-black tabular-nums leading-none ${
            report.on_time_rate_portfolio >= 0.95 ? 'text-emerald-700'
            : report.on_time_rate_portfolio >= 0.80 ? 'text-teal-700'
            : report.on_time_rate_portfolio >= 0.60 ? 'text-yellow-700'
            : 'text-red-700'
          }`}>
            {fmtPct(report.on_time_rate_portfolio * 100, 0)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            {report.vendor_profiles.length} tedarikçi
          </div>
        </div>

        {/* Avg payment days */}
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Ort. Ödeme Günü
          </div>
          <div className="text-2xl font-black tabular-nums leading-none text-[#0f172a]">
            {report.avg_payment_days_portfolio !== null
              ? `${report.avg_payment_days_portfolio}g`
              : '—'}
          </div>
          <HealthBadge health={report.payment_terms_health} />
        </div>

        {/* Discount opportunity */}
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            İskonto Fırsatı
          </div>
          <div className="text-2xl font-black tabular-nums leading-none text-emerald-700">
            {fmtTRY(totalDiscountAvailable)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            {capturableCount} değerlendirilebilir
          </div>
        </div>
      </div>

      {/* Narrative */}
      <div className="px-4 py-2 border-b border-[#f1f5f9] text-[11px] text-[#334155]">
        {report.narrative}
      </div>

      {/* Discount opportunities */}
      <div className="border-b border-[#e2e8f0]">
        <div className="px-4 py-2 border-b border-[#f8fafc]">
          <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Erken Ödeme İskonto Fırsatları
          </span>
        </div>
        <DiscountTable opportunities={report.discount_opportunities} />
      </div>

      {/* Vendor profiles */}
      <div>
        <div className="px-4 py-2 border-b border-[#f8fafc]">
          <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Tedarikçi Profilleri
          </span>
        </div>
        <div className="px-4 divide-y divide-[#f8fafc]">
          {report.vendor_profiles.slice(0, 10).map(p => (
            <VendorProfileRow key={p.vendor_name} profile={p} />
          ))}
        </div>
        {report.vendor_profiles.length > 10 && (
          <div className="px-4 py-2 text-[9px] text-[#cbd5e1] border-t border-[#f8fafc]">
            +{report.vendor_profiles.length - 10} tedarikçi daha
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Son {report.analysis_period_days} gün. İskonto: %2 erken ödeme varsayımı. Sermaye maliyeti: %20.
      </div>
    </div>
  )
}
