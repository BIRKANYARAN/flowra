'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PeriodCloseReadinessClient
//
// Month-end close readiness scorecard for CFO.
// Shows 0-100 score, readiness class badge, blocking issues list,
// and full 10-item checklist with status icons.
//
// Data: GET /api/finance/period-close-readiness
// Query key: ['period-close-readiness', companyId]
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import type {
  CloseCheck,
  CheckStatus,
} from '@/lib/services/finance/period-close-readiness.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PeriodCloseReadinessReport {
  checks: CloseCheck[]
  score: number
  readiness: 'ready' | 'near_ready' | 'needs_work' | 'not_ready'
  is_ready: boolean
  blocking_count: number
  check_summary: {
    blocking_failures:     CloseCheck[]
    non_blocking_failures: CloseCheck[]
    warnings:              CloseCheck[]
    passed:                CloseCheck[]
  }
  current_period: {
    id: string | null
    name: string | null
    status: string | null
    start_date: string | null
    end_date: string | null
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<PeriodCloseReadinessReport> {
  const res = await fetch('/api/finance/period-close-readiness', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Period close readiness fetch failed: ${res.status}`)
  const json = await res.json()
  return json.report
}

// ── Status icon ────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { icon: string; cls: string }> = {
    passed:  { icon: '✓', cls: 'text-pos-text bg-pos-light border-pos-light' },
    failed:  { icon: '✗', cls: 'text-neg-text bg-neg-light border-neg-light' },
    warning: { icon: '⚠', cls: 'text-warn-text bg-warn-light border-warn-light' },
    skipped: { icon: '–', cls: 'text-[#94a3b8] bg-[#f8fafc] border-[#e8eaef]' },
  }
  const { icon, cls } = map[status]
  return (
    <span
      className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-black shrink-0 ${cls}`}
    >
      {icon}
    </span>
  )
}

// ── Readiness badge ────────────────────────────────────────────────────────────

function ReadinessBadge({ readiness }: { readiness: PeriodCloseReadinessReport['readiness'] }) {
  const map = {
    ready:      { label: 'Hazır',         cls: 'bg-pos-light text-pos-text border-pos-light' },
    near_ready: { label: 'Neredeyse Hazır', cls: 'bg-info-light text-info-text border-info-light' },
    needs_work: { label: 'Çalışma Gerekli', cls: 'bg-warn-light text-warn-text border-warn-light' },
    not_ready:  { label: 'Hazır Değil',   cls: 'bg-neg-light text-neg-text border-neg-light' },
  } as const
  const { label, cls } = map[readiness]
  return (
    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

// ── Score ring ──────────────────────────────────────────────────────────────────

function ScoreRing({ score, readiness }: { score: number; readiness: PeriodCloseReadinessReport['readiness'] }) {
  const colorMap = {
    ready:      'text-pos-text',
    near_ready: 'text-info-text',
    needs_work: 'text-warn-text',
    not_ready:  'text-neg-text',
  }
  const bgMap = {
    ready:      'border-pos-light bg-pos-light/30',
    near_ready: 'border-info-light bg-info-light/30',
    needs_work: 'border-warn-light bg-warn-light/30',
    not_ready:  'border-neg-light bg-neg-light/30',
  }
  return (
    <div className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center ${bgMap[readiness]}`}>
      <span className={`text-2xl font-black tabular-nums leading-none ${colorMap[readiness]}`}>{score}</span>
      <span className="text-[0.6rem] text-[#94a3b8] font-semibold leading-none mt-0.5">/100</span>
    </div>
  )
}

// ── Check row ──────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: CloseCheck }) {
  const isBlockingFail = check.is_blocking && check.status === 'failed'
  const rowBg = isBlockingFail
    ? 'bg-neg-light/40 border-neg-light'
    : check.status === 'warning'
    ? 'bg-warn-light/30 border-warn-light'
    : check.status === 'passed'
    ? 'bg-white border-[#e8eaef]'
    : 'bg-[#f8fafc] border-[#e8eaef]'

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${rowBg}`}>
      <StatusIcon status={check.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${isBlockingFail ? 'text-neg-text' : 'text-[#0f172a]'}`}>
            {check.label}
          </span>
          {check.is_blocking && check.status === 'failed' && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-[#fef2f2] text-neg-text border-neg-light uppercase tracking-wide">
              Engelleyici
            </span>
          )}
        </div>
        {check.detail && (
          <p className={`text-[0.65rem] mt-0.5 leading-tight ${
            isBlockingFail ? 'text-neg' :
            check.status === 'warning' ? 'text-warn-text' :
            'text-[#64748b]'
          }`}>
            {check.detail}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PeriodCloseReadinessClient({ companyId }: { companyId: string }) {
  const { data: report, isLoading, isError } = useQuery<PeriodCloseReadinessReport>({
    queryKey:  ['period-close-readiness', companyId],
    queryFn:   fetchReport,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#e8eaef] bg-white p-4 shadow-sm">
        <div className="h-4 w-56 bg-[#f1f5f9] rounded animate-pulse mb-3" />
        <div className="h-20 w-20 rounded-full bg-[#f1f5f9] animate-pulse mb-3" />
        <div className="space-y-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-10 bg-[#f1f5f9] rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (isError || !report) {
    return (
      <div className="rounded-2xl border border-neg-light bg-neg-light/30 p-4">
        <p className="text-xs text-neg-text font-semibold">
          Dönem kapanış hazırlık raporu yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const { checks, score, readiness, is_ready, blocking_count, check_summary, current_period } = report

  return (
    <div className="rounded-2xl border border-[#e8eaef] bg-white shadow-sm overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-[#f1f5f9]">
        <div className="flex items-start justify-between gap-4">

          {/* Title + period info */}
          <div>
            <h2 className="text-sm font-bold text-[#0f172a]">Dönem Kapanış Hazırlığı</h2>
            <p className="text-[0.65rem] text-[#94a3b8] mt-0.5">
              {current_period.name
                ? `${current_period.name} · ${current_period.status}`
                : 'Aktif dönem bulunamadı'}
            </p>
          </div>

          {/* Score + readiness badge */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <ScoreRing score={score} readiness={readiness} />
            <div className="flex flex-col gap-1.5">
              <ReadinessBadge readiness={readiness} />
              {/* Close button */}
              <button
                disabled={!is_ready}
                title={
                  !is_ready
                    ? `${blocking_count} engelleyici sorun var — dönem kapatılamaz`
                    : 'Dönemi kapat'
                }
                onClick={() => alert(
                  is_ready
                    ? `"${current_period.name}" dönemi kapatılacak.\n\nBu işlem dönem durumunu "closed" olarak güncelleyecektir.`
                    : 'Engelleyici sorunlar giderilmeden dönem kapatılamaz.'
                )}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  is_ready
                    ? 'bg-[#0f172a] text-white hover:bg-[#1e293b] cursor-pointer'
                    : 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
                }`}
              >
                {is_ready
                  ? 'Kapat'
                  : `Kapat (${blocking_count} engel)`}
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.65rem] text-[#64748b]">Hazırlık Skoru</span>
            <span className="text-[0.65rem] font-bold text-[#0f172a]">{score}/100</span>
          </div>
          <div className="h-2 rounded-full bg-[#f1f5f9] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                score >= 90 ? 'bg-pos-text' :
                score >= 70 ? 'bg-info-text' :
                score >= 50 ? 'bg-warn-text' :
                'bg-neg-text'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Blocking failures — shown prominently when present ──────────────── */}
      {check_summary.blocking_failures.length > 0 && (
        <div className="px-4 py-3 border-b border-neg-light bg-neg-light/20">
          <p className="text-[0.65rem] font-bold text-neg-text mb-2 uppercase tracking-wide">
            Engelleyici Sorunlar ({check_summary.blocking_failures.length}) — Dönem kapatılamaz
          </p>
          <div className="space-y-1.5">
            {check_summary.blocking_failures.map(check => (
              <CheckRow key={check.id} check={check} />
            ))}
          </div>
        </div>
      )}

      {/* ── Full checklist ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Tüm Kontroller
          </span>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-pos-text font-semibold">
              {check_summary.passed.length} geçti
            </span>
            {check_summary.non_blocking_failures.length > 0 && (
              <span className="text-neg font-semibold">
                · {check_summary.non_blocking_failures.length} başarısız
              </span>
            )}
            {check_summary.warnings.length > 0 && (
              <span className="text-warn-text font-semibold">
                · {check_summary.warnings.length} uyarı
              </span>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          {checks.map(check => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-[#f1f5f9] bg-[#fafafa] flex items-center justify-between gap-3">
        <p className="text-[0.6rem] text-[#94a3b8]">
          {is_ready
            ? 'Tüm engelleyici kontroller geçti — dönem kapatılabilir.'
            : `${blocking_count} engelleyici sorun var — giderin ve yeniden kontrol edin.`}
        </p>
        <span className="text-[10px] text-[#94a3b8] tabular-nums">
          {checks.filter(c => c.status === 'skipped').length > 0
            ? `${checks.filter(c => c.status === 'skipped').length} kontrol atlandı`
            : null}
        </span>
      </div>

    </div>
  )
}
