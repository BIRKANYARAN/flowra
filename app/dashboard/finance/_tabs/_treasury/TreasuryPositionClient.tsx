'use client'

// ─────────────────────────────────────────────────────────────────────────────
// TreasuryPositionClient
//
// Treasury Cash Position dashboard.
//
// Features:
//   - 4 KPI cells: Total Cash, Days on Hand, Current Ratio, Runway
//   - Liquidity classification badge + Treasury health score
//   - 4-week cash flow projection bar visualization (green/red)
//   - Turkish-language alerts list
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY }    from '@/lib/format'
import type { TreasuryPositionReport, CashFlowProjection } from '@/lib/services/finance/treasury-position.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRatio(v: number | null): string {
  if (v === null) return '—'
  return v.toFixed(2) + 'x'
}

function fmtMonths(v: number | null): string {
  if (v === null) return 'Yok'
  return v.toFixed(1) + ' ay'
}

function fmtDays(v: number | null): string {
  if (v === null) return '—'
  return Math.round(v) + ' gün'
}

// ── Liquidity badge ───────────────────────────────────────────────────────────

type LiqClass = 'strong' | 'adequate' | 'tight' | 'critical' | 'insolvent'

function LiquidityBadge({ cls }: { cls: LiqClass }) {
  const config: Record<LiqClass, { label: string; style: string }> = {
    strong:    { label: 'Güçlü',       style: 'bg-green-100 text-green-800 border-green-200' },
    adequate:  { label: 'Yeterli',     style: 'bg-teal-100 text-teal-800 border-teal-200' },
    tight:     { label: 'Sıkışık',     style: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    critical:  { label: 'Kritik',      style: 'bg-orange-100 text-orange-800 border-orange-200' },
    insolvent: { label: 'Yetersiz',    style: 'bg-red-100 text-red-800 border-red-200' },
  }
  const c = config[cls]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.style}`}>
      {c.label}
    </span>
  )
}

// ── Days cash health badge ────────────────────────────────────────────────────

type DaysHealth = 'excellent' | 'good' | 'adequate' | 'low' | 'critical' | 'unknown'

function DaysCashBadge({ cls }: { cls: DaysHealth }) {
  const config: Record<DaysHealth, { label: string; style: string }> = {
    excellent: { label: 'Mükemmel (≥90g)', style: 'bg-green-100 text-green-800 border-green-200' },
    good:      { label: 'İyi (60-89g)',    style: 'bg-teal-100 text-teal-800 border-teal-200' },
    adequate:  { label: 'Yeterli (30-59g)', style: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    low:       { label: 'Düşük (14-29g)',  style: 'bg-orange-100 text-orange-800 border-orange-200' },
    critical:  { label: 'Kritik (<14g)',   style: 'bg-red-100 text-red-800 border-red-200' },
    unknown:   { label: 'Veri Yok',        style: 'bg-slate-100 text-slate-600 border-slate-200' },
  }
  const c = config[cls]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.style}`}>
      {c.label}
    </span>
  )
}

// ── Health score gauge ────────────────────────────────────────────────────────

function HealthScoreGauge({ score }: { score: number }) {
  const clampedScore = Math.min(100, Math.max(0, score))
  const color = clampedScore >= 75 ? 'bg-green-500'
    : clampedScore >= 50 ? 'bg-teal-500'
    : clampedScore >= 30 ? 'bg-yellow-400'
    : 'bg-red-500'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-[#64748b] uppercase tracking-wider">Hazine Sağlık Skoru</span>
        <span className="text-lg font-black tabular-nums text-[#0f172a]">{clampedScore.toFixed(0)}</span>
      </div>
      <div className="w-full h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-[#94a3b8]">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  )
}

// ── KPI cell ──────────────────────────────────────────────────────────────────

function KpiCell({
  label, value, sub, badge,
}: {
  label: string
  value: string
  sub?: string
  badge?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{label}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mb-1">{sub}</div>}
      <div className="text-xl font-black tabular-nums text-[#0f172a]">{value}</div>
      {badge && <div className="mt-2">{badge}</div>}
    </div>
  )
}

// ── 4-week projection bar ─────────────────────────────────────────────────────

function ProjectionBar({ projection }: { projection: CashFlowProjection[] }) {
  const maxAbs = Math.max(...projection.map(w => Math.abs(w.net_cash_flow_try)), 1)

  return (
    <div className="space-y-3">
      {projection.map((week) => {
        const pct     = Math.min(100, (Math.abs(week.net_cash_flow_try) / maxAbs) * 100)
        const isPos   = week.net_cash_flow_try >= 0
        const barColor = week.is_negative ? 'bg-red-400' : isPos ? 'bg-green-500' : 'bg-orange-400'

        return (
          <div key={week.week} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-[#64748b] w-24 shrink-0">{week.week_label}</span>
              <div className="flex-1 h-4 bg-[#f1f5f9] rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[10px] tabular-nums font-bold w-28 text-right shrink-0 ${isPos ? 'text-green-700' : 'text-red-700'}`}>
                {isPos ? '+' : ''}{fmtTRY(week.net_cash_flow_try, 0)}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 pr-0">
              <span className="text-[9px] text-[#94a3b8]">Kümülatif:</span>
              <span className={`text-[9px] tabular-nums font-semibold ${week.is_negative ? 'text-red-600' : 'text-[#0f172a]'}`}>
                {fmtTRY(week.cumulative_cash_try, 0)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function TreasuryPositionClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: TreasuryPositionReport }>({
    queryKey: ['treasury-position', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/treasury-position')
      if (!res.ok) throw new Error('Hazine nakit pozisyonu yüklenemedi')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded w-56" />
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-[#f1f5f9] rounded" />
            ))}
          </div>
          <div className="h-32 bg-[#f1f5f9] rounded" />
          <div className="h-40 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Hazine nakit pozisyonu yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const report = data.report
  const pos    = report.cash_position
  const ratios = report.ratios

  return (
    <div className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Hazine Nakit Pozisyonu
          </h3>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">{report.as_of_date} itibarıyla</p>
        </div>
        <div className="flex items-center gap-2">
          <LiquidityBadge cls={report.liquidity_classification} />
        </div>
      </div>

      {/* ── 4 KPI cells ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCell
          label="Toplam Nakit"
          sub="Kasa + Banka"
          value={fmtTRY(pos.total_cash_try, 0)}
        />
        <KpiCell
          label="Nakit Rezerv"
          sub="Günlük gider karşılama"
          value={fmtDays(ratios.days_cash_on_hand)}
          badge={<DaysCashBadge cls={report.days_cash_health} />}
        />
        <KpiCell
          label="Cari Oran"
          sub="Dönen varlık / kısa vadeli borç"
          value={fmtRatio(ratios.current_ratio)}
          badge={
            ratios.current_ratio !== null ? (
              <span className={`text-[9px] font-semibold ${
                ratios.current_ratio >= 2 ? 'text-green-600'
                  : ratios.current_ratio >= 1 ? 'text-yellow-600'
                  : 'text-red-600'
              }`}>
                {ratios.current_ratio >= 2 ? 'Sağlıklı' : ratios.current_ratio >= 1 ? 'Dikkatli' : 'Risk'}
              </span>
            ) : undefined
          }
        />
        <KpiCell
          label="Nakit Pisti"
          sub="Mevcut yakma hızıyla"
          value={fmtMonths(report.runway_months)}
          badge={
            report.runway_months === null ? (
              <span className="text-[9px] font-semibold text-green-600">Nakit üretiyor</span>
            ) : report.runway_months <= 2 ? (
              <span className="text-[9px] font-semibold text-red-600">Kritik</span>
            ) : report.runway_months <= 4 ? (
              <span className="text-[9px] font-semibold text-yellow-600">Dikkatli</span>
            ) : (
              <span className="text-[9px] font-semibold text-green-600">Yeterli</span>
            )
          }
        />
      </div>

      <div className="grid grid-cols-12 gap-4">

        {/* ── Left: position details + health score ───────────────────────── */}
        <div className="col-span-5 space-y-3">

          {/* Health score */}
          <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
            <HealthScoreGauge score={report.treasury_health_score} />
          </div>

          {/* Cash position breakdown */}
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
              Nakit Pozisyon Detayı
            </div>
            <div className="space-y-2">
              {[
                { label: 'Kasa (100)',          value: pos.cash_on_hand_try },
                { label: 'Bankalar (102)',       value: pos.bank_deposits_try },
                { label: 'K.V. Alacaklar (120)', value: pos.short_term_receivables_try },
                { label: 'Toplam Likit',         value: pos.total_liquid_try,         bold: true },
                { label: 'K.V. Borçlar (320)',   value: -pos.short_term_payables_try, negative: true },
                { label: 'Net Likidite',         value: pos.net_liquidity_try,         bold: true, colored: true },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] ${row.bold ? 'font-bold text-[#0f172a]' : 'text-[#64748b]'}`}>
                    {row.label}
                  </span>
                  <span className={`text-[10px] tabular-nums ${
                    row.colored
                      ? row.value >= 0 ? 'font-black text-green-700' : 'font-black text-red-700'
                      : row.bold
                        ? 'font-bold text-[#0f172a]'
                        : row.negative
                          ? 'text-red-600'
                          : 'text-[#1e293b]'
                  }`}>
                    {row.negative ? `-${fmtTRY(Math.abs(row.value), 0)}` : fmtTRY(row.value, 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Burn rate */}
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
              Aylık Nakit Akışı
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#64748b]">
                {report.monthly_burn_rate > 0 ? 'Yakma Hızı' : 'Nakit Üretimi'}
              </span>
              <span className={`text-base font-black tabular-nums ${report.monthly_burn_rate > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {report.monthly_burn_rate > 0 ? '-' : '+'}{fmtTRY(Math.abs(report.monthly_burn_rate), 0)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: 4-week projection + alerts ───────────────────────────── */}
        <div className="col-span-7 space-y-3">

          {/* 4-week projection */}
          <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              4 Haftalık Nakit Projeksiyonu
            </div>
            <div className="text-[10px] text-[#94a3b8] mb-4">
              Haftalık tahmini giriş / çıkış ve kümülatif pozisyon
            </div>
            <ProjectionBar projection={report.cash_flow_projection} />
          </div>

          {/* Alerts */}
          {report.alerts.length > 0 && (
            <div className="space-y-2">
              {report.alerts.map((alert, idx) => {
                const isKritik = alert.startsWith('KRİTİK')
                const isUyari  = alert.startsWith('UYARI')
                const borderColor = isKritik ? 'border-red-200 bg-red-50'
                  : isUyari  ? 'border-orange-200 bg-orange-50'
                  : 'border-yellow-200 bg-yellow-50'
                const dotColor = isKritik ? 'bg-red-400'
                  : isUyari  ? 'bg-orange-400'
                  : 'bg-yellow-400'
                const textColor = isKritik ? 'text-red-800'
                  : isUyari  ? 'text-orange-800'
                  : 'text-yellow-800'

                return (
                  <div
                    key={idx}
                    className={`rounded border px-4 py-3 flex items-start gap-3 ${borderColor}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0 mt-1.5`} />
                    <p className={`text-[11px] font-semibold leading-snug ${textColor}`}>{alert}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* No alerts state */}
          {report.alerts.length === 0 && (
            <div className="rounded border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 mt-1.5" />
              <p className="text-[11px] font-semibold text-green-800">
                Nakit pozisyonu sağlıklı — kritik bir uyarı bulunmuyor.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
