// ── WorkingCapitalSection — Çalışma Sermayesi (Working Capital Intelligence) ──
//
// RSC component — renders DSO, DPO, DIO, CCC metrics for the CFO tab.
// Data loaded server-side via WorkingCapitalService.
//
// Metrics shown:
//   • CCC prominently (headline)
//   • DSO, DPO, DIO in a 4-metric row
//   • Trend arrows for DSO and DPO
//   • Grade badge for CCC
//   • Context line in Turkish

import { WorkingCapitalService } from '@/lib/services/finance/working-capital.service'
import type { WorkingCapitalMetrics } from '@/lib/services/finance/working-capital.service'
import { fmtTRY } from '@/lib/format'
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Sub-components ────────────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: WorkingCapitalMetrics['dso_trend'] }) {
  if (trend === 'improving')     return <span className="text-pos-text text-xs">↓</span>
  if (trend === 'deteriorating') return <span className="text-neg-text text-xs">↑</span>
  if (trend === 'stable')        return <span className="text-[#94a3b8] text-xs">→</span>
  return <span className="text-[#cbd5e1] text-xs">—</span>
}

function CccGradeBadge({ grade }: { grade: WorkingCapitalMetrics['ccc_grade'] }) {
  const map = {
    excellent: 'bg-pos-light text-pos-text border-pos-light',
    good:      'bg-info-light text-info-text border-info-light',
    fair:      'bg-warn-light text-warn-text border-warn-light',
    poor:      'bg-neg-light text-neg-text border-neg-light',
  }
  const labels = {
    excellent: 'Mükemmel',
    good:      'İyi',
    fair:      'Orta',
    poor:      'Zayıf',
  }
  return (
    <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded border ${map[grade]}`}>
      {labels[grade]}
    </span>
  )
}

function MetricCard({
  label,
  value,
  subValue,
  trend,
  highlight,
}: {
  label: string
  value: string
  subValue?: string
  trend?: WorkingCapitalMetrics['dso_trend']
  highlight?: boolean
}) {
  return (
    <div className={`rounded border px-4 py-3 ${highlight ? 'bg-brand-subtle/10 border-brand/20' : 'bg-white border-[#e2e8f0]'}`}>
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
        {label}
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`text-xl font-black tabular-nums ${highlight ? 'text-brand' : 'text-[#0f172a]'}`}>
          {value}
        </span>
        {trend && <TrendArrow trend={trend} />}
      </div>
      {subValue && (
        <div className="text-[10px] text-[#94a3b8] mt-0.5">{subValue}</div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
  userId:    string
  supabase:  AnyClient
  period?:   { from: string; to: string }
}

export async function WorkingCapitalSection({ companyId, userId, supabase, period }: Props) {
  // Default: current month
  const today = new Date().toISOString().slice(0, 10)
  const from  = period?.from ?? (today.slice(0, 7) + '-01')
  const to    = period?.to   ?? today

  let metrics: WorkingCapitalMetrics | null = null
  try {
    metrics = await WorkingCapitalService.compute(companyId, userId, supabase, { from, to })
  } catch {
    // Silently fall back to null — show empty state
  }

  // ── Null / empty state ─────────────────────────────────────────────────────
  if (!metrics || (metrics.total_revenue_try === 0 && metrics.total_cogs_try === 0)) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Çalışma Sermayesi
        </div>
        <p className="text-xs text-[#94a3b8] py-2">
          Bu dönem için çalışma sermayesi verisi bulunamadı.
        </p>
      </div>
    )
  }

  const effectiveDso = metrics.dso_days ?? metrics.dso_formula_days
  const effectiveDpo = metrics.dpo_days ?? metrics.dpo_formula_days
  const fmtDays = (d: number | null) => d !== null ? `${Math.round(d)}g` : '—'

  // Context sentence
  const collectStr = effectiveDso !== null ? `${Math.round(effectiveDso)} günde` : 'veri yok'
  const payStr     = effectiveDpo !== null ? `${Math.round(effectiveDpo)} günde` : 'veri yok'
  const contextLine = `Müşterilerinizden tahsilat ${collectStr}, tedarikçilere ödeme ${payStr} gerçekleşiyor.`

  const dsoSubValue = metrics.prior_dso_days !== null
    ? `Önceki dönem: ${Math.round(metrics.prior_dso_days)}g`
    : undefined
  const dpoSubValue = metrics.prior_dpo_days !== null
    ? `Önceki dönem: ${Math.round(metrics.prior_dpo_days)}g`
    : undefined

  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Çalışma Sermayesi
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            DSO · DPO · DIO · CCC — {from} → {to}
          </div>
        </div>
        {metrics.ccc_days !== null && (
          <CccGradeBadge grade={metrics.ccc_grade} />
        )}
      </div>

      {/* CCC Headline */}
      <div className={`rounded border px-5 py-4 mb-3 flex items-center justify-between ${
        metrics.ccc_grade === 'excellent' ? 'bg-pos-light border-pos-light' :
        metrics.ccc_grade === 'good'      ? 'bg-info-light border-info-light' :
        metrics.ccc_grade === 'fair'      ? 'bg-warn-light border-warn-light' :
                                            'bg-neg-light border-neg-light'
      }`}>
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest opacity-60 mb-0.5">
            Nakit Dönüşüm Döngüsü (CCC)
          </div>
          <div className="text-3xl font-black tabular-nums">
            {metrics.ccc_days !== null ? `${Math.round(metrics.ccc_days)} gün` : '—'}
          </div>
          {metrics.prior_ccc_days !== null && (
            <div className="text-[10px] mt-1 opacity-70">
              Önceki dönem: {Math.round(metrics.prior_ccc_days)}g
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs font-bold opacity-80 mb-1">
            {metrics.ccc_grade === 'excellent' ? 'Tahsilat ödemeden önce' :
             metrics.ccc_grade === 'good'      ? 'Sağlıklı döngü' :
             metrics.ccc_grade === 'fair'      ? 'İyileştirme fırsatı' :
                                                 'Dikkat: Nakit bağlıyor'}
          </div>
          <div className="text-[10px] opacity-60">
            CCC = DSO + DIO − DPO
          </div>
        </div>
      </div>

      {/* 4-metric row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <MetricCard
          label="DSO — Tahsilat"
          value={fmtDays(effectiveDso)}
          subValue={dsoSubValue}
          trend={metrics.dso_trend}
        />
        <MetricCard
          label="DPO — Ödeme"
          value={fmtDays(effectiveDpo)}
          subValue={dpoSubValue}
          trend={metrics.dpo_trend}
        />
        <MetricCard
          label="DIO — Stok"
          value={fmtDays(metrics.dio_days)}
          subValue={metrics.inventory_value_try !== null ? fmtTRY(metrics.inventory_value_try) : 'Stok yok'}
        />
        <MetricCard
          label="CCC Toplam"
          value={fmtDays(metrics.ccc_days)}
          highlight
        />
      </div>

      {/* Context line */}
      <div className="text-[11px] text-[#64748b] border-t border-[#f1f5f9] pt-2.5 mt-1 leading-snug">
        <span className="text-[#cbd5e1] mr-1.5">—</span>
        {contextLine}
      </div>

      {/* Underlying data (compact) */}
      <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-1">
        {[
          { label: 'Dönem Cirosu',   value: fmtTRY(metrics.total_revenue_try) },
          { label: 'Alacaklar',      value: fmtTRY(metrics.total_receivables_try) },
          { label: 'Ort. Alacak',    value: fmtTRY(metrics.avg_receivables_try) },
          { label: 'SMST',           value: fmtTRY(metrics.total_cogs_try) },
          { label: 'Ödenecek Gider', value: fmtTRY(metrics.total_payables_try) },
          { label: 'Stok Değeri',    value: metrics.inventory_value_try !== null ? fmtTRY(metrics.inventory_value_try) : '—' },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between text-[10px]">
            <span className="text-[#94a3b8]">{row.label}</span>
            <span className="font-mono font-semibold text-[#334155] tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
