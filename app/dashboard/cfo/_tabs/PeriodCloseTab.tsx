// ── PeriodCloseTab — Period Close Workflow UI ─────────────────────────────────
//
// 4-phase wizard UI for closing an accounting period.
// Calls /api/periods/[id]/wizard to fetch current wizard state,
// /api/periods/[id]/close to close, and /api/periods/[id]/lock to lock.
// Manual steps use /api/governance/audit-readiness/acknowledge.
//
// Phases:
//   1. Veri Tamlığı (auto)
//   2. Muhasebe Doğruluğu (auto)
//   3. Uyum ve Ortaklar (auto + manual)
//   4. Nihai Onay (manual)

'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  WizardPhaseResult,
  WizardStep,
  StepStatus,
  PeriodCloseWizardState,
} from '@/lib/services/ledger/period-close-wizard.service'
import {
  allMandatoryPass,
  getBlockerMessage,
  countByStatus,
  estimateMinutesToClose,
} from '@/lib/services/ledger/period-close-wizard.service'

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<StepStatus, { label: string; className: string }> = {
  pass:    { label: 'Geçti',    className: 'bg-green-100 text-green-800 border border-green-200' },
  fail:    { label: 'Başarısız', className: 'bg-red-100 text-red-800 border border-red-200' },
  pending: { label: 'Bekliyor', className: 'bg-[#f1f5f9] text-[#475569] border border-[#e8eaef]' },
  manual:  { label: 'Manuel',   className: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
  skipped: { label: 'Atlandı',  className: 'bg-[#f1f5f9] text-[#94a3b8] border border-[#e8eaef]' },
}

const STATUS_ICON: Record<StepStatus, string> = {
  pass:    '✓',
  fail:    '✗',
  pending: '○',
  manual:  '◎',
  skipped: '—',
}

function StatusBadge({ status }: { status: StepStatus }) {
  const { label, className } = STATUS_BADGE[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-[#e8eaef] rounded-full h-2">
      <div
        className="bg-info h-2 rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  )
}

// ── Period status chip ─────────────────────────────────────────────────────────

const PERIOD_STATUS_CHIP: Record<string, { label: string; className: string }> = {
  open:      { label: 'Açık',   className: 'bg-info-light text-info-text' },
  pre_close: { label: 'Ön Kapanış', className: 'bg-orange-100 text-orange-800' },
  closed:    { label: 'Kapalı', className: 'bg-[#e8eaef] text-[#334155]' },
  locked:    { label: 'Kilitli', className: 'bg-red-100 text-red-800' },
}

function PeriodStatusChip({ status }: { status: string }) {
  const { label, className } = PERIOD_STATUS_CHIP[status] ?? { label: status, className: 'bg-[#f1f5f9] text-[#475569]' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${className}`}>
      {label}
    </span>
  )
}

// ── Step row ───────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: WizardStep
  onAcknowledge: (stepId: string) => Promise<void>
  acknowledging: string | null
}

function StepRow({ step, onAcknowledge, acknowledging }: StepRowProps) {
  const icon = STATUS_ICON[step.status]
  const iconColor: Record<StepStatus, string> = {
    pass:    'text-green-600',
    fail:    'text-red-600',
    pending: 'text-[#94a3b8]',
    manual:  'text-yellow-600',
    skipped: 'text-[#cbd5e1]',
  }

  return (
    <div className="flex items-start gap-3 py-3 border-b border-[#f1f5f9] last:border-0">
      <span className={`mt-0.5 text-lg font-bold w-5 text-center flex-shrink-0 ${iconColor[step.status]}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#0f172a]">{step.label}</span>
          <StatusBadge status={step.status} />
          <span className="text-xs text-[#94a3b8]">
            {step.is_auto ? '[Otomatik]' : '[Manuel]'}
          </span>
        </div>
        {step.detail && (
          <p className="mt-0.5 text-xs text-[#64748b] leading-relaxed">{step.detail}</p>
        )}
        {step.action_href && step.action_label && step.status === 'fail' && (
          <a
            href={step.action_href}
            className="mt-1 inline-flex items-center text-xs text-info-text hover:text-info-text underline"
          >
            {step.action_label} →
          </a>
        )}
      </div>
      <div className="flex-shrink-0">
        {!step.is_auto && step.status === 'manual' && (
          <button
            onClick={() => onAcknowledge(step.id)}
            disabled={acknowledging === step.id}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {acknowledging === step.id ? 'Kaydediliyor…' : 'Onayla'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Phase accordion ────────────────────────────────────────────────────────────

interface PhaseAccordionProps {
  phase: WizardPhaseResult
  isLocked: boolean
  onAcknowledge: (stepId: string) => Promise<void>
  acknowledging: string | null
}

function PhaseAccordion({ phase, isLocked, onAcknowledge, acknowledging }: PhaseAccordionProps) {
  const [open, setOpen] = useState(!phase.is_complete || phase.blocking_failures > 0)

  const headerColor = phase.is_complete
    ? 'bg-green-50 border-green-200'
    : phase.blocking_failures > 0
    ? 'bg-red-50 border-red-200'
    : 'bg-white border-[#e8eaef]'

  const completionLabel = `${phase.passed_steps}/${phase.total_steps} tamamlandı`

  return (
    <div className={`rounded-lg border mb-3 overflow-hidden ${isLocked ? 'opacity-50' : ''}`}>
      <button
        className={`w-full flex items-center justify-between px-4 py-3 text-left ${headerColor} transition-colors`}
        onClick={() => !isLocked && setOpen(v => !v)}
        disabled={isLocked}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-[#0f172a]">
            Faz {phase.phase}: {phase.label}
          </span>
          <span className="text-sm text-[#64748b]">({completionLabel})</span>
          {phase.is_complete && <span className="text-green-600 font-bold">✓</span>}
          {isLocked && <span className="text-[#94a3b8] text-xs ml-2">— önceki fazlar tamamlanmadan açılmaz</span>}
        </div>
        <span className="text-[#94a3b8] text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && !isLocked && (
        <div className="px-4 py-1 bg-white">
          {phase.steps.map(step => (
            <StepRow
              key={step.id}
              step={step}
              onAcknowledge={onAcknowledge}
              acknowledging={acknowledging}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  danger?: boolean
}

function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel, loading, danger }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-[#0f172a] mb-2">{title}</h3>
        <p className="text-sm text-[#475569] mb-6">{body}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-md border border-[#e8eaef] text-[#334155] hover:bg-[#f8fafc]"
          >
            Vazgeç
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-info hover:bg-info'
            }`}
          >
            {loading ? 'Lütfen bekleyin…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PeriodCloseTab() {
  const [state, setState] = useState<PeriodCloseWizardState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [acknowledging, setAcknowledging] = useState<string | null>(null)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [showLockDialog, setShowLockDialog] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const fetchWizard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const periodId = state?.period_id
      const url = periodId
        ? `/api/periods/${periodId}/wizard`
        : '/api/ledger/period-close-wizard'
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Wizard yüklenemedi (${res.status})`)
      const data: PeriodCloseWizardState = await res.json()
      setState(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [state?.period_id])

  useEffect(() => {
    // Initial load — no dependency on state.period_id yet
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/ledger/period-close-wizard')
        if (!res.ok) throw new Error(`Wizard yüklenemedi (${res.status})`)
        const data: PeriodCloseWizardState = await res.json()
        setState(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Bilinmeyen hata')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAcknowledge = async (stepId: string) => {
    if (!state) return
    setAcknowledging(stepId)
    setActionError(null)
    try {
      const res = await fetch('/api/governance/audit-readiness/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_id: stepId, period_id: state.period_id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Onay kaydedilemedi (${res.status})`)
      }
      await fetchWizard()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Onay sırasında hata oluştu')
    } finally {
      setAcknowledging(null)
    }
  }

  const handleClose = async () => {
    if (!state) return
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/periods/${state.period_id}/close`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Dönem kapatılamadı (${res.status})`)
      setActionSuccess('Dönem başarıyla kapatıldı.')
      setShowCloseDialog(false)
      await fetchWizard()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Dönem kapatılırken hata')
    } finally {
      setActionLoading(false)
    }
  }

  const handleLock = async () => {
    if (!state) return
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/periods/${state.period_id}/lock`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Dönem kilitlenemedi (${res.status})`)
      setActionSuccess('Dönem başarıyla kilitlendi.')
      setShowLockDialog(false)
      await fetchWizard()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Dönem kilitlenirken hata')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const allSteps = state?.phases.flatMap(p => p.steps) ?? []
  const mandatory = allMandatoryPass(allSteps)
  const blockerMsg = getBlockerMessage(allSteps)
  const counts = countByStatus(allSteps)
  const estMin = estimateMinutesToClose(allSteps)
  const canClose = state?.can_close && mandatory
  const canLock = state?.period_status === 'closed'
  const isLocked = state?.period_status === 'locked'

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading && !state) {
    return (
      <div className="flex items-center justify-center py-20 text-[#64748b] text-sm">
        Wizard yükleniyor…
      </div>
    )
  }

  if (error && !state) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-red-600 text-sm">{error}</p>
        <button
          onClick={fetchWizard}
          className="px-4 py-2 text-sm rounded-md bg-info text-white hover:bg-info"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Period header ─────────────────────────────────────────────────────── */}
      {state && (
        <div className="bg-white rounded-xl border border-[#e8eaef] p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-[#0f172a]">
                {state.period_label}
              </h2>
              <PeriodStatusChip status={state.period_status} />
            </div>
            <div className="flex items-center gap-3 text-sm text-[#64748b]">
              <span>{counts.pass} geçti</span>
              <span>·</span>
              <span>{counts.fail} başarısız</span>
              <span>·</span>
              <span>{counts.pending} bekliyor</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <ProgressBar pct={state.overall_pct} />
            </div>
            <span className="text-sm font-semibold text-[#334155] whitespace-nowrap">
              %{state.overall_pct}
            </span>
            {estMin > 0 && (
              <span className="text-sm text-[#64748b] whitespace-nowrap">
                · Tahmini {estMin} dk kaldı
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Phase accordions ──────────────────────────────────────────────────── */}
      {state && (
        <div>
          {state.phases.map((phase, idx) => {
            // Phase 4 is locked if phases 1–3 not all complete
            const prevPhasesComplete = state.phases
              .slice(0, idx)
              .every(p => p.is_complete)
            const isPhase4Locked = phase.phase === 4 && !prevPhasesComplete

            return (
              <PhaseAccordion
                key={phase.phase}
                phase={phase}
                isLocked={isPhase4Locked}
                onAcknowledge={handleAcknowledge}
                acknowledging={acknowledging}
              />
            )
          })}
        </div>
      )}

      {/* ── Action bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#e8eaef] p-5">
        {actionError && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
            {actionSuccess}
          </div>
        )}
        {blockerMsg && !isLocked && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
            {blockerMsg}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={fetchWizard}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-md border border-[#e8eaef] text-[#334155] hover:bg-[#f8fafc] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Yükleniyor…' : 'Kontrolleri Yenile'}
          </button>

          {state?.period_status !== 'closed' && state?.period_status !== 'locked' && (
            <button
              onClick={() => setShowCloseDialog(true)}
              disabled={!canClose || isLocked}
              title={blockerMsg ?? undefined}
              className="px-4 py-2 text-sm font-medium rounded-md bg-info text-white hover:bg-info disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Dönemi Kapat ▶
            </button>
          )}

          {canLock && (
            <button
              onClick={() => setShowLockDialog(true)}
              className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Dönemi Kilitle 🔒
            </button>
          )}

          {isLocked && (
            <span className="text-sm text-[#94a3b8] italic">Bu dönem kilitlidir — değişiklik yapılamaz.</span>
          )}
        </div>

        {/* Cross-navigation links */}
        <div className="mt-4 pt-4 border-t border-[#f1f5f9] flex gap-4 flex-wrap text-sm">
          <a href="/dashboard/cfo/trial-balance" className="text-info-text hover:underline">
            Mizan →
          </a>
          <a href="/dashboard/cfo/bank-reconciliation" className="text-info-text hover:underline">
            Banka Mutabakatı →
          </a>
          <a href="/dashboard/cfo/journal-entries" className="text-info-text hover:underline">
            Journal Kayıtları →
          </a>
        </div>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}
      {showCloseDialog && (
        <ConfirmDialog
          title="Dönemi Kapat"
          body={`${state?.period_label} dönemini kapatmak istediğinizden emin misiniz? Dönem kapatıldıktan sonra yalnızca düzeltme girişleri yapılabilir.`}
          confirmLabel="Evet, Kapat"
          onConfirm={handleClose}
          onCancel={() => setShowCloseDialog(false)}
          loading={actionLoading}
        />
      )}
      {showLockDialog && (
        <ConfirmDialog
          title="Dönemi Kilitle"
          body={`${state?.period_label} dönemini kilitlemek istediğinizden emin misiniz? Kilitli dönemde hiçbir değişiklik yapılamaz.`}
          confirmLabel="Evet, Kilitle"
          onConfirm={handleLock}
          onCancel={() => setShowLockDialog(false)}
          loading={actionLoading}
          danger
        />
      )}
    </div>
  )
}
