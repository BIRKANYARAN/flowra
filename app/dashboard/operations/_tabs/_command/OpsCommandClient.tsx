'use client'
// ── OpsCommandClient — OPS Command Center daily metrics ───────────────────────
//
// Morning briefing panel for the ops manager. Shows today's pulse, sales,
// collections, expenses, and stock metrics with auto-refresh every 2 minutes.

import { useQuery } from '@tanstack/react-query'
import type { DailyOpsMetrics } from '@/lib/services/intelligence/ops-command.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtDelta(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

// ── Pulse pill config ─────────────────────────────────────────────────────────

const PULSE_CONFIG = {
  strong:   { bg: 'bg-green-50 border-green-200',   text: 'text-green-700',  dot: 'bg-green-500',  label: 'Güçlü' },
  normal:   { bg: 'bg-info-light border-info-light',     text: 'text-info-text',   dot: 'bg-blue-500',   label: 'Normal' },
  slow:     { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'Yavaş' },
  critical: { bg: 'bg-red-50 border-red-200',       text: 'text-red-700',    dot: 'bg-red-500',    label: 'Kritik' },
} as const

// ── Alert severity config ─────────────────────────────────────────────────────

const ALERT_CONFIG = {
  critical: { bg: 'bg-red-50 border-red-200',       text: 'text-red-700',    icon: '●' },
  warning:  { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', icon: '▲' },
  info:     { bg: 'bg-info-light border-info-light',     text: 'text-info-text',   icon: 'ℹ' },
} as const

// ── Delta badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[10px] text-[#94a3b8]">—</span>
  const positive = pct >= 0
  return (
    <span className={`text-[10px] font-bold ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {fmtDelta(pct)}
    </span>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  primary,
  secondary,
  delta,
  tone = 'neutral',
}: {
  label: string
  primary: string
  secondary?: string
  delta?: number | null
  tone?: 'ok' | 'warn' | 'critical' | 'neutral'
}) {
  const valueColor = {
    ok:       'text-green-700',
    warn:     'text-yellow-700',
    critical: 'text-red-600',
    neutral:  'text-[#0f172a]',
  }[tone]

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-xl font-extrabold tabular-nums leading-none ${valueColor}`}>{primary}</div>
      {secondary && (
        <div className="text-[10px] text-[#94a3b8] mt-1">{secondary}</div>
      )}
      {delta !== undefined && (
        <div className="mt-1">
          <DeltaBadge pct={delta} />
        </div>
      )}
    </div>
  )
}

// ── WTD progress bar ──────────────────────────────────────────────────────────

function WtdBar({ todayTry, wtdTry }: { todayTry: number; wtdTry: number }) {
  const pct = wtdTry > 0 ? Math.min(100, (todayTry / wtdTry) * 100) : 0
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Haftalık İlerleme (Bu Gün / Haftalık Toplam)</span>
        <span className="text-xs font-bold text-[#334155] tabular-nums">{fmtTRY(todayTry)} / {fmtTRY(wtdTry)}</span>
      </div>
      <div className="h-2 bg-[#f1f5f9] rounded overflow-hidden">
        <div
          className="h-full bg-green-500 rounded transition-all duration-500"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <div className="text-[10px] text-[#94a3b8] mt-1">Bugün toplam haftalık satışın %{pct.toFixed(1)}'ini oluşturuyor</div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-16 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-10 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded px-5 py-4 text-center">
      <div className="text-sm font-semibold text-red-700 mb-2">Metrikler yüklenemedi</div>
      <button
        onClick={onRetry}
        className="text-xs font-bold text-red-700 border border-red-300 rounded px-3 py-1 hover:bg-red-100 transition-colors"
      >
        Tekrar Dene
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function OpsCommandClient({ companyId }: Props) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<{ metrics: DailyOpsMetrics }>({
    queryKey: ['ops-command', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/intelligence/ops-command')
      if (!res.ok) throw new Error('Ops command fetch failed')
      return res.json()
    },
    refetchInterval: 2 * 60 * 1000,   // auto-refresh every 2 minutes
    staleTime:       60 * 1000,
  })

  if (isLoading) return <Skeleton />
  if (isError || !data?.metrics) return <ErrorState onRetry={() => refetch()} />

  const m = data.metrics
  const pulse = PULSE_CONFIG[m.ops_pulse]

  return (
    <div className="space-y-4">

      {/* Pulse indicator */}
      <div className={`flex items-center gap-3 px-5 py-4 border rounded ${pulse.bg}`}>
        <span className={`w-3 h-3 rounded-full ${pulse.dot} animate-pulse`} />
        <div className="flex-1">
          <div className={`text-sm font-bold uppercase tracking-wide ${pulse.text}`}>
            Operasyonel Nabız: {pulse.label}
          </div>
          <div className={`text-[11px] mt-0.5 ${pulse.text} opacity-75`}>
            {m.as_of_date} tarihli günlük komuta raporu
          </div>
        </div>
        <div className={`text-2xl font-extrabold tabular-nums ${pulse.text}`}>
          {m.fill_rate_pct.toFixed(0)}%
          <div className={`text-[9px] font-semibold uppercase tracking-wide ${pulse.text} opacity-60`}>doluluk</div>
        </div>
      </div>

      {/* Metrics grid: 2×3 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard
          label="Bugünkü Satışlar"
          primary={m.sales_today_count > 0 ? `${m.sales_today_count} satış` : '—'}
          secondary={m.sales_today_count > 0 ? fmtTRY(m.sales_today_try) : 'Henüz satış yok'}
          delta={m.sales_dod_pct}
          tone={m.sales_today_count > 0 ? 'ok' : 'neutral'}
        />
        <MetricCard
          label="Bugünkü Tahsilat"
          primary={fmtTRY(m.collections_today_try)}
          secondary="Bugün tahsil edilen"
          delta={m.collections_dod_pct}
          tone={m.collections_today_try > 0 ? 'ok' : 'neutral'}
        />
        <MetricCard
          label="Gecikmiş Alacaklar"
          primary={m.collections_overdue_count > 0 ? `${m.collections_overdue_count} adet` : 'Temiz'}
          secondary={m.collections_overdue_count > 0 ? fmtTRY(m.collections_overdue_try) : 'Gecikmiş alacak yok'}
          tone={m.collections_overdue_count > 5 ? 'critical' : m.collections_overdue_count > 0 ? 'warn' : 'ok'}
        />
        <MetricCard
          label="Kritik Stok"
          primary={m.stock_critical_count > 0 ? `${m.stock_critical_count} ürün` : 'Normal'}
          secondary={m.stock_out_count > 0 ? `${m.stock_out_count} ürün tükendi` : 'Tükenmiş ürün yok'}
          tone={m.stock_out_count > 0 ? 'critical' : m.stock_critical_count > 3 ? 'warn' : 'ok'}
        />
        <MetricCard
          label="Bekleyen Giderler"
          primary={m.expenses_pending_approval > 0 ? `${m.expenses_pending_approval} gider` : 'Temiz'}
          secondary={m.expenses_today_try > 0 ? `Bugün: ${fmtTRY(m.expenses_today_try)}` : 'Bugün gider yok'}
          tone={m.expenses_pending_approval > 0 ? 'warn' : 'neutral'}
        />
        <MetricCard
          label="Bekleyen Siparişler"
          primary={m.pending_purchase_orders > 0 ? `${m.pending_purchase_orders} sipariş` : 'Boş'}
          secondary={m.pending_purchase_orders > 0 ? 'Teslim bekleniyor' : 'Açık sipariş yok'}
          tone={m.pending_purchase_orders > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {/* WTD progress bar */}
      <WtdBar todayTry={m.sales_today_try} wtdTry={m.sales_wtd_try} />

      {/* Alerts */}
      {m.alerts.length > 0 && (
        <div className="space-y-2">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Uyarılar</div>
          {m.alerts.map((alert, i) => {
            const cfg = ALERT_CONFIG[alert.severity]
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 border rounded ${cfg.bg}`}>
                <span className={`text-base leading-none mt-px ${cfg.text}`}>{cfg.icon}</span>
                <span className={`text-xs font-semibold ${cfg.text}`}>{alert.message}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Timestamp */}
      <div className="text-[10px] text-[#94a3b8] text-right">
        Güncellendi: {dataUpdatedAt ? fmtTime(new Date(dataUpdatedAt).toISOString()) : '—'}
      </div>
    </div>
  )
}
