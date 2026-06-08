'use client'

// ── PeriodCloseChecklistClient ────────────────────────────────────────────────
//
// Enforcement checklist for period close. Shows 14 checks across 4 categories
// with readiness banner, progress bar, blocking failure summary, and a
// "Dönemi Kapat" action button.
//
// Data: fetched from GET /api/ledger/period-close-checklist
// Manual steps: confirmed via POST /api/ledger/period-close-checklist

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  PeriodCloseChecklist,
  ChecklistStep,
  ChecklistCategory,
} from '@/lib/services/ledger/period-close-checklist.service'

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchChecklist(periodId?: string): Promise<PeriodCloseChecklist> {
  const url = periodId
    ? `/api/ledger/period-close-checklist?periodId=${encodeURIComponent(periodId)}`
    : '/api/ledger/period-close-checklist'
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Checklist fetch failed: ${res.status}`)
  return res.json()
}

async function fetchPeriods(): Promise<Array<{ id: string; period_start: string; period_label: string; status: string }>> {
  // We re-use the checklist API without a period to get period metadata,
  // but for the period selector we need the period list.
  // Fall back to a simple supabase RPC — but since this is client-only, we
  // call /api/ledger/period-close-checklist and derive from the returned data.
  return []
}

async function confirmStep(
  stepId: string,
  periodId?: string,
): Promise<void> {
  const res = await fetch('/api/ledger/period-close-checklist', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ stepId, confirmed: true, periodId }),
  })
  if (!res.ok) throw new Error(`Confirm failed: ${res.status}`)
}

// ── Step icon ─────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: ChecklistStep['status'] }) {
  const map = {
    pass:    { icon: '✓', cls: 'text-pos-text bg-pos-light border-pos-light' },
    fail:    { icon: '✗', cls: 'text-neg-text bg-neg-light border-neg-light' },
    pending: { icon: '⏳', cls: 'text-warn-text bg-warn-light border-warn-light' },
    skipped: { icon: '—', cls: 'text-[#94a3b8] bg-[#f8fafc] border-[#e8eaef]' },
  } as const
  const { icon, cls } = map[status] ?? map.skipped
  return (
    <span
      className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-black shrink-0 ${cls}`}
    >
      {icon}
    </span>
  )
}

// ── Category label map ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  data_completeness:   'Veri Tamlığı',
  accounting_accuracy: 'Muhasebe Doğruluğu',
  compliance:          'Uyum',
  review:              'İnceleme & Onay',
}

const CATEGORY_ORDER: ChecklistCategory[] = [
  'data_completeness',
  'accounting_accuracy',
  'compliance',
  'review',
]

// ── Step row ──────────────────────────────────────────────────────────────────

function StepRow({
  step,
  onConfirm,
  confirming,
}: {
  step:      ChecklistStep
  onConfirm: (stepId: string) => void
  confirming: boolean
}) {
  const isBlockingFail = step.is_blocking && step.status === 'fail'
  const rowBg = isBlockingFail ? 'bg-neg-light/40 border-neg-light' : 'bg-white border-[#e8eaef]'

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${rowBg}`}>
      <StepIcon status={step.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${isBlockingFail ? 'text-neg-text' : 'text-[#0f172a]'}`}>
            {step.label}
          </span>
          {step.is_blocking && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-[#fef2f2] text-neg-text border-neg-light uppercase tracking-wide">
              Engelleyici
            </span>
          )}
          {!step.auto_checked && step.status !== 'pass' && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-[#f1f5f9] text-[#64748b] border-[#e8eaef] uppercase tracking-wide">
              Manuel
            </span>
          )}
        </div>
        {step.detail && (
          <p className="text-[0.65rem] text-[#64748b] mt-0.5 leading-tight">{step.detail}</p>
        )}
      </div>
      {!step.auto_checked && step.status === 'pending' && (
        <button
          onClick={() => onConfirm(step.id)}
          disabled={confirming}
          className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#0f172a] text-white hover:bg-[#1e293b] disabled:opacity-50 transition-colors"
        >
          {confirming ? '…' : 'Onayla'}
        </button>
      )}
    </div>
  )
}

// ── Readiness banner ──────────────────────────────────────────────────────────

function ReadinessBanner({
  readiness,
  canClose,
  onClose,
}: {
  readiness: PeriodCloseChecklist['readiness']
  canClose:  boolean
  onClose:   () => void
}) {
  if (readiness === 'ready') {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-pos-light border border-pos-light">
        <div className="flex items-center gap-2">
          <span className="text-pos-text text-base font-black">✓</span>
          <span className="text-sm font-bold text-pos-text">Dönem kapatılmaya hazır</span>
        </div>
        {canClose && (
          <button
            onClick={onClose}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-pos-text text-white hover:opacity-90 transition-opacity"
          >
            Dönemi Kapat
          </button>
        )}
      </div>
    )
  }

  if (readiness === 'blocked') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-neg-light border border-neg-light">
        <span className="text-neg-text text-base font-black">✗</span>
        <span className="text-sm font-bold text-neg-text">
          Dönemi kapatmak için engelleri giderin
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-warn-light border border-warn-light">
      <span className="text-warn-text text-base font-black">!</span>
      <span className="text-sm font-bold text-warn-text">
        Kontrol listesini tamamlayın (%80 gerekli)
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PeriodCloseChecklistClient({ companyId }: { companyId: string }) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>()
  const [, startTransition] = useTransition()
  const [confirmingStep, setConfirmingStep] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: checklist, isLoading, isError } = useQuery<PeriodCloseChecklist>({
    queryKey:  ['period-close-checklist', selectedPeriodId],
    queryFn:   () => fetchChecklist(selectedPeriodId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  // ── Handler: confirm manual step ──────────────────────────────────────────
  function handleConfirm(stepId: string) {
    setConfirmingStep(stepId)
    startTransition(async () => {
      try {
        await confirmStep(stepId, checklist?.period_id)
        await qc.invalidateQueries({ queryKey: ['period-close-checklist'] })
      } catch (err) {
        console.error('Confirm step failed:', err)
      } finally {
        setConfirmingStep(null)
      }
    })
  }

  // ── Handler: close period (visual only) ───────────────────────────────────
  function handleClosePeriod() {
    alert(
      `"${checklist?.period_label}" dönemi kapatılacak.\n\n` +
      'Bu işlem üretim ortamında dönem durumunu "closed" olarak güncelleyecektir.',
    )
  }

  // ── Loading / error states ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#e8eaef] bg-white p-4">
        <div className="h-4 w-48 bg-[#f1f5f9] rounded animate-pulse mb-3" />
        <div className="h-3 w-full bg-[#f1f5f9] rounded animate-pulse mb-2" />
        <div className="h-3 w-3/4 bg-[#f1f5f9] rounded animate-pulse" />
      </div>
    )
  }

  if (isError || !checklist) {
    return (
      <div className="rounded-2xl border border-neg-light bg-neg-light/30 p-4">
        <p className="text-xs text-neg-text font-semibold">
          Kontrol listesi yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  // ── Group steps by category ───────────────────────────────────────────────
  const grouped = CATEGORY_ORDER.reduce<Record<ChecklistCategory, ChecklistStep[]>>(
    (acc, cat) => {
      acc[cat] = checklist.steps.filter(s => s.category === cat)
      return acc
    },
    {} as Record<ChecklistCategory, ChecklistStep[]>,
  )

  const categoryPassCount = (cat: ChecklistCategory) =>
    grouped[cat].filter(s => s.status === 'pass').length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-[#e8eaef] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#f1f5f9]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-[#0f172a]">Dönem Kapanış Kontrol Listesi</h2>
            <p className="text-[0.65rem] text-[#94a3b8] mt-0.5">{checklist.period_label}</p>
          </div>
          {/* Period status chip */}
          <span className={`text-[9px] font-bold px-2 py-1 rounded-full border uppercase tracking-wide ${
            checklist.period_status === 'open'      ? 'bg-pos-light text-pos-text border-pos-light' :
            checklist.period_status === 'pre_close' ? 'bg-warn-light text-warn-text border-warn-light' :
            checklist.period_status === 'closed'    ? 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]' :
            'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]'
          }`}>
            {checklist.period_status === 'open'      ? 'Açık' :
             checklist.period_status === 'pre_close' ? 'Ön Kapanış' :
             checklist.period_status === 'closed'    ? 'Kapalı' :
             'Kilitli'}
          </span>
        </div>

        {/* Readiness banner */}
        <div className="mt-3">
          <ReadinessBanner
            readiness={checklist.readiness}
            canClose={checklist.can_close}
            onClose={handleClosePeriod}
          />
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.65rem] text-[#64748b]">Tamamlanma</span>
            <span className="text-[0.65rem] font-bold text-[#0f172a]">%{checklist.completion_pct}</span>
          </div>
          <div className="h-2 rounded-full bg-[#f1f5f9] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                checklist.completion_pct >= 80 ? 'bg-pos-text' :
                checklist.completion_pct >= 50 ? 'bg-warn-text' :
                'bg-neg-text'
              }`}
              style={{ width: `${checklist.completion_pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Category sections */}
      <div className="divide-y divide-[#f1f5f9]">
        {CATEGORY_ORDER.map(cat => {
          const catSteps = grouped[cat]
          if (catSteps.length === 0) return null
          const passCount  = categoryPassCount(cat)
          const totalCount = catSteps.length
          const allPass    = passCount === totalCount

          return (
            <div key={cat} className="px-4 py-3">
              {/* Category header */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[0.7rem] font-bold text-[#334155] uppercase tracking-wide">
                  {CATEGORY_LABELS[cat]}
                </h3>
                <span className={`text-[0.65rem] font-semibold tabular-nums ${allPass ? 'text-pos-text' : 'text-[#64748b]'}`}>
                  {passCount}/{totalCount}
                </span>
              </div>
              {/* Step rows */}
              <div className="space-y-1.5">
                {catSteps.map(step => (
                  <StepRow
                    key={step.id}
                    step={step}
                    onConfirm={handleConfirm}
                    confirming={confirmingStep === step.id}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Blocking failures summary */}
      {checklist.blocking_failures.length > 0 && (
        <div className="px-4 py-3 border-t border-neg-light bg-neg-light/20">
          <p className="text-[0.65rem] font-bold text-neg-text mb-1.5 uppercase tracking-wide">
            Engelleyici Hatalar ({checklist.blocking_failures.length})
          </p>
          <ul className="space-y-1">
            {checklist.blocking_failures.map(step => (
              <li key={step.id} className="text-[0.65rem] text-neg-text flex items-start gap-1.5">
                <span className="font-black">✗</span>
                <span>{step.label}{step.detail ? ` — ${step.detail}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer: Close button */}
      <div className="px-4 py-3 border-t border-[#f1f5f9] bg-[#fafafa] flex items-center justify-between gap-3">
        <p className="text-[0.6rem] text-[#94a3b8]">
          {checklist.can_lock
            ? 'Bu dönem kapalı — kilitlemek için dönem yönetimini kullanın.'
            : checklist.can_close
            ? 'Tüm kontroller geçti — dönem kapatılabilir.'
            : checklist.readiness === 'blocked'
            ? 'Engelleyici hatalar giderilmeden dönem kapatılamaz.'
            : 'Kontrol listesini %80 tamamlayın ve engelleyici adımları geçin.'}
        </p>
        <button
          onClick={handleClosePeriod}
          disabled={!checklist.can_close}
          title={
            !checklist.can_close
              ? checklist.readiness === 'blocked'
                ? 'Engelleyici hatalar var'
                : checklist.readiness === 'incomplete'
                ? 'Tamamlanma %80 altında'
                : 'Dönem zaten kapalı veya kilitli'
              : 'Dönemi kapat'
          }
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
            checklist.can_close
              ? 'bg-[#0f172a] text-white hover:bg-[#1e293b] cursor-pointer'
              : 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
          }`}
        >
          Dönemi Kapat
        </button>
      </div>
    </div>
  )
}
