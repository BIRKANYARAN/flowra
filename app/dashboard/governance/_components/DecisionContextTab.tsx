'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn }      from '@/components/ui'
import { fmtTRY }  from '@/lib/format'
import type { DecisionContextSnapshot, ContextSnapshot } from '@/lib/services/decision-context/decision-context.service'
import {
  classifySnapshotAge,
  computeSnapshotDrift,
} from '@/lib/services/decision-context/decision-context.pure'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day:    '2-digit',
    month:  'long',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

const TRIGGER_LABELS: Record<string, string> = {
  workflow_approved:  'İş Akışı Onayı',
  dividend_declared:  'Temettü Kararı',
  resolution_passed:  'Karar Alındı',
  period_closed:      'Dönem Kapandı',
  large_expense:      'Büyük Masraf',
  partner_loan:       'Ortak Borcu',
  manual:             'Manuel Kayıt',
}

const STATUS_STYLES: Record<string, string> = {
  healthy:   'bg-green-100  text-green-700  border-green-200',
  caution:   'bg-amber-100  text-amber-700  border-amber-200',
  'at-risk': 'bg-orange-100 text-orange-700 border-orange-200',
  critical:  'bg-red-100    text-red-700    border-red-200',
}

const STATUS_TR: Record<string, string> = {
  healthy:   'Sağlıklı',
  caution:   'Dikkatli',
  'at-risk': 'Risk Altında',
  critical:  'Kritik',
}

const TREND_ICON: Record<string, string> = {
  up:     '↑',
  down:   '↓',
  stable: '→',
}

const AGE_STYLES: Record<'fresh' | 'stale' | 'outdated', string> = {
  fresh:    'bg-green-100  text-green-700  border-green-200',
  stale:    'bg-amber-100  text-amber-700  border-amber-200',
  outdated: 'bg-[#f1f5f9]   text-[#64748b]   border-[#e8eaef]',
}

const AGE_LABELS: Record<'fresh' | 'stale' | 'outdated', string> = {
  fresh:    'Güncel',
  stale:    'Eski',
  outdated: 'Eskimiş',
}

// ── Context detail panel ──────────────────────────────────────────────────────

function ContextDetail({ snapshot }: { snapshot: ContextSnapshot }) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
      {/* Financial */}
      <div className="bg-[#f8fafc] rounded-lg p-3 space-y-1.5">
        <p className="font-semibold text-[#334155] text-[11px] uppercase tracking-wider mb-2">Finansal Durum</p>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Nakit</span>
          <span className="font-medium text-[#1e293b]">{fmtTRY(snapshot.financial_state.cash_try)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Nakit Ömrü</span>
          <span className="font-medium text-[#1e293b]">{snapshot.financial_state.cash_runway_months.toFixed(1)} ay</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Net Gelir (30 gün)</span>
          <span className="font-medium text-[#1e293b]">{fmtTRY(snapshot.financial_state.net_income_try)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Gelir Trendi</span>
          <span className="font-medium text-[#1e293b]">{TREND_ICON[snapshot.financial_state.revenue_trend]} {snapshot.financial_state.revenue_trend}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Skor</span>
          <span className="font-medium text-[#1e293b]">{snapshot.financial_state.composite_score}/100</span>
        </div>
      </div>

      {/* Partner */}
      <div className="bg-[#f8fafc] rounded-lg p-3 space-y-1.5">
        <p className="font-semibold text-[#334155] text-[11px] uppercase tracking-wider mb-2">Ortak Durumu</p>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Toplam Ortak Borcu</span>
          <span className="font-medium text-[#1e293b]">{fmtTRY(snapshot.partner_state.total_partner_debt_try)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Aktif Ortak</span>
          <span className="font-medium text-[#1e293b]">{snapshot.partner_state.active_partners}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Aşırı Finanse</span>
          <span className="font-medium text-[#1e293b]">{snapshot.partner_state.overfinanced_partners}</span>
        </div>
      </div>

      {/* Receivables */}
      <div className="bg-[#f8fafc] rounded-lg p-3 space-y-1.5">
        <p className="font-semibold text-[#334155] text-[11px] uppercase tracking-wider mb-2">Alacak Durumu</p>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Toplam Alacak</span>
          <span className="font-medium text-[#1e293b]">{fmtTRY(snapshot.receivables_state.total_receivables_try)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Vadesi Geçmiş</span>
          <span className="font-medium text-[#1e293b]">{fmtTRY(snapshot.receivables_state.overdue_receivables_try)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Gecikme Oranı</span>
          <span className="font-medium text-[#1e293b]">%{snapshot.receivables_state.overdue_ratio.toFixed(1)}</span>
        </div>
      </div>

      {/* Governance */}
      <div className="bg-[#f8fafc] rounded-lg p-3 space-y-1.5">
        <p className="font-semibold text-[#334155] text-[11px] uppercase tracking-wider mb-2">Yönetişim Durumu</p>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Açık Dönem Gün</span>
          <span className="font-medium text-[#1e293b]">{snapshot.governance_state.open_period_days}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Bekleyen İş Akışı</span>
          <span className="font-medium text-[#1e293b]">{snapshot.governance_state.pending_workflows}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#64748b]">Son 30 Gün Karar</span>
          <span className="font-medium text-[#1e293b]">{snapshot.governance_state.recent_resolutions}</span>
        </div>
      </div>

      <div className="col-span-2 text-[10px] text-[#94a3b8] text-right">
        Hesaplanma zamanı: {fmtDatetime(snapshot.computed_at)}
      </div>
    </div>
  )
}

// ── Snapshot card ─────────────────────────────────────────────────────────────

function SnapshotCard({
  snap,
  onAnnotated,
  driftScore,
}: {
  snap:        DecisionContextSnapshot
  onAnnotated: () => void
  driftScore?: number
}) {
  const [expanded,    setExpanded]    = useState(false)
  const [showAnnotate, setShowAnnotate] = useState(false)
  const [annotation,  setAnnotation]  = useState(snap.annotation ?? '')
  const [saving,      setSaving]      = useState(false)
  const ctx = snap.context_snapshot

  const ageBadge = classifySnapshotAge(snap.decision_at, new Date().toISOString())

  async function saveAnnotation() {
    if (!annotation.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`/api/decisions/${snap.id}/annotate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ annotation: annotation.trim() }),
      })
      if (r.ok) {
        setShowAnnotate(false)
        onAnnotated()
      }
    } finally {
      setSaving(false)
    }
  }

  const statusStyle = STATUS_STYLES[ctx.financial_state.situation_status] ?? 'bg-[#f1f5f9] text-[#475569]'

  return (
    <div className="border border-[#e8eaef] rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:bg-[#f8fafc] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-brand bg-brand-subtle px-2 py-0.5 rounded border border-brand-subtle uppercase tracking-wide">
              {TRIGGER_LABELS[snap.trigger_type] ?? snap.trigger_type}
            </span>
            <span className={cn('text-[11px] px-2 py-0.5 rounded border font-semibold', statusStyle)}>
              {STATUS_TR[ctx.financial_state.situation_status] ?? ctx.financial_state.situation_status}
            </span>
            <span className={cn('text-[11px] px-2 py-0.5 rounded border font-medium', AGE_STYLES[ageBadge])}>
              {AGE_LABELS[ageBadge]}
            </span>
            {driftScore !== undefined && (
              <span className="text-[11px] px-2 py-0.5 rounded border border-info-light bg-info-light text-info-text font-medium">
                Drift: {driftScore}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-[#0f172a] mt-1 leading-snug">{snap.trigger_label}</p>
          {snap.annotation && (
            <p className="text-xs text-[#64748b] mt-1 italic line-clamp-1">
              &quot;{snap.annotation}&quot;
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-[#64748b]">{fmtDatetime(snap.decision_at)}</p>
          <p className="text-xs font-semibold text-[#334155] mt-0.5">
            {fmtTRY(ctx.financial_state.cash_try)}
            <span className="text-[#94a3b8] font-normal"> nakit</span>
          </p>
          <p className="text-[11px] text-[#94a3b8] mt-0.5">
            {ctx.financial_state.cash_runway_months.toFixed(1)} ay ömür
          </p>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#f1f5f9] px-4 pb-4">
          <ContextDetail snapshot={ctx} />

          {/* Annotation section */}
          <div className="mt-4 space-y-2">
            {snap.annotation && !showAnnotate && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[11px] text-amber-600 font-semibold uppercase tracking-wide mb-1">Not</p>
                <p className="text-xs text-amber-800">{snap.annotation}</p>
                {snap.annotated_at && (
                  <p className="text-[10px] text-amber-400 mt-1">{fmtDatetime(snap.annotated_at)}</p>
                )}
              </div>
            )}

            {!showAnnotate && (
              <button
                onClick={e => { e.stopPropagation(); setShowAnnotate(true) }}
                className="text-xs text-brand hover:text-brand hover:underline"
              >
                {snap.annotation ? 'Notu düzenle' : '+ Not ekle'}
              </button>
            )}

            {showAnnotate && (
              <div className="space-y-2" onClick={e => e.stopPropagation()}>
                <textarea
                  rows={2}
                  value={annotation}
                  onChange={e => setAnnotation(e.target.value)}
                  placeholder="Bu kararı gelecekteki karar vericiler için açıklayın…"
                  className="w-full border rounded-lg px-3 py-2 text-xs resize-none focus:ring-1 focus:ring-brand focus:border-brand"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveAnnotation}
                    disabled={saving || !annotation.trim()}
                    className="text-xs bg-brand-light text-white px-3 py-1.5 rounded-lg hover:bg-brand disabled:opacity-50"
                  >
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                  <button
                    onClick={() => setShowAnnotate(false)}
                    className="text-xs text-[#64748b] px-3 py-1.5 rounded-lg hover:bg-[#f1f5f9]"
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function DecisionContextTab() {
  const [snapshots,    setSnapshots]    = useState<DecisionContextSnapshot[]>([])
  const [loading,      setLoading]      = useState(true)
  const [capturing,    setCapturing]    = useState(false)
  const [showCapture,  setShowCapture]  = useState(false)
  const [triggerLabel, setTriggerLabel] = useState('')
  const [triggerType,  setTriggerType]  = useState('manual')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/decisions')
      if (r.ok) {
        const d = await r.json()
        setSnapshots(d.snapshots ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function captureNow() {
    if (!triggerLabel.trim()) return
    setCapturing(true)
    try {
      const r = await fetch('/api/decisions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          trigger_type:  triggerType,
          trigger_label: triggerLabel.trim(),
        }),
      })
      if (r.ok) {
        setTriggerLabel('')
        setTriggerType('manual')
        setShowCapture(false)
        load()
      }
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#0f172a]">Karar Bağlamı Geçmişi</h2>
          <p className="text-xs text-[#64748b] mt-0.5">
            Önemli kararlar anındaki finansal durumun otomatik kaydı
          </p>
        </div>
        <button
          onClick={() => setShowCapture(v => !v)}
          className="text-xs bg-brand-light text-white px-3 py-1.5 rounded-lg hover:bg-brand transition-colors"
        >
          Anlık Görüntü Al
        </button>
      </div>

      {/* Capture panel */}
      {showCapture && (
        <div className="border border-brand-subtle rounded-xl p-4 bg-brand-subtle space-y-3">
          <h3 className="text-sm font-medium text-brand">Anlık Finansal Durum Kaydı</h3>
          <p className="text-xs text-brand">
            Şu anki finansal durumu bu kararla ilişkilendirecek bir snapshot oluşturulacak.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#475569] mb-1 block">Karar / Olay Türü</label>
              <select
                value={triggerType}
                onChange={e => setTriggerType(e.target.value)}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="manual">Manuel Kayıt</option>
                <option value="workflow_approved">İş Akışı Onayı</option>
                <option value="dividend_declared">Temettü Kararı</option>
                <option value="resolution_passed">Karar Alındı</option>
                <option value="period_closed">Dönem Kapandı</option>
                <option value="large_expense">Büyük Masraf</option>
                <option value="partner_loan">Ortak Borcu</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#475569] mb-1 block">Açıklama / Başlık *</label>
              <input
                value={triggerLabel}
                onChange={e => setTriggerLabel(e.target.value)}
                placeholder="Ör: Masraf Onayı: ₺120.000 IT Altyapısı"
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={captureNow}
              disabled={capturing || !triggerLabel.trim()}
              className="text-xs bg-brand-light text-white px-4 py-1.5 rounded-lg hover:bg-brand disabled:opacity-50"
            >
              {capturing ? 'Kaydediliyor…' : 'Şu Anki Durumu Kaydet'}
            </button>
            <button
              onClick={() => setShowCapture(false)}
              className="text-xs text-[#475569] px-3 py-1.5 rounded-lg hover:bg-[#f1f5f9]"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Drift summary banner — shown when >=2 snapshots */}
      {!loading && snapshots.length >= 2 && (() => {
        const drift = computeSnapshotDrift(
          snapshots[1].context_snapshot,
          snapshots[0].context_snapshot,
        )
        const driftColor =
          drift >= 40 ? 'bg-red-50 border-red-200 text-red-700' :
          drift >= 20 ? 'bg-amber-50 border-amber-200 text-amber-700' :
                        'bg-green-50 border-green-200 text-green-700'
        return (
          <div className={cn('text-xs px-3 py-2 rounded-lg border', driftColor)}>
            Son iki anlık görüntü arasındaki finansal sapma skoru: <strong>{drift}/100</strong>
            {drift >= 40 && ' — Önemli değişimler var.'}
            {drift >= 20 && drift < 40 && ' — Orta düzeyde değişimler var.'}
            {drift < 20 && ' — Finansal durum görece sabit.'}
          </div>
        )
      })()}

      {/* Timeline */}
      {loading ? (
        <div className="py-12 text-center text-sm text-[#64748b]">Yükleniyor…</div>
      ) : snapshots.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-[#94a3b8]">Henüz karar bağlamı kaydı yok.</p>
          <p className="text-xs text-[#94a3b8]">
            İlk anlık görüntüyü almak için butona tıklayın.
          </p>
          <button
            onClick={() => setShowCapture(true)}
            className="text-xs bg-brand-light text-white px-4 py-1.5 rounded-lg hover:bg-brand transition-colors"
          >
            Anlık Görüntü Al
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshots.map((snap, idx) => {
            const driftScore = idx < snapshots.length - 1
              ? computeSnapshotDrift(
                  snapshots[idx + 1].context_snapshot,
                  snap.context_snapshot,
                )
              : undefined
            return (
              <SnapshotCard
                key={snap.id}
                snap={snap}
                onAnnotated={load}
                driftScore={driftScore}
              />
            )
          })}
        </div>
      )}

      <p className="text-xs text-[#94a3b8] bg-[#f8fafc] rounded-lg px-3 py-2">
        Karar bağlamı kayıtları, gelecekte &quot;Bu karar neden alındı?&quot; sorusuna yanıt vermek amacıyla
        o andaki finansal durumu otomatik olarak belgeler.
      </p>
    </div>
  )
}
