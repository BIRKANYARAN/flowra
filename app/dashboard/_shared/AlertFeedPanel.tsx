'use client'

// ─────────────────────────────────────────────────────────────────────────────
// AlertFeedPanel — Uyarı Akışı
//
// Compact notification center on the CEO Dashboard. Fetches the alert feed,
// shows last 10 unread alerts, and allows per-alert and bulk acknowledgement.
// Uses TanStack Query with a 60-second stale time.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AlertFeedReport, FeedAlert } from '@/lib/services/intelligence/alert-feed.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'az önce'
  if (minutes < 60) return `${minutes}d önce`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}s önce`
  const days = Math.floor(hours / 24)
  return `${days}g önce`
}

// ── Severity config ───────────────────────────────────────────────────────────

const SEV_CONFIG = {
  critical: {
    icon:    '🔴',
    rowCls:  'border-l-[3px] border-neg bg-neg-light/30',
    titleCls:'text-neg-text font-bold text-xs',
  },
  warning: {
    icon:    '🟡',
    rowCls:  'border-l-[3px] border-warn bg-warn-light/30',
    titleCls:'text-warn-text font-semibold text-xs',
  },
  info: {
    icon:    'ℹ️',
    rowCls:  'border-l-[3px] border-[#3b82f6] bg-[#eff6ff]/30',
    titleCls:'text-[#1d4ed8] font-medium text-xs',
  },
}

// ── AlertRow ──────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onAcknowledge,
}: {
  alert: FeedAlert
  onAcknowledge: (id: string) => void
}) {
  const cfg = SEV_CONFIG[alert.severity] ?? SEV_CONFIG.info

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded ${cfg.rowCls}`}>
      <span className="mt-0.5 text-sm shrink-0" aria-hidden="true">{cfg.icon}</span>

      <div className="flex-1 min-w-0">
        <p className={cfg.titleCls}>{alert.title}</p>
        {alert.detail && (
          <p className="text-[10px] text-[#64748b] mt-0.5 leading-tight truncate">{alert.detail}</p>
        )}
        <p className="text-[10px] text-[#94a3b8] mt-0.5">{timeAgo(alert.last_triggered_at)}</p>
      </div>

      <button
        onClick={() => onAcknowledge(alert.id)}
        title="Okundu İşaretle"
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#475569] transition-colors text-[11px] font-bold"
        aria-label="Okundu işaretle"
      >
        ×
      </button>
    </div>
  )
}

// ── AlertFeedPanel ─────────────────────────────────────────────────────────────

export function AlertFeedPanel() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery<AlertFeedReport>({
    queryKey: ['alert-feed'],
    queryFn: async () => {
      const res = await fetch('/api/alerts/feed')
      if (!res.ok) throw new Error('alert feed fetch failed')
      return res.json() as Promise<AlertFeedReport>
    },
    staleTime: 60_000,
  })

  const acknowledgeMut = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' })
      if (!res.ok) throw new Error('acknowledge failed')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alert-feed'] })
    },
  })

  const acknowledgeAllMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/alerts/acknowledge-all', { method: 'POST' })
      if (!res.ok) throw new Error('acknowledge-all failed')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alert-feed'] })
    },
  })

  const totalUnread = data?.total_unread ?? 0
  const alerts = (data?.alerts ?? []).slice(0, 10)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] font-black uppercase tracking-widest text-[#475569]">
            Uyarı Akışı
          </span>
          {totalUnread > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-neg text-white text-[10px] font-bold tabular-nums">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>

        {totalUnread > 3 && (
          <button
            onClick={() => acknowledgeAllMut.mutate()}
            disabled={acknowledgeAllMut.isPending}
            className="text-[10px] text-brand-light font-semibold hover:text-brand disabled:opacity-50 transition-colors"
          >
            {acknowledgeAllMut.isPending ? 'İşleniyor...' : 'Tümünü Okundu İşaretle'}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1 p-2">
        {isLoading && (
          <p className="text-[11px] text-[#94a3b8] text-center py-4">Yükleniyor...</p>
        )}

        {isError && (
          <p className="text-[11px] text-neg-text text-center py-4">Uyarılar yüklenemedi.</p>
        )}

        {!isLoading && !isError && alerts.length === 0 && (
          <p className="text-[11px] text-[#94a3b8] text-center py-4">
            Aktif uyarı yok
          </p>
        )}

        {alerts.map(alert => (
          <AlertRow
            key={alert.id}
            alert={alert}
            onAcknowledge={id => acknowledgeMut.mutate(id)}
          />
        ))}
      </div>

      {/* Footer stats */}
      {data && (data.unread_critical > 0 || data.unread_warning > 0) && (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[#f1f5f9] text-[10px] text-[#94a3b8]">
          {data.unread_critical > 0 && (
            <span className="text-neg-text font-semibold">{data.unread_critical} kritik</span>
          )}
          {data.unread_warning > 0 && (
            <span className="text-warn-text">{data.unread_warning} uyarı</span>
          )}
          {data.acknowledged_today > 0 && (
            <span className="ml-auto">{data.acknowledged_today} bugün okundu</span>
          )}
        </div>
      )}
    </div>
  )
}
