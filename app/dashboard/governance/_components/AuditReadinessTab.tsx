'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/components/ui'
import type { AuditCheckItem, AuditReadinessReport } from '@/lib/services/governance/audit-readiness.service'

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
  B: 'text-blue-700   bg-blue-50   border-blue-200',
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
  skip:         'text-gray-400',
  needs_review: 'text-gray-500',
}

const STATUS_ROW_COLORS: Record<string, string> = {
  pass:         'border-gray-100 bg-white',
  fail:         'border-red-100  bg-red-50',
  warn:         'border-amber-100 bg-amber-50',
  skip:         'border-gray-100  bg-gray-50',
  needs_review: 'border-gray-100  bg-white',
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
        <span className="text-2xl font-bold text-gray-900">{score}</span>
        <span className="text-xs text-gray-500 -mt-0.5">/ 100</span>
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
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <p className="text-xs font-medium text-gray-500 truncate">{CATEGORY_LABELS[categoryKey]}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold text-gray-900">{stats.score}</span>
        <span className="text-xs text-gray-400">/ 100</span>
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{stats.passed}/{stats.total} geçti</p>
      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
          <span className="text-sm font-medium text-gray-900">{item.label}</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide shrink-0',
            item.type === 'computed'
              ? 'bg-gray-50 text-gray-500 border-gray-200'
              : 'bg-violet-50 text-violet-600 border-violet-200',
          )}>
            {item.type === 'computed' ? 'Otomatik' : 'Manuel'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p>
        {item.acknowledged_at && (
          <p className="text-xs text-gray-400 mt-0.5">
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
            className="text-xs text-violet-600 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition-colors"
          >
            {acknowledging === item.key ? 'Kaydediliyor…' : 'Onayla'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Tab ───────────────────────────────────────────────────────────────────
export default function AuditReadinessTab() {
  const [report, setReport]           = useState<AuditReadinessReport | null>(null)
  const [loading, setLoading]         = useState(true)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/governance/audit-readiness')
      if (r.ok) {
        const d = await r.json()
        setReport(d.report ?? null)
      } else {
        setError('Rapor yüklenemedi.')
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
    return <div className="py-12 text-center text-sm text-gray-500">Denetim hazırlık raporu hesaplanıyor…</div>
  }

  if (error || !report) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600">{error ?? 'Rapor alınamadı.'}</p>
        <button onClick={load} className="text-xs text-violet-600 mt-2 hover:underline">Tekrar dene</button>
      </div>
    )
  }

  const categories: CategoryKey[] = ['accounting', 'partner', 'governance', 'tax']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Denetim Hazırlık Raporu</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Hesaplandı: {new Date(report.computed_at).toLocaleString('tr-TR')}
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Yenile
        </button>
      </div>

      {/* Score summary */}
      <div className="border border-gray-200 rounded-xl p-5 bg-white">
        <div className="flex items-center gap-6">
          <ScoreRing score={report.score} grade={report.grade} />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className={cn(
                'text-3xl font-bold px-3 py-1 rounded-xl border',
                GRADE_COLORS[report.grade] ?? GRADE_COLORS.F,
              )}>
                {report.grade}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {report.grade === 'A' ? 'Mükemmel Hazırlık' :
                   report.grade === 'B' ? 'İyi Hazırlık' :
                   report.grade === 'C' ? 'Orta Hazırlık' :
                   report.grade === 'D' ? 'Yetersiz Hazırlık' :
                   'Kritik Eksiklikler'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {report.items.filter(i => i.status === 'pass').length} / {report.items.filter(i => i.status !== 'skip').length} kontrol geçildi
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map(cat => (
          <CategoryCard key={cat} categoryKey={cat} stats={report.categories[cat]} />
        ))}
      </div>

      {/* Checklist by category */}
      {categories.map(cat => {
        const catItems = report.items.filter(i => i.category === cat)
        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                {CATEGORY_LABELS[cat]}
              </h3>
              <span className="text-xs text-gray-400">
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

      {/* Footer note */}
      <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        Bu denetim hazırlık raporu Flowra verilerinden otomatik hesaplanmaktadır.
        Manuel onay gerektiren kontroller 30 gün geçerliliğe sahiptir.
        Kesin denetim uyumluluğu için bağımsız denetçinizle çalışın.
      </p>
    </div>
  )
}
