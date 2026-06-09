'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/components/ui'
import type { AuditCheckItem, AuditReadinessReport, AuditCheckCategory } from '@/lib/services/governance/audit-readiness.service'
import { gradeLabel, countNeedsReview } from '@/lib/services/governance/audit-readiness.service'
import {
  DOCUMENT_TYPE_LABELS,
  AUDIT_REQUIRED_TYPES,
} from '@/lib/services/documents/document.service'
import type { DocumentSummary } from '@/lib/services/documents/document.service'

// ── Types ──────────────────────────────────────────────────────────────────────
type CategoryKey = 'accounting' | 'partner' | 'governance' | 'tax'

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  accounting:  'Muhasebe Doğruluğu',
  partner:     'Ortak Finansmanı',
  governance:  'Kurumsal Yönetim',
  tax:         'Vergi Uyumu',
}

const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-700  bg-green-50  border-green-200',
  B: 'text-info-text   bg-info-light   border-info-light',
  C: 'text-amber-700  bg-amber-50  border-amber-200',
  D: 'text-orange-700 bg-orange-50 border-orange-200',
  F: 'text-red-700    bg-red-50    border-red-200',
}

const STATUS_ICON: Record<string, string> = {
  pass:         '✓',
  fail:         '✗',
  warn:         '⚠',
  skip:         '—',
  needs_review: '○',
}

const STATUS_COLORS: Record<string, string> = {
  pass:         'text-green-600',
  fail:         'text-red-600',
  warn:         'text-amber-600',
  skip:         'text-[#94a3b8]',
  needs_review: 'text-[#64748b]',
}

const STATUS_ROW_COLORS: Record<string, string> = {
  pass:         'border-[#f1f5f9] bg-white',
  fail:         'border-red-100  bg-red-50',
  warn:         'border-amber-100 bg-amber-50',
  skip:         'border-[#f1f5f9]  bg-[#f8fafc]',
  needs_review: 'border-[#f1f5f9]  bg-white',
}

const STATUS_LABELS: Record<string, string> = {
  pass:         'Geçti',
  fail:         'Başarısız',
  warn:         'Uyarı',
  skip:         'Atlandı',
  needs_review: 'İncelenmeli',
}

// ── Score Ring ─────────────────────────────────────────────────────────────────
function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius      = 40
  const circumference = 2 * Math.PI * radius
  const strokeDash  = (score / 100) * circumference

  const strokeColor =
    grade === 'A' ? '#16a34a' :
    grade === 'B' ? '#2563eb' :
    grade === 'C' ? '#d97706' :
    grade === 'D' ? '#ea580c' : '#dc2626'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[#0f172a]">{score}</span>
        <span className="text-xs text-[#64748b] -mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

// ── Category Card ──────────────────────────────────────────────────────────────
function CategoryCard({
  categoryKey,
  stats,
}: {
  categoryKey: CategoryKey
  stats: { score: number; total: number; passed: number }
}) {
  return (
    <div className="border border-[#e8eaef] rounded-xl p-3 bg-white">
      <p className="text-xs font-medium text-[#64748b] truncate">{CATEGORY_LABELS[categoryKey]}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold text-[#0f172a]">{stats.score}</span>
        <span className="text-xs text-[#94a3b8]">/ 100</span>
      </div>
      <p className="text-xs text-[#94a3b8] mt-0.5">{stats.passed}/{stats.total} geçti</p>
      <div className="mt-2 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${stats.score}%`,
            backgroundColor: stats.score >= 80 ? '#16a34a' : stats.score >= 60 ? '#d97706' : '#dc2626',
          }}
        />
      </div>
    </div>
  )
}

// ── Check Row ──────────────────────────────────────────────────────────────────
function CheckRow({
  item,
  onAcknowledge,
  acknowledging,
}: {
  item:           AuditCheckItem
  onAcknowledge:  (key: string) => void
  acknowledging:  string | null
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3 border rounded-lg', STATUS_ROW_COLORS[item.status])}>
      {/* Status icon */}
      <span className={cn('text-sm font-bold shrink-0 mt-0.5 w-4 text-center', STATUS_COLORS[item.status])}>
        {STATUS_ICON[item.status]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#0f172a]">{item.label}</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide shrink-0',
            item.type === 'computed'
              ? 'bg-[#f8fafc] text-[#64748b] border-[#e8eaef]'
              : 'bg-brand-subtle text-brand border-brand-subtle',
          )}>
            {item.type === 'computed' ? 'Otomatik' : 'Manuel'}
          </span>
        </div>
        <p className="text-xs text-[#64748b] mt-0.5">{item.detail}</p>
        {item.acknowledged_at && (
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Onaylandı: {new Date(item.acknowledged_at).toLocaleDateString('tr-TR')}
            {item.valid_until && ` — Geçerli: ${item.valid_until}`}
          </p>
        )}
      </div>

      {/* Status badge + action */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className={cn('text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide', STATUS_COLORS[item.status])}>
          {STATUS_LABELS[item.status]}
        </span>
        {item.type === 'acknowledged' && item.status !== 'pass' && (
          <button
            onClick={() => onAcknowledge(item.key)}
            disabled={acknowledging === item.key}
            className="text-xs text-brand bg-brand-subtle border border-brand-subtle px-2 py-1 rounded-lg hover:bg-brand-subtle disabled:opacity-50 transition-colors"
          >
            {acknowledging === item.key ? 'Kaydediliyor…' : 'Onayla'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Document Status Section ────────────────────────────────────────────────────
function DocumentStatusSection({ docSummary }: { docSummary: DocumentSummary | null }) {
  if (!docSummary) return null

  const readinessPct   = docSummary.audit_readiness_pct
  const readinessColor =
    readinessPct >= 80 ? 'text-green-700' :
    readinessPct >= 50 ? 'text-amber-600' :
    'text-red-600'

  const presentTypes = Object.entries(docSummary.by_type)
    .filter(([t]) => AUDIT_REQUIRED_TYPES.includes(t as typeof AUDIT_REQUIRED_TYPES[number]))
    .filter(([, count]) => count > 0)
    .map(([t]) => t)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#334155] uppercase tracking-wider">
          Belge Durumu
        </h3>
        <a
          href="/dashboard/documents?audit_required=true"
          className="text-xs text-brand hover:underline"
        >
          Denetim belgelerini gör →
        </a>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="border border-[#e8eaef] rounded-xl p-3 bg-white">
          <p className="text-xs text-[#64748b]">Toplam Belge</p>
          <p className="text-xl font-bold text-[#0f172a] mt-0.5">{docSummary.total_documents}</p>
        </div>
        <div className="border border-[#e8eaef] rounded-xl p-3 bg-white">
          <p className="text-xs text-[#64748b]">Doğrulananlar</p>
          <p className="text-xl font-bold text-[#0f172a] mt-0.5">
            {docSummary.audit_required_verified}
            <span className="text-xs text-[#94a3b8] font-normal"> / {docSummary.audit_required_total}</span>
          </p>
        </div>
        <div className="border border-[#e8eaef] rounded-xl p-3 bg-white">
          <p className="text-xs text-[#64748b]">Denetim Hazırlığı</p>
          <p className={cn('text-xl font-bold mt-0.5', readinessColor)}>%{readinessPct}</p>
        </div>
      </div>

      {presentTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presentTypes.map(t => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded border font-medium bg-green-50 text-green-700 border-green-200">
              ✓ {DOCUMENT_TYPE_LABELS[t as keyof typeof DOCUMENT_TYPE_LABELS]}
            </span>
          ))}
        </div>
      )}

      {docSummary.missing_audit_docs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-red-700">Eksik Denetim Belgeleri:</p>
          {docSummary.missing_audit_docs.map(m => (
            <div key={m.document_type} className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-red-500 text-xs">✗</span>
              <span className="text-xs text-red-700">{DOCUMENT_TYPE_LABELS[m.document_type]}</span>
              <span className="text-xs text-red-500 ml-auto">{m.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Tab ───────────────────────────────────────────────────────────────────
export default function AuditReadinessTab() {
  const [report, setReport]           = useState<AuditReadinessReport | null>(null)
  const [loading, setLoading]         = useState(true)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [docSummary, setDocSummary]   = useState<DocumentSummary | null>(null)
  const [activeCategory, setActiveCategory] = useState<AuditCheckCategory | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [auditRes, docRes] = await Promise.all([
        fetch('/api/governance/audit-readiness'),
        fetch('/api/documents/summary'),
      ])
      if (auditRes.ok) {
        const d = await auditRes.json() as { report?: AuditReadinessReport }
        setReport(d.report ?? null)
      } else {
        setError('Rapor yüklenemedi.')
      }
      if (docRes.ok) {
        const d = await docRes.json() as { summary?: DocumentSummary }
        setDocSummary(d.summary ?? null)
      }
    } catch {
      setError('Sunucuya bağlanılamadı.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAcknowledge(checkKey: string) {
    setAcknowledging(checkKey)
    try {
      const r = await fetch('/api/governance/audit-readiness/acknowledge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ check_key: checkKey }),
      })
      if (r.ok) {
        await load()
      }
    } finally {
      setAcknowledging(null)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-[#64748b]">Denetim hazırlık raporu hesaplanıyor…</div>
  }

  if (error || !report) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600">{error ?? 'Rapor alınamadı.'}</p>
        <button onClick={load} className="text-xs text-brand mt-2 hover:underline">Tekrar dene</button>
      </div>
    )
  }

  const categories: CategoryKey[] = ['accounting', 'partner', 'governance', 'tax']
  const needsReviewCount = countNeedsReview(report.items)
  const visibleCategories = activeCategory ? [activeCategory] : categories

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#0f172a]">Denetim Hazırlık Raporu</h2>
          <p className="text-xs text-[#64748b] mt-0.5">
            Son Denetim Kontrolü: {new Date(report.computed_at).toLocaleString('tr-TR')}
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs text-[#64748b] hover:text-[#334155] border border-[#e8eaef] px-3 py-1.5 rounded-lg hover:bg-[#f8fafc] transition-colors"
        >
          Yenile
        </button>
      </div>

      {/* Score summary */}
      <div className="border border-[#e8eaef] rounded-xl p-5 bg-white">
        <div className="flex items-center gap-6">
          <ScoreRing score={report.score} grade={report.grade} />
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className={cn(
                'text-3xl font-bold px-3 py-1 rounded-xl border',
                GRADE_COLORS[report.grade] ?? GRADE_COLORS.F,
              )}>
                {report.grade}
              </div>
              <div>
                <p className="text-sm font-medium text-[#0f172a]">
                  {gradeLabel(report.grade)}
                </p>
                <p className="text-xs text-[#64748b] mt-0.5">
                  {report.items.filter(i => i.status === 'pass').length} / {report.items.filter(i => i.status !== 'skip').length} kontrol geçildi
                </p>
              </div>
              {needsReviewCount > 0 && (
                <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg bg-yellow-100 text-yellow-800 border border-yellow-300">
                  {needsReviewCount} kontrol inceleme bekliyor
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Category filter buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={cn(
            'text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium',
            activeCategory === null
              ? 'bg-[#0f172a] text-white border-[#0f172a]'
              : 'bg-white text-[#475569] border-[#e8eaef] hover:bg-[#f8fafc]',
          )}
        >
          Tümü
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium',
              activeCategory === cat
                ? 'bg-brand-light text-white border-brand'
                : 'bg-white text-[#475569] border-[#e8eaef] hover:bg-[#f8fafc]',
            )}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map(cat => (
          <CategoryCard key={cat} categoryKey={cat} stats={report.categories[cat]} />
        ))}
      </div>

      {/* Checklist by category */}
      {visibleCategories.map(cat => {
        const catItems = report.items.filter(i => i.category === cat)
        if (catItems.length === 0) {
          return (
            <div key={cat} className="py-6 text-center text-sm text-[#94a3b8] border border-dashed border-[#e8eaef] rounded-xl">
              Bu kategoride kontrol bulunmuyor.
            </div>
          )
        }
        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[#334155] uppercase tracking-wider">
                {CATEGORY_LABELS[cat]}
              </h3>
              <span className="text-xs text-[#94a3b8]">
                {report.categories[cat].passed}/{report.categories[cat].total}
              </span>
            </div>
            <div className="space-y-1.5">
              {catItems.map(item => (
                <CheckRow
                  key={item.key}
                  item={item}
                  onAcknowledge={handleAcknowledge}
                  acknowledging={acknowledging}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Document status section */}
      <DocumentStatusSection docSummary={docSummary} />

      {/* Footer note */}
      <p className="text-xs text-[#94a3b8] bg-[#f8fafc] rounded-lg px-3 py-2">
        Bu denetim hazırlık raporu Flowra verilerinden otomatik hesaplanmaktadır.
        Manuel onay gerektiren kontroller 30 gün geçerliliğe sahiptir.
        Kesin denetim uyumluluğu için bağımsız denetçinizle çalışın.
      </p>
    </div>
  )
}
