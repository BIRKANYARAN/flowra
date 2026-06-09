'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// AuditHashChainPanel — Audit Log Hash Chain Integrity Status
//
// Displays the tamper-evidence status for the company audit log chain.
// Uses /api/ledger/audit-chain-status to fetch chain health.
// ═══════════════════════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query'
import { cn }       from '@/components/ui'
import type { AuditChainStatus } from '@/lib/services/ledger/audit-hash-chain.service'

interface AuditHashChainPanelProps {
  /** Used only as TanStack Query cache key discriminator. The API resolves companyId from the session. */
  companyId?: string
}

// ── Health badge config ────────────────────────────────────────────────────────

interface HealthConfig {
  label: string
  icon: string
  badgeClass: string
  containerClass: string
}

const HEALTH_CONFIG: Record<AuditChainStatus['health'], HealthConfig> = {
  valid: {
    label:          'Denetim Zinciri Geçerli',
    icon:           '✓',
    badgeClass:     'bg-green-100 text-green-800 border-green-300',
    containerClass: 'border-green-200 bg-green-50',
  },
  broken: {
    label:          'Zincir Bozulması Tespit Edildi',
    icon:           '⚠',
    badgeClass:     'bg-red-100 text-red-800 border-red-300',
    containerClass: 'border-red-200 bg-red-50',
  },
  empty: {
    label:          'Denetim Kaydı Yok',
    icon:           '○',
    badgeClass:     'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]',
    containerClass: 'border-[#e8eaef] bg-[#f8fafc]',
  },
  unhashed: {
    label:          'Hash Sütunları Mevcut Değil — Pasif İzleme',
    icon:           '!',
    badgeClass:     'bg-yellow-100 text-yellow-800 border-yellow-300',
    containerClass: 'border-yellow-200 bg-yellow-50',
  },
  no_hash_columns: {
    label:          'Hash altyapısı henüz kurulmamış',
    icon:           'i',
    badgeClass:     'bg-info-light text-info-text border-info-light',
    containerClass: 'border-info-light bg-info-light',
  },
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AuditHashChainPanel({ companyId = 'default' }: AuditHashChainPanelProps) {
  const { data, isLoading, isError, refetch } = useQuery<AuditChainStatus>({
    queryKey: ['audit-chain-status', companyId],
    queryFn: async () => {
      const res = await fetch('/api/ledger/audit-chain-status')
      if (!res.ok) throw new Error('Zincir durumu alınamadı')
      return res.json()
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return (
      <div className="border border-[#e8eaef] rounded-xl p-4 bg-white animate-pulse">
        <div className="h-4 w-48 bg-[#e8eaef] rounded mb-3" />
        <div className="h-10 w-full bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="border border-red-200 rounded-xl p-4 bg-red-50">
        <p className="text-sm text-red-600 font-medium">Zincir durumu yüklenemedi.</p>
        <button
          onClick={() => refetch()}
          className="text-xs text-brand hover:underline mt-1"
        >
          Tekrar dene
        </button>
      </div>
    )
  }

  const cfg = HEALTH_CONFIG[data.health]

  return (
    <div className={cn('border rounded-xl p-4 space-y-4', cfg.containerClass)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0f172a]">Denetim Zinciri Bütünlüğü</h3>
          <p className="text-xs text-[#64748b] mt-0.5">
            SHA-256 hash zinciri ile kurcalama tespiti
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-[11px] text-[#94a3b8] hover:text-[#475569] transition-colors shrink-0"
          title="Yenile"
        >
          ↻ Yenile
        </button>
      </div>

      {/* Health badge */}
      <div className={cn(
        'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border font-semibold text-sm',
        cfg.badgeClass,
      )}>
        <span className="text-base font-bold w-5 text-center">{cfg.icon}</span>
        <span>{cfg.label}</span>
        {data.health === 'broken' && data.broken_at_id && (
          <span className="font-mono text-xs opacity-75 ml-1">
            — {data.broken_at_id}
          </span>
        )}
      </div>

      {/* Broken entry highlight */}
      {data.health === 'broken' && data.broken_at_id && (
        <div className="bg-red-100 border border-red-300 rounded-lg px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-red-800">Zincir Kopma Noktası</p>
          <p className="text-xs font-mono text-red-700 break-all">{data.broken_at_id}</p>
          <p className="text-[11px] text-red-600">
            Bu girişten itibaren denetim kaydı değiştirilmiş olabilir.
          </p>
        </div>
      )}

      {/* Stats */}
      {(data.entries_count > 0) && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            label="Toplam Kayıt"
            value={data.entries_count}
          />
          <StatTile
            label="Doğrulanan"
            value={data.verified_entries ?? '—'}
            accent={
              data.health === 'valid'  ? 'green' :
              data.health === 'broken' ? 'red'   : undefined
            }
          />
          <StatTile
            label="Doğrulama %"
            value={data.verification_pct != null ? `${data.verification_pct}%` : '—'}
            accent={
              data.verification_pct != null && data.verification_pct >= 100 ? 'green' :
              data.verification_pct != null && data.verification_pct < 100  ? 'amber' : undefined
            }
          />
        </div>
      )}

      {/* Last hash */}
      {data.last_hash && (
        <div className="border border-[#e8eaef] rounded-lg px-3 py-2 bg-white">
          <p className="text-[11px] text-[#64748b] uppercase tracking-wide mb-0.5">Son Zincir Hash</p>
          <p className="text-xs font-mono text-[#334155]">
            {data.last_hash.slice(0, 16)}…
          </p>
        </div>
      )}

      {/* Message (no_hash_columns / other) */}
      {data.message && (
        <p className="text-xs text-[#64748b] italic">{data.message}</p>
      )}
    </div>
  )
}

// ── StatTile ──────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: 'green' | 'amber' | 'red'
}) {
  return (
    <div className="border border-[#e8eaef] rounded-lg p-2.5 bg-white text-center">
      <p className="text-[10px] text-[#64748b] uppercase tracking-wide">{label}</p>
      <p className={cn(
        'text-lg font-bold mt-0.5',
        accent === 'green' ? 'text-green-700' :
        accent === 'amber' ? 'text-amber-600' :
        accent === 'red'   ? 'text-red-600'   :
                             'text-[#1e293b]',
      )}>
        {value}
      </p>
    </div>
  )
}
