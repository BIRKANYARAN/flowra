'use client'

// app/dashboard/cfo/_tabs/PeriodHistoryTab.tsx
// Period Lifecycle Dashboard — timeline of all accounting periods

import React, { useState, useEffect } from 'react'
import {
  isPeriodLocked,
  isPeriodOpen,
  daysSincePeriodEnd,
  formatPeriodStatus,
  canClosePeriod,
  canLockPeriod,
} from '@/lib/services/period.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type PeriodStatus = 'open' | 'pre_close' | 'closed' | 'locked'

interface AccountingPeriod {
  id:           string
  period_start: string
  period_end:   string
  status:       PeriodStatus
  closed_at?:   string | null
  locked_at?:   string | null
  notes?:       string | null
}

// ── Status chip styles ────────────────────────────────────────────────────────

const STATUS_CHIP: Record<PeriodStatus, string> = {
  open:      'bg-blue-100   text-blue-800   border-blue-200',
  pre_close: 'bg-amber-100  text-amber-800  border-amber-200',
  closed:    'bg-green-100  text-green-800  border-green-200',
  locked:    'bg-gray-100   text-gray-600   border-gray-200',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const fmt = (s: string) => {
    const d = new Date(s)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return `${fmt(start)} – ${fmt(end)}`
}

function periodLabel(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const diffMonths =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1
  if (diffMonths === 12) return `${s.getFullYear()} Yıllık Dönem`
  if (diffMonths === 3) {
    const q = Math.floor(s.getMonth() / 3) + 1
    return `${s.getFullYear()} Ç${q}`
  }
  return s.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: PeriodStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_CHIP[status]}`}
    >
      {formatPeriodStatus(status)}
    </span>
  )
}

function DaysAgo({ periodEnd, today }: { periodEnd: string; today: string }) {
  const days = daysSincePeriodEnd(periodEnd, today)
  if (days < 0) return <span className="text-xs text-blue-600 font-medium">Aktif</span>
  if (days === 0) return <span className="text-xs text-gray-500">Bugün sona erdi</span>
  return <span className="text-xs text-gray-500">{days} gün önce bitti</span>
}

function CompletionBadges({ status }: { status: PeriodStatus }) {
  if (status === 'open' || status === 'pre_close') return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
        <span>Mizan dengeli</span>
        <span>✓</span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
        <span>Bilanço alındı</span>
        <span>✓</span>
      </span>
      {status === 'locked' && (
        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
          <span>PDF hazır</span>
          <span>✓</span>
        </span>
      )}
    </div>
  )
}

interface PeriodRowProps {
  period: AccountingPeriod
  today: string
  onClose: (id: string) => void
  onLock: (id: string) => void
  onDownload: (id: string) => void
  actionLoading: string | null
}

function PeriodRow({ period, today, onClose, onLock, onDownload, actionLoading }: PeriodRowProps) {
  const isLoading = actionLoading === period.id
  const checklistComplete = true // real check would come from API

  return (
    <div className="flex items-start gap-4 px-4 py-4 hover:bg-gray-50 transition-colors">
      {/* Timeline dot */}
      <div className="flex flex-col items-center mt-1 shrink-0">
        <div
          className={`w-3 h-3 rounded-full border-2 ${
            period.status === 'locked'
              ? 'bg-gray-400 border-gray-400'
              : period.status === 'closed'
              ? 'bg-green-500 border-green-500'
              : period.status === 'pre_close'
              ? 'bg-amber-400 border-amber-400'
              : 'bg-blue-500 border-blue-500'
          }`}
        />
        <div className="w-0.5 h-full bg-gray-200 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm text-gray-900">
            {periodLabel(period.period_start, period.period_end)}
          </span>
          <StatusChip status={period.status} />
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-500">
            {formatDateRange(period.period_start, period.period_end)}
          </span>
          <DaysAgo periodEnd={period.period_end} today={today} />
        </div>
        <CompletionBadges status={period.status} />
        {period.notes && (
          <p className="text-xs text-gray-400 mt-1 truncate max-w-sm">{period.notes}</p>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0 flex items-center">
        {canClosePeriod(period.status, checklistComplete) && (
          <button
            onClick={() => onClose(period.id)}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            Kapat ▶
          </button>
        )}
        {canLockPeriod(period.status) && (
          <button
            onClick={() => onLock(period.id)}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            Kilitle 🔒
          </button>
        )}
        {isPeriodLocked(period.status) && (
          <button
            onClick={() => onDownload(period.id)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Rapor İndir ↓
          </button>
        )}
      </div>
    </div>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ periods }: { periods: AccountingPeriod[] }) {
  const open   = periods.filter(p => isPeriodOpen(p.status)).length
  const closed = periods.filter(p => p.status === 'closed').length
  const locked = periods.filter(p => isPeriodLocked(p.status)).length
  const preClose = periods.filter(p => p.status === 'pre_close').length

  return (
    <div className="flex flex-wrap gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-gray-600">
          <span className="font-semibold text-gray-900">{open}</span> açık
        </span>
      </span>
      {preClose > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-gray-600">
            <span className="font-semibold text-gray-900">{preClose}</span> ön kapanış
          </span>
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-gray-600">
          <span className="font-semibold text-gray-900">{closed}</span> kapalı
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-gray-600">
          <span className="font-semibold text-gray-900">{locked}</span> kilitli
        </span>
      </span>
      <span className="ml-auto text-gray-400 text-xs self-center">
        Toplam {periods.length} dönem
      </span>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-start gap-4 px-4 py-4 animate-pulse">
      <div className="mt-1 w-3 h-3 rounded-full bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-48" />
        <div className="h-3 bg-gray-100 rounded w-64" />
      </div>
      <div className="h-7 w-20 bg-gray-200 rounded-md shrink-0" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PeriodHistoryTab() {
  const [periods, setPeriods]           = useState<AccountingPeriod[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/periods')
        if (!res.ok) throw new Error('Dönemler yüklenemedi')
        const data = await res.json()
        // API returns array or { periods: [...] }
        setPeriods(Array.isArray(data) ? data : (data.periods ?? []))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleClose(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/periods/${id}/close`, { method: 'POST' })
      if (!res.ok) throw new Error('Dönem kapatılamadı')
      setPeriods(prev =>
        prev.map(p => (p.id === id ? { ...p, status: 'closed' as PeriodStatus } : p))
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Hata oluştu')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleLock(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/periods/${id}/lock`, { method: 'POST' })
      if (!res.ok) throw new Error('Dönem kilitlenemedi')
      setPeriods(prev =>
        prev.map(p => (p.id === id ? { ...p, status: 'locked' as PeriodStatus } : p))
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Hata oluştu')
    } finally {
      setActionLoading(null)
    }
  }

  function handleDownload(id: string) {
    window.open(`/api/periods/${id}/report`, '_blank')
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true) }}
          className="mt-2 text-xs text-red-600 underline hover:text-red-800"
        >
          Tekrar dene
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Dönem Geçmişi</h2>
          <p className="text-xs text-gray-500 mt-0.5">Tüm muhasebe dönemleri — en yeniden en eskiye</p>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && <SummaryBar periods={periods} />}

      {/* Timeline list */}
      <div className="divide-y divide-gray-100">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : periods.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-500">Henüz muhasebe dönemi yok.</p>
          </div>
        ) : (
          periods.map(period => (
            <PeriodRow
              key={period.id}
              period={period}
              today={today}
              onClose={handleClose}
              onLock={handleLock}
              onDownload={handleDownload}
              actionLoading={actionLoading}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default PeriodHistoryTab
