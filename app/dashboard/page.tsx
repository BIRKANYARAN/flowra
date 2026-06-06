'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra home — role-tailored, no-scroll cockpit.
//
// One fetch to /api/dashboard/home powers three lenses (Yönetici / Finans / Satış);
// switching between them is instant (no refetch). The default lens follows the
// caller's member role. The whole view fits one screen on desktop.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CeoDashboard } from '@/components/dashboard/views/CeoDashboard'
import { CfoDashboard } from '@/components/dashboard/views/CfoDashboard'
import { SalesDashboard } from '@/components/dashboard/views/SalesDashboard'
import {
  HomePayload, Lens, LensSwitcher, StatusBadge,
} from '@/components/dashboard/views/shared'

const LENS_KEY = 'flowra.dashboard.lens'
const TITLE: Record<Lens, string> = { ceo: 'Yönetici Kokpiti', cfo: 'Finans Kokpiti', sales: 'Satış Kokpiti' }

function defaultLens(role: HomePayload['role']): Lens {
  if (role === 'manager') return 'sales'
  return 'ceo'
}

export default function HomePage() {
  const [data,    setData]    = useState<HomePayload | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lens,    setLens]    = useState<Lens | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    fetch('/api/dashboard/home')
      .then(async res => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<HomePayload>
      })
      .then(payload => {
        if (cancelled) return
        setData(payload)
        // Restore saved lens, else derive from role.
        const saved = typeof window !== 'undefined' ? (localStorage.getItem(LENS_KEY) as Lens | null) : null
        setLens(saved && ['ceo', 'cfo', 'sales'].includes(saved) ? saved : defaultLens(payload.role))
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function changeLens(l: Lens) {
    setLens(l)
    if (typeof window !== 'undefined') localStorage.setItem(LENS_KEY, l)
  }

  if (loading) return <CockpitSkeleton />

  if (error || !data || !lens) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-8 text-center max-w-md">
          <p className="text-red-600 font-semibold mb-2">Kontrol paneli yüklenemedi</p>
          <p className="text-[#64748b] text-sm">{error ?? 'Bilinmeyen hata'}</p>
          <button className="mt-4 text-sm text-[#7c3aed] font-semibold hover:underline" onClick={() => window.location.reload()}>
            Yeniden Dene
          </button>
        </div>
      </div>
    )
  }

  const computedAt = new Date(data.summary.computed_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="space-y-3">
      <OnboardingChecklist />
      <DashboardShell
        title={TITLE[lens]}
        subtitle={computedAt}
        badge={<StatusBadge status={data.summary.situation.status} />}
        actions={<LensSwitcher value={lens} onChange={changeLens} />}
      >
        {lens === 'ceo'   && <CeoDashboard   data={data} />}
        {lens === 'cfo'   && <CfoDashboard   data={data} />}
        {lens === 'sales' && <SalesDashboard data={data} />}
      </DashboardShell>
    </div>
  )
}

// ── Skeleton ────────────────────────────────────────────────────────────────────

function CockpitSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-7 w-56 bg-[#e2e8f0] rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-white border border-[#e2e8f0] rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 h-72 bg-white border border-[#e2e8f0] rounded-xl" />
        <div className="h-72 bg-white border border-[#e2e8f0] rounded-xl" />
      </div>
    </div>
  )
}
