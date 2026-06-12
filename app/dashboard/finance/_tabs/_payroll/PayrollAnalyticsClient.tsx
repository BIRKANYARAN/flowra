'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PayrollAnalyticsClient
//
// Personel Maliyeti Analizi (Payroll & Compensation Analytics)
//
// Displays:
//   - Header: "Personel Maliyeti Analizi"
//   - 4 KPI cards: Personel Maliyet Oranı / Aylık Personel Maliyeti /
//                  Trend / Verimlilik Derecesi
//   - Cost breakdown: Maaşlar / SGK İşveren / Huzur Hakkı / Diğer (bars)
//   - Benchmark reference with current position highlighted
//   - SGK reference section: employer rate / min wage 2025
//   - Loading / error / empty states
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { PersonnelCostReport } from '@/lib/services/finance/payroll-analytics.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Efficiency badge ──────────────────────────────────────────────────────────

type Efficiency =
  | 'excellent'
  | 'good'
  | 'acceptable'
  | 'high'
  | 'excessive'
  | 'insufficient_data'

function EfficiencyBadge({ value }: { value: Efficiency }) {
  const cfg: Record<Efficiency, { label: string; cls: string }> = {
    excellent:        { label: 'Mükemmel (≤%15)',   cls: 'bg-[#dcfce7] text-[#166534] border-[#86efac]' },
    good:             { label: 'İyi (≤%25)',         cls: 'bg-[#d1fae5] text-[#065f46] border-[#6ee7b7]' },
    acceptable:       { label: 'Kabul Edilebilir (≤%35)', cls: 'bg-[#fef9c3] text-[#854d0e] border-[#fde047]' },
    high:             { label: 'Yüksek (≤%50)',      cls: 'bg-[#ffedd5] text-[#9a3412] border-[#fdba74]' },
    excessive:        { label: 'Aşırı (>%50)',       cls: 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]' },
    insufficient_data:{ label: 'Veri Yetersiz',      cls: 'bg-[#f1f5f9] text-[#64748b] border-[#cbd5e1]' },
  }
  const c = cfg[value]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── Trend badge ───────────────────────────────────────────────────────────────

type TrendClass =
  | 'decreasing'
  | 'stable'
  | 'growing'
  | 'rapidly_growing'
  | 'insufficient_data'

function TrendBadge({ value, pct }: { value: TrendClass; pct: number | null }) {
  const cfg: Record<TrendClass, { icon: string; label: string; cls: string }> = {
    decreasing:        { icon: '↓', label: 'Azalıyor',     cls: 'text-[#16a34a]' },
    stable:            { icon: '→', label: 'Sabit',         cls: 'text-[#64748b]' },
    growing:           { icon: '↑', label: 'Artıyor',       cls: 'text-[#d97706]' },
    rapidly_growing:   { icon: '↑↑', label: 'Hızlı Artış', cls: 'text-[#dc2626]' },
    insufficient_data: { icon: '—', label: 'Yetersiz Veri', cls: 'text-[#94a3b8]' },
  }
  const c = cfg[value]
  return (
    <span className={`font-black text-base ${c.cls}`}>
      {c.icon}
      <span className="text-[11px] font-semibold ml-1">
        {c.label}{pct !== null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}
      </span>
    </span>
  )
}

// ── Benchmark bar ──────────────────────────────────────────────────────────────

function BenchmarkBar({
  label,
  threshold,
  currentRatio,
  bgClass,
}: {
  label: string
  threshold: number
  currentRatio: number | null
  bgClass: string
}) {
  const isActive = currentRatio !== null && currentRatio <= threshold
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 rounded flex-1 ${bgClass} ${isActive ? 'ring-2 ring-[#0f172a] ring-offset-1' : 'opacity-60'}`}>
        <div className="sr-only">{threshold}%</div>
      </div>
      <span className={`text-[10px] font-semibold whitespace-nowrap ${isActive ? 'text-[#0f172a]' : 'text-[#94a3b8]'}`}>
        {label} ≤%{threshold}
      </span>
    </div>
  )
}

// ── Cost breakdown bar ─────────────────────────────────────────────────────────

function BreakdownBar({
  label,
  amount,
  maxAmount,
  colorClass,
}: {
  label: string
  amount: number
  maxAmount: number
  colorClass: string
}) {
  const pct = maxAmount > 0 ? Math.max(2, (amount / maxAmount) * 100) : 2
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-xs text-[#64748b] shrink-0 truncate">{label}</div>
      <div className="flex-1 bg-[#f1f5f9] rounded overflow-hidden h-4">
        <div className={`h-4 rounded ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-28 text-right text-xs font-bold tabular-nums text-[#1e293b] shrink-0">
        {amount > 0 ? fmtTRY(amount) : '—'}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PayrollAnalyticsClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: PersonnelCostReport }>({
    queryKey: ['payroll-analytics', companyId],
    queryFn:  async () => {
      const res = await fetch(`/api/finance/payroll-analytics?mode=personnel`)
      if (!res.ok) throw new Error('Personel maliyet verisi yüklenemedi')
      return res.json()
    },
    staleTime: 30 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded w-56" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-[#f1f5f9] rounded" />
            ))}
          </div>
          <div className="h-32 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Personel maliyet verisi yüklenirken hata oluştu.
        </p>
        <p className="text-[10px] text-[#94a3b8] mt-1">
          Admin yetkisi gereklidir veya veri mevcut değil.
        </p>
      </div>
    )
  }

  const { report } = data
  const cm = report.current_month
  const bd = cm.breakdown

  // ── Empty state ────────────────────────────────────────────────────────────
  if (cm.total_personnel_cost === 0 && report.ytd.total_personnel_cost === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-8 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">Personel gider verisi bulunamadı</p>
        <p className="text-[#94a3b8] text-xs mt-1">
          Gider kategorisi &quot;salary&quot; veya &quot;board_fee&quot; olan kayıt eklendiğinde analiz
          otomatik hesaplanır.
        </p>
      </div>
    )
  }

  // Breakdown bar max
  const maxBreakdown = Math.max(bd.gross_salaries, bd.sgk_employer, bd.huzur_hakki, bd.other_personnel, 1)

  const currentRatio = cm.personnel_cost_ratio_pct

  return (
    <div className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Personel Maliyeti Analizi
        </h3>
        <p className="text-[10px] text-[#94a3b8] mt-0.5">
          Maaş · SGK İşveren · Huzur Hakkı · Türk KOBİ Kıyaslama
        </p>
      </div>

      {/* ── 4 KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

        {/* Personel Maliyet Oranı */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
            Personel Maliyet Oranı
          </div>
          <div className="text-[10px] text-[#94a3b8]">Bu ay / Ciro</div>
          <div className="text-lg font-extrabold tabular-nums text-[#0f172a] mt-1">
            {currentRatio !== null ? fmtPct(currentRatio) : '—'}
          </div>
        </div>

        {/* Aylık Personel Maliyeti */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
            Aylık Personel Maliyeti
          </div>
          <div className="text-[10px] text-[#94a3b8]">Toplam (maaş+SGK+huzur)</div>
          <div className="text-lg font-extrabold tabular-nums text-neg mt-1">
            {fmtTRY(cm.total_personnel_cost)}
          </div>
        </div>

        {/* Trend */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
            Trend
          </div>
          <div className="text-[10px] text-[#94a3b8]">Önceki aya göre</div>
          <div className="mt-2">
            <TrendBadge value={cm.trend_class} pct={cm.cost_trend_pct} />
          </div>
        </div>

        {/* Verimlilik Derecesi */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
            Verimlilik Derecesi
          </div>
          <div className="text-[10px] text-[#94a3b8]">Türk KOBİ kıyaslama</div>
          <div className="mt-2">
            <EfficiencyBadge value={cm.efficiency} />
          </div>
        </div>

      </div>

      {/* ── Cost breakdown bars ──────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm space-y-3">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Maliyet Dağılımı — Bu Ay
        </div>
        <BreakdownBar
          label="Maaşlar (Brüt)"
          amount={bd.gross_salaries}
          maxAmount={maxBreakdown}
          colorClass="bg-neg"
        />
        <BreakdownBar
          label="SGK İşveren Payı"
          amount={bd.sgk_employer}
          maxAmount={maxBreakdown}
          colorClass="bg-warn"
        />
        <BreakdownBar
          label="Huzur Hakkı"
          amount={bd.huzur_hakki}
          maxAmount={maxBreakdown}
          colorClass="bg-info"
        />
        <BreakdownBar
          label="Diğer Personel"
          amount={bd.other_personnel}
          maxAmount={maxBreakdown}
          colorClass="bg-[#94a3b8]"
        />
        <div className="flex items-center justify-between pt-2 border-t border-[#f1f5f9] text-xs">
          <span className="text-[#64748b]">Toplam Bu Ay</span>
          <span className="font-black text-neg tabular-nums">{fmtTRY(cm.total_personnel_cost)}</span>
        </div>
      </div>

      {/* ── YTD summary ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Yıl Başından Bugüne (YTD)
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-[#94a3b8]">YTD Toplam</div>
            <div className="text-sm font-extrabold tabular-nums text-[#0f172a] mt-0.5">
              {fmtTRY(report.ytd.total_personnel_cost)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#94a3b8]">Aylık Ortalama</div>
            <div className="text-sm font-extrabold tabular-nums text-[#0f172a] mt-0.5">
              {fmtTRY(report.ytd.avg_monthly_cost)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#94a3b8]">YTD Maliyet Oranı</div>
            <div className="text-sm font-extrabold tabular-nums text-[#0f172a] mt-0.5">
              {report.ytd.personnel_cost_ratio_pct !== null
                ? fmtPct(report.ytd.personnel_cost_ratio_pct)
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Benchmark reference ──────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Türk KOBİ Kıyaslaması
          </div>
          {currentRatio !== null && (
            <span className="text-[10px] text-[#64748b]">
              Mevcut: <strong className="text-[#0f172a]">{fmtPct(currentRatio)}</strong>
            </span>
          )}
        </div>
        <BenchmarkBar
          label="Mükemmel"
          threshold={report.benchmarks.excellent_threshold}
          currentRatio={currentRatio}
          bgClass="bg-[#86efac]"
        />
        <BenchmarkBar
          label="İyi"
          threshold={report.benchmarks.good_threshold}
          currentRatio={currentRatio}
          bgClass="bg-[#6ee7b7]"
        />
        <BenchmarkBar
          label="Kabul Edilebilir"
          threshold={report.benchmarks.acceptable_threshold}
          currentRatio={currentRatio}
          bgClass="bg-[#fde047]"
        />
        <div className="pt-1 text-[9px] text-[#cbd5e1]">
          Kaynak: {report.benchmarks.industry} — Personel maliyeti / net ciro oranı
        </div>
      </div>

      {/* ── SGK reference ────────────────────────────────────────────────────── */}
      <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded p-4 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#1e40af] mb-3">
          SGK Referans Bilgileri — 2025
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-[#3b82f6] font-semibold">İşveren SGK Oranı</div>
            <div className="font-black text-[#1e3a8a] mt-0.5">
              %{(report.sgk_reference.employer_rate * 100).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[#3b82f6] font-semibold">İşçi SGK Oranı</div>
            <div className="font-black text-[#1e3a8a] mt-0.5">
              %{(report.sgk_reference.employee_rate * 100).toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-[#3b82f6] font-semibold">Asgari Ücret (Brüt)</div>
            <div className="font-black text-[#1e3a8a] mt-0.5 tabular-nums">
              {fmtTRY(report.sgk_reference.min_wage_try)}
            </div>
          </div>
          <div>
            <div className="text-[#3b82f6] font-semibold">Tipik Brüt→Net</div>
            <div className="font-black text-[#1e3a8a] mt-0.5">
              ~%{report.sgk_reference.typical_gross_to_net_pct}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[9px] text-[#93c5fd]">
          Asgari ücrette işveren toplam maliyeti:{' '}
          {fmtTRY(
            report.sgk_reference.min_wage_try * (1 + report.sgk_reference.employer_rate)
          )} / kişi/ay
        </div>
      </div>

    </div>
  )
}
