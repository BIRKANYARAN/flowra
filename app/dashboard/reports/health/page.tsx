// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/reports/health/page.tsx — Mali Sağlık Raporu
//
// Server component. Fetches CompanyHealthReport from the API and renders
// a printable one-page summary.
//
// Layout:
//   • Company name + date header
//   • Overall grade badge (large letter)
//   • 5 section cards in 2-column grid
//   • Executive summary footer
//   • @media print → clean layout, no sidebar/header
//   • Print button for non-print view
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }      from '@/lib/supabase-server'
import { resolveCompanyId }  from '@/lib/resolve-company'
import { HealthReportService } from '@/lib/services/reports/health-report.service'
import type { CompanyHealthReport, HealthReportSection } from '@/lib/services/reports/health-report.service'
import Link                  from 'next/link'
import PrintButton           from './PrintButton'
import { HealthCharts }      from './HealthCharts'

export const dynamic = 'force-dynamic'

// ── Grade colors ──────────────────────────────────────────────────────────────

function gradeBg(g: string | null): string {
  switch (g) {
    case 'A': return 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]'
    case 'B': return 'bg-[#dbeafe] text-[#1d4ed8] border-[#bfdbfe]'
    case 'C': return 'bg-[#fef9c3] text-[#854d0e] border-[#fef08a]'
    case 'D': return 'bg-[#ffedd5] text-[#c2410c] border-[#fed7aa]'
    case 'F': return 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]'
    default:  return 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]'
  }
}

function statusDot(s: 'good' | 'warning' | 'critical' | 'neutral'): string {
  switch (s) {
    case 'good':     return 'bg-[#22c55e]'
    case 'warning':  return 'bg-[#f59e0b]'
    case 'critical': return 'bg-[#ef4444]'
    default:         return 'bg-[#94a3b8]'
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GradeBadge({ grade, size = 'sm' }: { grade: string | null; size?: 'sm' | 'lg' }) {
  const base  = gradeBg(grade)
  const cls   = size === 'lg'
    ? `w-20 h-20 text-5xl font-black rounded-2xl border-2 flex items-center justify-center ${base}`
    : `w-8 h-8 text-base font-black rounded-lg border flex items-center justify-center ${base}`
  return <div className={cls}>{grade ?? '—'}</div>
}

function SectionCard({ section }: { section: HealthReportSection }) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 flex flex-col gap-3 print:break-inside-avoid">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-[#0f172a]">{section.title}</span>
        <GradeBadge grade={section.grade} size="sm" />
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-1.5">
        {section.key_metrics.map((m, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot(m.status)}`} />
              <span className="text-[11px] text-[#64748b]">{m.label}</span>
            </div>
            <span className="text-[11px] font-semibold text-[#0f172a] tabular-nums">{m.value}</span>
          </div>
        ))}
      </div>

      {/* Insight */}
      <p className="text-[10px] text-[#94a3b8] italic border-t border-[#f1f5f9] pt-2 leading-relaxed">
        {section.insight}
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HealthReportPage() {
  // Server-side: resolve user + company, then generate report
  let report: CompanyHealthReport | null = null
  let errorMsg: string | null = null

  try {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) throw new Error('Oturum açık değil')

    const companyId = await resolveCompanyId(authData.user.id, supabase)
    report = await HealthReportService.generate(companyId, supabase, authData.user.id)
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : 'Rapor oluşturulamadı'
  }

  if (errorMsg || !report) {
    return (
      <div className="max-w-2xl">
        <div className="bg-[#fee2e2] border border-[#fecaca] rounded px-4 py-3 text-sm text-[#b91c1c]">
          {errorMsg ?? 'Rapor yüklenemedi.'}
        </div>
        <Link href="/dashboard/reports" className="mt-4 inline-block text-sm text-brand-light hover:text-brand underline">
          ← Raporlara dön
        </Link>
      </div>
    )
  }

  const r = report
  const overallBg = gradeBg(r.overall_grade)
  const today = new Date(r.report_date).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
      {/* Print stylesheet — injected as plain style tag */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #health-report-root { display: block !important; }
          #health-report-root .print\\:hidden { display: none !important; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>

      <div id="health-report-root" className="max-w-4xl print:max-w-none">

        {/* Toolbar (hidden when printing) */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link href="/dashboard/reports" className="text-xs text-brand-light hover:text-brand underline underline-offset-2">
            ← Raporlara dön
          </Link>
          <PrintButton />
        </div>

        {/* ── HEADER ────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b border-[#e8eaef]">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-black text-[#94a3b8] mb-1">
              Mali Sağlık Raporu
            </div>
            <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">{r.company_name}</h1>
            <p className="text-xs text-[#94a3b8] mt-1">
              {r.period_label} · {today} · {r.generated_by}
            </p>
          </div>

          {/* Overall grade */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <GradeBadge grade={r.overall_grade} size="lg" />
            <div className="text-[10px] font-bold text-[#94a3b8] text-center">
              Genel Puan
              <br />
              <span className="text-[#0f172a] text-xs">{r.overall_score}/100</span>
            </div>
          </div>
        </div>

        {/* ── VISUAL SCORE SUMMARY ──────────────────────────────────────────── */}
        <HealthCharts
          overallScore={r.overall_score}
          overallGrade={r.overall_grade}
          sections={[
            { title: r.sections.liquidity.title,           score: r.sections.liquidity.score },
            { title: r.sections.profitability.title,       score: r.sections.profitability.score },
            { title: r.sections.receivables.title,         score: r.sections.receivables.score },
            { title: r.sections.partner_obligations.title, score: r.sections.partner_obligations.score },
            { title: r.sections.operational.title,         score: r.sections.operational.score },
          ]}
        />

        {/* ── SECTIONS GRID ─────────────────────────────────────────────────── */}
        {/* 2-col grid, 5 items: rows of 2 + 2 + 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <SectionCard section={r.sections.liquidity} />
          <SectionCard section={r.sections.profitability} />
          <SectionCard section={r.sections.receivables} />
          <SectionCard section={r.sections.partner_obligations} />
          {/* Operational spans both columns on larger screens */}
          <div className="sm:col-span-2">
            <SectionCard section={r.sections.operational} />
          </div>
        </div>

        {/* ── EXECUTIVE SUMMARY ─────────────────────────────────────────────── */}
        <div className={`rounded-lg border-2 p-4 mb-4 ${overallBg}`}>
          <div className="text-[10px] uppercase tracking-widest font-black mb-2 opacity-70">
            Yönetici Özeti
          </div>
          <p className="text-sm font-medium leading-relaxed">{r.executive_summary}</p>
        </div>

        {/* ── DISCLAIMER ────────────────────────────────────────────────────── */}
        <p className="text-[9px] text-[#94a3b8] italic leading-relaxed">
          {r.disclaimer}
        </p>
      </div>
    </>
  )
}
