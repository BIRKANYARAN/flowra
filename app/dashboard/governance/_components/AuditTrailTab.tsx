'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// AuditTrailTab — Governance & Audit Trail Dashboard
//
// Renders:
//   - Governance health score with 4-component breakdown
//   - Pending workflows alert
//   - Two sub-tabs: İş Akışları (workflow log) / Denetim İzi (audit log)
//   - Resolution rate statistics
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/components/ui'
import type { GovernanceReport, WorkflowOutcome } from '@/lib/services/intelligence/governance.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtTRY(n: number) {
  return `₺${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`
}

// ── Score colour ───────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800 border-green-200'
  if (score >= 60) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-red-100 text-red-800 border-red-200'
}

function scoreBarColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0
  if (pct >= 0.8) return 'bg-green-500'
  if (pct >= 0.5) return 'bg-amber-500'
  return 'bg-red-500'
}

// ── Workflow status badge ──────────────────────────────────────────────────────

const WORKFLOW_STATUS_STYLES: Record<WorkflowOutcome, string> = {
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  expired:  'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]',
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  executed: 'bg-info-light text-info-text border-info-light',
}

const WORKFLOW_STATUS_LABELS: Record<WorkflowOutcome, string> = {
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  expired:  'Süre Doldu',
  pending:  'Bekliyor',
  executed: 'Yürütüldü',
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AuditTrailTab() {
  const [activeSubTab, setActiveSubTab] = useState<'workflows' | 'audit'>('workflows')

  const { data, isLoading, isError, refetch } = useQuery<{ report: GovernanceReport }>({
    queryKey: ['governance-audit-trail'],
    queryFn: async () => {
      const res = await fetch('/api/governance/audit-trail?limit=100')
      if (!res.ok) throw new Error('Denetim izleri alınamadı')
      return res.json()
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-[#94a3b8]">Yükleniyor…</div>
  }

  if (isError || !data?.report) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-sm text-red-600">Denetim verileri yüklenemedi.</p>
        <button
          onClick={() => refetch()}
          className="text-xs text-brand hover:underline"
        >
          Tekrar dene
        </button>
      </div>
    )
  }

  const r = data.report

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#0f172a]">Yönetişim &amp; Denetim</h2>
          <p className="text-xs text-[#64748b] mt-0.5">
            İş akışı kararları, yüksek değerli aksiyonlar ve uyum sağlığı
          </p>
        </div>
        {/* Score chip */}
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-semibold text-sm shrink-0',
          scoreColor(r.governance_score),
        )}>
          <span className="text-lg font-bold">{r.governance_score}</span>
          <span className="text-xs font-medium">/100</span>
        </div>
      </div>

      {/* ── Score Breakdown ── */}
      <div className="border border-[#e8eaef] rounded-xl p-4 bg-white space-y-3">
        <h3 className="text-xs font-semibold text-[#475569] uppercase tracking-wider">
          Sağlık Skoru Dağılımı
        </h3>
        <ScoreBar
          label="Çözüm Oranı"
          score={r.score_breakdown.resolution_rate}
          max={40}
          hint={`${r.resolution_rate_pct}% çözüldü`}
        />
        <ScoreBar
          label="Gecikmiş Onay Yok"
          score={r.score_breakdown.no_stale}
          max={30}
          hint={r.stale_pending_count === 0 ? 'Tümü zamanında' : `${r.stale_pending_count} gecikmiş`}
        />
        <ScoreBar
          label="Dönem Kapanış Zamanı"
          score={r.score_breakdown.period_close}
          max={20}
          hint={r.score_breakdown.period_close === 20 ? 'Zamanında kapatıldı' : 'Veri yok'}
        />
        <ScoreBar
          label="Denetim İzi Mevcut"
          score={r.score_breakdown.audit_trail}
          max={10}
          hint={r.audit_log.length > 0 ? `${r.audit_log.length} kayıt` : 'Kayıt yok'}
        />
      </div>

      {/* ── Stale pending alert ── */}
      {r.stale_pending_count > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-amber-600 text-base mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-800">
              {r.stale_pending_count} onay bekleyen işlem 3 günden uzun süre duruyor
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Bu işlemlerin onaylanması veya reddedilmesi yönetişim sağlığını artıracaktır.
            </p>
          </div>
        </div>
      )}

      {/* ── Resolution stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Toplam İş Akışı" value={r.total_workflows} />
        <StatCard label="Çözümlendi" value={r.resolved_count} accent="green" />
        <StatCard label="Bekliyor" value={r.pending_count} accent={r.pending_count > 0 ? 'amber' : undefined} />
        <StatCard
          label="Ort. Çözüm Süresi"
          value={r.avg_resolution_days != null ? `${r.avg_resolution_days}g` : '—'}
        />
      </div>

      {/* ── Sub-tabs ── */}
      <div>
        <div className="flex gap-1 border-b border-[#e8eaef] mb-4">
          <SubTabButton
            active={activeSubTab === 'workflows'}
            onClick={() => setActiveSubTab('workflows')}
          >
            İş Akışları
            {r.pending_count > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {r.pending_count}
              </span>
            )}
          </SubTabButton>
          <SubTabButton
            active={activeSubTab === 'audit'}
            onClick={() => setActiveSubTab('audit')}
          >
            Denetim İzi
          </SubTabButton>
        </div>

        {activeSubTab === 'workflows' && <WorkflowTable rows={r.workflow_log} />}
        {activeSubTab === 'audit'     && <AuditTable rows={r.audit_log} />}
      </div>

      <p className="text-[11px] text-[#94a3b8]">
        Son güncelleme: {fmtDateTime(r.computed_at)}
      </p>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SubTabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2',
        active
          ? 'border-brand text-brand'
          : 'border-transparent text-[#64748b] hover:text-[#334155]',
      )}
    >
      {children}
    </button>
  )
}

interface ScoreBarProps {
  label: string
  score: number
  max: number
  hint?: string
}

function ScoreBar({ label, score, max, hint }: ScoreBarProps) {
  const pct = max > 0 ? (score / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 shrink-0">
        <p className="text-xs text-[#334155] font-medium">{label}</p>
        {hint && <p className="text-[11px] text-[#94a3b8]">{hint}</p>}
      </div>
      <div className="flex-1 h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', scoreBarColor(score, max))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-[#475569] w-12 text-right shrink-0">
        {score}/{max}
      </span>
    </div>
  )
}

function StatCard({
  label, value, accent,
}: { label: string; value: string | number; accent?: 'green' | 'amber' }) {
  return (
    <div className="border border-[#e8eaef] rounded-xl p-3 bg-white">
      <p className="text-[11px] text-[#64748b] uppercase tracking-wide">{label}</p>
      <p className={cn(
        'text-xl font-bold mt-0.5',
        accent === 'green' ? 'text-green-700' :
        accent === 'amber' ? 'text-amber-600' :
                             'text-[#1e293b]',
      )}>
        {value}
      </p>
    </div>
  )
}

// ── Workflow Table ─────────────────────────────────────────────────────────────

type WLEntry = GovernanceReport['workflow_log'][number]

function WorkflowTable({ rows }: { rows: WLEntry[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[#94a3b8]">
        Henüz iş akışı kaydı yok.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e8eaef]">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Tür</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Durum</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Başlatıldı</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Süre</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Özet</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Not</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-[#f8fafc] transition-colors">
              <td className="px-4 py-3">
                <span className="text-xs font-medium text-[#1e293b]">{row.type_label}</span>
              </td>
              <td className="px-4 py-3">
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full border font-medium',
                  WORKFLOW_STATUS_STYLES[row.status] ?? 'bg-[#f1f5f9] text-[#475569]',
                )}>
                  {WORKFLOW_STATUS_LABELS[row.status] ?? row.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-[#64748b] whitespace-nowrap">
                {fmtDate(row.initiated_at)}
              </td>
              <td className="px-4 py-3 text-xs text-[#64748b] whitespace-nowrap">
                {row.resolution_days != null
                  ? `${row.resolution_days} gün`
                  : row.status === 'pending'
                    ? <span className="text-amber-600 font-medium">Devam ediyor</span>
                    : '—'}
              </td>
              <td className="px-4 py-3 text-xs text-[#475569] max-w-[180px] truncate">
                {row.payload_summary}
              </td>
              <td className="px-4 py-3 text-xs text-[#94a3b8] max-w-[140px] truncate">
                {row.notes ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Audit Log Table ────────────────────────────────────────────────────────────

type ALEntry = GovernanceReport['audit_log'][number]

function AuditTable({ rows }: { rows: ALEntry[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[#94a3b8]">
        Eşik üzerinde denetim kaydı bulunmuyor.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e8eaef]">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Aksiyon</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Kaynak Türü</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Tutar</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">Tarih</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-[#f8fafc] transition-colors">
              <td className="px-4 py-3">
                <span className="text-xs font-medium text-[#1e293b]">{row.action_label}</span>
              </td>
              <td className="px-4 py-3 text-xs text-[#64748b]">
                {row.resource_type}
              </td>
              <td className="px-4 py-3 text-xs text-[#334155] text-right whitespace-nowrap font-medium">
                {row.amount_try != null ? fmtTRY(row.amount_try) : '—'}
              </td>
              <td className="px-4 py-3 text-xs text-[#64748b] whitespace-nowrap">
                {fmtDateTime(row.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
