'use client'

// ─────────────────────────────────────────────────────────────────────────────
// WorkingCapitalOptimizerClient
//
// Displays actionable working capital optimization recommendations with
// estimated cash impact per recommendation.
//
// Features:
//   - CCC summary: Current → Target → Improvement
//   - Total cash impact hero
//   - Recommendation cards with priority badges, current/target days, cash impact
//   - Action items (collapsed by default, expand on click)
//   - Implementation difficulty badge
//   - Summary narrative
//   - Empty state when no recommendations
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }   from '@tanstack/react-query'
import { fmtTRY }     from '@/lib/format'
import type {
  WorkingCapitalOptimizationReport,
  OptimizationRecommendation,
} from '@/lib/services/finance/working-capital-optimizer.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Priority badge ─────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: OptimizationRecommendation['priority'] }) {
  const cfg = {
    high:   { label: 'Yüksek Öncelik', cls: 'bg-red-100 text-red-800 border-red-200' },
    medium: { label: 'Orta Öncelik',   cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    low:    { label: 'Düşük Öncelik',  cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  }[priority]

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Difficulty badge ───────────────────────────────────────────────────────────

function DifficultyBadge({
  difficulty,
}: {
  difficulty: WorkingCapitalOptimizationReport['implementation_difficulty']
}) {
  const cfg = {
    easy:     { label: 'Kolay Uygulama',      cls: 'bg-green-100 text-green-800 border-green-200' },
    moderate: { label: 'Orta Düzey Uygulama', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    complex:  { label: 'Karmaşık Uygulama',   cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  }[difficulty]

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Category icon ──────────────────────────────────────────────────────────────

function CategoryIcon({ category }: { category: OptimizationRecommendation['category'] }) {
  const icons = {
    receivables: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    payables: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    inventory: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  }
  return icons[category]
}

// ── Recommendation card ────────────────────────────────────────────────────────

function RecommendationCard({ rec }: { rec: OptimizationRecommendation }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            rec.category === 'receivables' ? 'bg-blue-100 text-blue-700'
            : rec.category === 'payables'  ? 'bg-purple-100 text-purple-700'
            : 'bg-orange-100 text-orange-700'
          }`}>
            <CategoryIcon category={rec.category} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#0f172a] leading-tight">{rec.title}</div>
            <div className="text-[11px] text-[#64748b] mt-0.5">{rec.description}</div>
          </div>
        </div>
        <PriorityBadge priority={rec.priority} />
      </div>

      {/* Metrics row */}
      <div className="px-4 py-3 grid grid-cols-3 gap-4 bg-[#f8fafc]">
        {/* Current days */}
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Mevcut</div>
          <div className="text-xl font-black tabular-nums text-[#ef4444]">{rec.current_days}</div>
          <div className="text-[10px] text-[#94a3b8]">gün</div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <svg className="w-5 h-5 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <div className="text-[10px] font-bold text-[#10b981]">−{rec.days_improvement}g</div>
          </div>
        </div>

        {/* Target days */}
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Hedef</div>
          <div className="text-xl font-black tabular-nums text-[#10b981]">{rec.target_days}</div>
          <div className="text-[10px] text-[#94a3b8]">gün</div>
        </div>
      </div>

      {/* Cash impact */}
      <div className="px-4 py-3 flex items-center justify-between border-t border-[#f1f5f9]">
        <span className="text-[11px] font-semibold text-[#64748b]">Tahmini Nakit Etkisi</span>
        <span className="text-base font-black text-[#0f172a] tabular-nums">
          {fmtTRY(rec.cash_impact_try, 0)}
        </span>
      </div>

      {/* Action items — collapsible */}
      <details className="group border-t border-[#f1f5f9]">
        <summary className="px-4 py-2.5 flex items-center justify-between cursor-pointer select-none list-none text-[11px] font-bold text-[#64748b] hover:bg-[#f8fafc] transition-colors">
          <span>Aksiyon Adımları ({rec.action_items.length})</span>
          <svg
            className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <ul className="px-4 pb-3 pt-1 space-y-1.5">
          {rec.action_items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#cbd5e1] mt-1.5 flex-shrink-0" />
              <span className="text-xs text-[#475569]">{item}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WorkingCapitalOptimizerClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: WorkingCapitalOptimizationReport }>({
    queryKey: ['wc-optimization', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/working-capital-optimization')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-lg px-6 py-10 text-center">
        <div className="text-sm text-[#94a3b8] font-medium">Optimizasyon analizi yükleniyor...</div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-lg px-6 py-6 text-center">
        <div className="text-sm text-[#ef4444] font-medium">Optimizasyon raporu yüklenemedi.</div>
      </div>
    )
  }

  const { report } = data

  // ── Empty state ────────────────────────────────────────────────────────────

  if (report.recommendations.length === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-lg px-6 py-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">İşletme Sermayesi Optimizasyonu</span>
        </div>
        <div className="text-center py-4">
          <div className="w-10 h-10 rounded-full bg-pos-light flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-pos" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="text-sm font-bold text-[#0f172a] mb-1">Tebrikler!</div>
          <div className="text-xs text-[#64748b]">
            İyileştirme önerisi bulunamadı (CCC benchmark dahilinde)
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
          İşletme Sermayesi Optimizasyonu
        </span>
        <DifficultyBadge difficulty={report.implementation_difficulty} />
      </div>

      {/* CCC summary strip */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg px-4 py-4">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Mevcut CCC</div>
            <div className="text-2xl font-black tabular-nums text-[#ef4444]">{report.current_ccc_days}</div>
            <div className="text-[10px] text-[#94a3b8]">gün</div>
          </div>

          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-1">
              <svg className="w-6 h-6 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <div className="text-[10px] font-bold text-[#10b981]">−{report.ccc_improvement_days}g</div>
            </div>
          </div>

          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Hedef CCC</div>
            <div className="text-2xl font-black tabular-nums text-[#10b981]">{report.target_ccc_days}</div>
            <div className="text-[10px] text-[#94a3b8]">gün</div>
          </div>
        </div>

        {/* Total cash impact hero */}
        <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-4 py-3 text-center">
          <div className="text-[10px] font-black uppercase tracking-wider text-[#16a34a] mb-1">
            Toplam Nakit Optimizasyon Potansiyeli
          </div>
          <div className="text-3xl font-black tabular-nums text-[#15803d]">
            {fmtTRY(report.total_cash_impact_try, 0)}
          </div>
          <div className="text-xs text-[#16a34a] mt-1 font-medium">nakit optimize edilebilir</div>
        </div>
      </div>

      {/* Recommendation cards */}
      <div className="space-y-3">
        {report.recommendations.map(rec => (
          <RecommendationCard key={rec.id} rec={rec} />
        ))}
      </div>

      {/* Summary narrative */}
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-4 py-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-[#94a3b8] mb-1.5">Yönetici Özeti</div>
        <p className="text-xs text-[#475569] leading-relaxed">{report.summary_narrative}</p>
      </div>
    </div>
  )
}
