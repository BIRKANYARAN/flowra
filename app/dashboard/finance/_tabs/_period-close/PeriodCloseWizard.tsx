'use client'

// ── PeriodCloseWizard — Guided 4-phase period close wizard ───────────────────
//
// Fetches wizard state from GET /api/ledger/period-close-wizard and renders
// a step-by-step guided UI for CFOs.
//
// Phases:
//   1. Veri        — Data Completeness (auto-checks)
//   2. Muhasebe    — Accounting Accuracy (auto-checks)
//   3. Uyum        — Partner & Compliance (auto + manual)
//   4. Onay        — Final Review (manual CFO sign-off)

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  PeriodCloseWizardState,
  WizardPhaseResult,
  WizardStep,
  WizardPhase,
} from '@/lib/services/ledger/period-close-wizard.service'

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchWizardState(periodId?: string): Promise<PeriodCloseWizardState> {
  const url = periodId
    ? `/api/ledger/period-close-wizard?period_id=${encodeURIComponent(periodId)}`
    : '/api/ledger/period-close-wizard'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wizard state fetch failed: ${res.status}`)
  return res.json()
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: WizardStep['status'] }) {
  const map: Record<WizardStep['status'], { icon: string; cls: string }> = {
    pass:    { icon: '✓', cls: 'text-pos-text bg-pos-light border-pos-light' },
    fail:    { icon: '✗', cls: 'text-neg-text bg-neg-light border-neg-light' },
    pending: { icon: '○', cls: 'text-warn-text bg-warn-light border-warn-light' },
    manual:  { icon: '✎', cls: 'text-[#64748b] bg-[#f1f5f9] border-[#e8eaef]' },
    skipped: { icon: '—', cls: 'text-[#94a3b8] bg-[#f8fafc] border-[#e8eaef]' },
  }
  const { icon, cls } = map[status]
  return (
    <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-black shrink-0 ${cls}`}>
      {icon}
    </span>
  )
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: WizardStep['status'] }) {
  const map: Record<WizardStep['status'], { label: string; cls: string }> = {
    pass:    { label: 'Tamamlandı',  cls: 'bg-pos-light text-pos-text border-pos-light' },
    fail:    { label: 'Başarısız',   cls: 'bg-neg-light text-neg-text border-neg-light' },
    pending: { label: 'Bekliyor',    cls: 'bg-warn-light text-warn-text border-warn-light' },
    manual:  { label: 'Manuel Onay', cls: 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]' },
    skipped: { label: 'Atlandı',     cls: 'bg-[#f8fafc] text-[#94a3b8] border-[#e8eaef]' },
  }
  const { label, cls } = map[status]
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>
  )
}

// ── Individual step row ───────────────────────────────────────────────────────

interface StepRowProps {
  step: WizardStep
  onMarkManual: (stepId: string) => void
  isMarkingManual: boolean
}

function StepRow({ step, onMarkManual, isMarkingManual }: StepRowProps) {
  const isFail   = step.status === 'fail'
  const isManual = step.status === 'manual'

  return (
    <div className={`rounded px-3 py-2.5 border flex items-start gap-3 ${
      isFail
        ? 'bg-neg-light border-neg-light'
        : step.status === 'pass'
        ? 'bg-pos-light/40 border-[#e8eaef]'
        : 'bg-white border-[#e8eaef]'
    }`}>
      <StepIcon status={step.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${
            isFail ? 'text-neg-text' : 'text-[#0f172a]'
          }`}>
            {step.label}
          </span>
          <StatusChip status={step.status} />
          {step.is_blocking && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[#f1f5f9] text-[#94a3b8] border border-[#e8eaef]">
              Zorunlu
            </span>
          )}
        </div>
        {step.detail && (
          <div className={`text-[11px] mt-0.5 ${isFail ? 'text-neg' : 'text-[#64748b]'}`}>
            {step.detail}
          </div>
        )}
        {/* Actions */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {isFail && step.action_href && step.action_label && (
            <a
              href={step.action_href}
              className="text-[11px] font-bold text-neg-text underline underline-offset-2 hover:text-neg"
            >
              {step.action_label} →
            </a>
          )}
          {isManual && (
            <button
              onClick={() => onMarkManual(step.id)}
              disabled={isMarkingManual}
              className="text-[11px] font-bold px-2 py-1 rounded bg-[#1e293b] text-white hover:bg-[#334155] disabled:opacity-50 transition-colors"
            >
              {isMarkingManual ? 'Kaydediliyor…' : 'Tamamlandı olarak işaretle'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Phase tab button ──────────────────────────────────────────────────────────

interface PhaseTabProps {
  phase: WizardPhaseResult
  isCurrent: boolean
  onClick: () => void
}

function PhaseTab({ phase, isCurrent, onClick }: PhaseTabProps) {
  const isComplete = phase.is_complete

  const cls = isComplete
    ? 'border-pos-light bg-pos-light text-pos-text'
    : isCurrent
    ? 'border-brand bg-brand-subtle text-brand font-bold'
    : 'border-[#e8eaef] bg-[#f8fafc] text-[#94a3b8]'

  const labels: Record<WizardPhase, string> = {
    1: '1. Veri',
    2: '2. Muhasebe',
    3: '3. Uyum',
    4: '4. Onay',
  }

  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded border text-xs font-semibold transition-colors ${cls}`}
    >
      <div className="flex items-center justify-center gap-1.5">
        {isComplete && <span className="text-pos-text">✓</span>}
        {labels[phase.phase]}
      </div>
      <div className="text-[10px] font-normal mt-0.5 opacity-70">
        {phase.passed_steps}/{phase.total_steps}
      </div>
    </button>
  )
}

// ── Main wizard component ─────────────────────────────────────────────────────

interface Props {
  periodId?: string
}

export function PeriodCloseWizard({ periodId }: Props) {
  const queryClient = useQueryClient()
  const [activePhase, setActivePhase] = useState<WizardPhase>(1)
  const [manualSteps, setManualSteps] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [isClosing, setIsClosing] = useState(false)
  const [closeNote, setCloseNote] = useState('')
  const [cfoSignOff, setCfoSignOff] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [closeSuccess, setCloseSuccess] = useState(false)

  const { data: state, isLoading, error } = useQuery({
    queryKey: ['period-close-wizard', periodId],
    queryFn:  () => fetchWizardState(periodId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // Override manual step states from local optimistic updates
  function getEffectiveSteps(phase: WizardPhaseResult): WizardStep[] {
    return phase.steps.map(step => {
      if (manualSteps.has(step.id) && (step.status === 'manual' || step.status === 'pending')) {
        return { ...step, status: 'pass' as const }
      }
      return step
    })
  }

  function handleMarkManual(stepId: string) {
    startTransition(() => {
      setManualSteps(prev => new Set([...prev, stepId]))
      // Invalidate to refresh server state
      queryClient.invalidateQueries({ queryKey: ['period-close-wizard'] })
    })
  }

  async function handlePeriodClose() {
    if (!state || !cfoSignOff) return
    setIsClosing(true)
    setCloseError(null)
    try {
      const res = await fetch('/api/ledger/period-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: state.period_id,
          notes:     closeNote,
          cfo_signoff: true,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setCloseSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['period-close-wizard'] })
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : 'Bilinmeyen hata')
    } finally {
      setIsClosing(false)
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-4">
          Dönem Kapanış Sihirbazı
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-xs text-[#94a3b8] animate-pulse">Wizard durumu yükleniyor…</div>
        </div>
      </div>
    )
  }

  if (error || !state) {
    return (
      <div className="bg-neg-light border border-neg-light rounded p-4">
        <div className="text-xs font-bold text-neg-text mb-1">Wizard yüklenemedi</div>
        <div className="text-[11px] text-neg">
          {error instanceof Error ? error.message : 'Bilinmeyen hata — lütfen sayfayı yenileyin.'}
        </div>
      </div>
    )
  }

  const currentPhaseData = state.phases.find(p => p.phase === activePhase) ?? state.phases[0]
  const effectiveSteps   = getEffectiveSteps(currentPhaseData)

  // Compute effective phase completion with local overrides
  const effectiveComplete = effectiveSteps
    .filter(s => s.is_blocking)
    .every(s => s.status === 'pass')

  // Check if all phases 1-3 are effectively complete (considering local overrides)
  const effectiveCanClose = state.phases.slice(0, 3).every(phase => {
    const steps = getEffectiveSteps(phase)
    return steps.filter(s => s.is_blocking).every(s => s.status === 'pass')
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8eaef] flex items-center justify-between">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Dönem Kapanış Sihirbazı
          </div>
          <div className="text-xs font-semibold text-[#0f172a] mt-0.5">
            {state.period_label}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
            state.period_status === 'locked' ? 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]' :
            state.period_status === 'closed' ? 'bg-info-light text-info-text border-info-light' :
            'bg-warn-light text-warn-text border-warn-light'
          }`}>
            {state.period_status === 'locked' ? 'KİLİTLİ'
            : state.period_status === 'closed' ? 'KAPALI'
            : 'AKTİF'}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-[#334155]">
            {state.overall_pct}% tamamlandı
          </span>
          <span className="text-[10px] text-[#94a3b8]">
            {state.phases.reduce((s, p) => s + p.passed_steps, 0)} /
            {state.phases.reduce((s, p) => s + p.total_steps, 0)} adım
          </span>
        </div>
        <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-pos transition-all duration-500"
            style={{ width: `${state.overall_pct}%` }}
          />
        </div>
      </div>

      {/* Phase tabs */}
      <div className="px-4 py-2.5 border-b border-[#e8eaef]">
        <div className="grid grid-cols-4 gap-2">
          {state.phases.map(phase => (
            <PhaseTab
              key={phase.phase}
              phase={{
                ...phase,
                is_complete: phase.phase < 4
                  ? getEffectiveSteps(phase).filter(s => s.is_blocking).every(s => s.status === 'pass')
                  : phase.is_complete,
              }}
              isCurrent={activePhase === phase.phase}
              onClick={() => setActivePhase(phase.phase)}
            />
          ))}
        </div>
      </div>

      {/* Active phase content */}
      <div className="p-4">

        {/* Phase title */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs font-black text-[#0f172a]">{currentPhaseData.label}</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">
              {currentPhaseData.blocking_failures > 0
                ? `${currentPhaseData.blocking_failures} zorunlu adım başarısız`
                : effectiveComplete
                ? 'Bu aşama tamamlandı'
                : 'Adımları tamamlayın'}
            </div>
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
            effectiveComplete
              ? 'bg-pos-light text-pos-text border-pos-light'
              : 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]'
          }`}>
            {effectiveComplete ? '✓ Hazır' : `${currentPhaseData.passed_steps}/${currentPhaseData.total_steps}`}
          </span>
        </div>

        {/* Phase 4: Special final review UI */}
        {activePhase === 4 ? (
          <div className="space-y-3">

            {/* Normal steps (cfo_signoff displayed below) */}
            {effectiveSteps.filter(s => s.id !== 'cfo_signoff').map(step => (
              <StepRow
                key={step.id}
                step={step}
                onMarkManual={handleMarkManual}
                isMarkingManual={isPending}
              />
            ))}

            {closeSuccess ? (
              <div className="rounded px-4 py-3 bg-pos-light border border-pos-light text-pos-text text-xs font-semibold text-center">
                ✓ Dönem başarıyla kapatıldı!
              </div>
            ) : (
              <div className="rounded border border-[#e8eaef] p-4 space-y-3">
                <div className="text-xs font-black text-[#0f172a]">Nihai Onay</div>

                {/* Close note */}
                <div>
                  <label className="text-[11px] font-semibold text-[#334155] block mb-1">
                    Kapanış notu (opsiyonel)
                  </label>
                  <textarea
                    value={closeNote}
                    onChange={e => setCloseNote(e.target.value)}
                    placeholder="Bu dönem hakkında notlarınızı buraya girin…"
                    rows={3}
                    className="w-full text-xs border border-[#e8eaef] rounded px-3 py-2 text-[#334155] placeholder-[#94a3b8] focus:outline-none focus:border-brand resize-none"
                  />
                </div>

                {/* CFO sign-off checkbox */}
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfoSignOff}
                    onChange={e => setCfoSignOff(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#e8eaef] accent-[#1e293b]"
                  />
                  <span className="text-xs text-[#334155]">
                    <strong>Dönemi kapatmak istediğinizi onaylıyor musunuz?</strong>
                    {' '}Bu işlem geri alınamaz. Dönem kapandığında yeni kayıt girilemez.
                  </span>
                </label>

                {closeError && (
                  <div className="rounded px-3 py-2 bg-neg-light border border-neg-light text-neg-text text-xs">
                    <strong>Hata:</strong> {closeError}
                  </div>
                )}

                {/* Close button */}
                <button
                  onClick={handlePeriodClose}
                  disabled={!cfoSignOff || !effectiveCanClose || isClosing}
                  className="w-full px-4 py-2.5 rounded bg-neg text-white text-xs font-black hover:bg-neg-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isClosing
                    ? 'Kapatılıyor…'
                    : !effectiveCanClose
                    ? 'Önceki aşamaları tamamlayın'
                    : !cfoSignOff
                    ? 'Onay kutucuğunu işaretleyin'
                    : 'Dönemi Kapat'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Normal phase steps */
          <div className="space-y-2">
            {effectiveSteps.map(step => (
              <StepRow
                key={step.id}
                step={step}
                onMarkManual={handleMarkManual}
                isMarkingManual={isPending}
              />
            ))}
          </div>
        )}

        {/* Footer navigation */}
        {activePhase !== 4 && (
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-[#f1f5f9]">
            <button
              onClick={() => setActivePhase(p => Math.max(1, p - 1) as WizardPhase)}
              disabled={activePhase === 1}
              className="text-xs font-semibold text-[#64748b] hover:text-[#334155] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Geri
            </button>
            <button
              onClick={() => setActivePhase(p => Math.min(4, p + 1) as WizardPhase)}
              disabled={!effectiveComplete}
              className={`text-xs font-bold px-4 py-2 rounded transition-colors ${
                effectiveComplete
                  ? 'bg-[#1e293b] text-white hover:bg-[#334155]'
                  : 'bg-[#f1f5f9] text-[#94a3b8] cursor-not-allowed'
              }`}
            >
              {effectiveComplete ? 'İleri →' : 'Aşamayı tamamlayın'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
