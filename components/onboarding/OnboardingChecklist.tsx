'use client'

// ─────────────────────────────────────────────────────────────────────────────
// components/onboarding/OnboardingChecklist.tsx
//
// First-run "getting started" card. Fetches /api/onboarding/status and renders a
// progress bar + step list with deep links. Self-hiding: renders nothing once
// every step is done. Can be dismissed for the session (sessionStorage) so it
// does not nag a user mid-setup, but reappears on a fresh visit until complete.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react'

interface OnboardingStep {
  key:         string
  label:       string
  description: string
  href:        string
  done:        boolean
}

interface OnboardingStatus {
  steps:           OnboardingStep[]
  completed_count: number
  total_count:     number
  all_done:        boolean
  is_empty:        boolean
}

const DISMISS_KEY = 'flowra.onboarding.dismissed'

export function OnboardingChecklist() {
  const [status,    setStatus]    = useState<OnboardingStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true)
    }
    let cancelled = false
    fetch('/api/onboarding/status')
      .then(res => (res.ok ? res.json() : null))
      .then(body => { if (!cancelled && body) setStatus(body.status as OnboardingStatus) })
      .catch(() => { /* non-fatal: the checklist is an enhancement, never blocks the cockpit */ })
    return () => { cancelled = true }
  }, [])

  // Nothing to show: no data yet, fully set up, or dismissed this session.
  if (!status || status.all_done || dismissed) return null

  const pct = Math.round((status.completed_count / status.total_count) * 100)

  const handleDismiss = () => {
    if (typeof window !== 'undefined') sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <section
      className="bg-white border border-[#e8eaef] rounded-lg shadow-sm overflow-hidden"
      aria-label="Kuruluma başlangıç"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h2 className="text-base font-bold text-[#0f172a]">
            {status.is_empty ? "Flowra'ya hoş geldiniz 👋" : 'Kuruluma devam edin'}
          </h2>
          <p className="text-sm text-[#64748b] mt-0.5">
            {status.is_empty
              ? 'Birkaç adımda işletmenizi kurun — kokpitiniz bu verilerle canlanır.'
              : 'Birkaç adım kaldı. Tamamladıkça göstergeleriniz doğrulukla dolar.'}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-xs text-[#94a3b8] hover:text-[#475569] shrink-0 mt-1"
          aria-label="Şimdilik gizle"
        >
          Şimdilik gizle
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 mt-4">
        <div className="flex items-center justify-between text-xs text-[#64748b] mb-1.5">
          <span>{status.completed_count} / {status.total_count} adım tamamlandı</span>
          <span className="font-semibold text-[#334155]">%{pct}</span>
        </div>
        <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <ul className="mt-4 divide-y divide-[#f1f5f9]">
        {status.steps.map(step => (
          <li key={step.key}>
            <a
              href={step.href}
              className={`flex items-start gap-3 px-5 py-3 transition-colors ${
                step.done ? 'opacity-60' : 'hover:bg-[#f8fafc]'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  step.done
                    ? 'bg-emerald-500 text-white'
                    : 'border-2 border-[#e8eaef] text-transparent'
                }`}
                aria-hidden
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${step.done ? 'text-[#64748b] line-through' : 'text-[#0f172a]'}`}>
                  {step.label}
                </span>
                <span className="block text-xs text-[#94a3b8] mt-0.5">{step.description}</span>
              </span>
              {!step.done && (
                <span className="ml-auto self-center text-sm text-info-text shrink-0">→</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
