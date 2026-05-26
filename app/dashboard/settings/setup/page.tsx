export const dynamic = 'force-dynamic'

// ── /dashboard/settings/setup — Kurulum Durumu ───────────────────────────────
// Server component showing the company setup checklist. Reads actual DB state
// via the /api/intelligence/setup-checklist endpoint.
// Shows overall progress, category groups, and required/optional items.

import Link from 'next/link'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { SetupChecklistService } from '@/lib/services/intelligence/setup-checklist.service'
import type {
  ChecklistItem,
  SetupChecklistReport,
} from '@/lib/services/intelligence/setup-checklist.service'

// ── Label maps ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ChecklistItem['category'], string> = {
  foundation:  'Temel Kurulum',
  partners:    'Ortaklar',
  products:    'Ürünler',
  finance:     'Finans',
  operations:  'Operasyon',
  governance:  'Yönetişim',
}

const CATEGORY_ORDER: ChecklistItem['category'][] = [
  'foundation', 'partners', 'products', 'finance', 'operations', 'governance',
]

const STATUS_CONFIG = {
  ready: {
    label: 'Hazır',
    cls:   'bg-pos-light text-pos-text border-pos-light',
  },
  almost_ready: {
    label: 'Neredeyse Hazır',
    cls:   'bg-info-light text-info-text border-info-light',
  },
  needs_setup: {
    label: 'Kurulum Gerekli',
    cls:   'bg-warn-light text-warn-text border-warn-light',
  },
  just_started: {
    label: 'Yeni Başlandı',
    cls:   'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]',
  },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByCategory(items: ChecklistItem[]) {
  const groups: Partial<Record<ChecklistItem['category'], ChecklistItem[]>> = {}
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = []
    groups[item.category]!.push(item)
  }
  return groups
}

function categoryCompletion(items: ChecklistItem[]): { done: number; total: number } {
  const total = items.length
  const done  = items.filter(
    i => i.status === 'complete' || i.status === 'optional_complete',
  ).length
  return { done, total }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckIcon({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-pos-light text-pos-text flex-shrink-0">
        <svg viewBox="0 0 12 12" className="w-3 h-3 fill-current">
          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-[#cbd5e1] bg-white flex-shrink-0" />
  )
}

function ItemRow({ item }: { item: ChecklistItem }) {
  const isComplete = item.status === 'complete' || item.status === 'optional_complete'
  const isRequired = item.is_required

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
        isComplete
          ? 'border-[#e2e8f0] bg-white'
          : isRequired
          ? 'border-warn-light bg-warn-light/30'
          : 'border-[#e2e8f0] bg-[#fafafa] opacity-80'
      }`}
    >
      <div className="mt-0.5">
        <CheckIcon complete={isComplete} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${isComplete ? 'text-[#1e293b]' : 'text-[#334155]'}`}>
            {item.label}
          </span>
          {isRequired && !isComplete && (
            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-warn text-white">
              Zorunlu
            </span>
          )}
          {item.completion_detail && (
            <span className="text-[10px] text-[#64748b]">{item.completion_detail}</span>
          )}
        </div>
        {!isComplete && (
          <p className="text-xs text-[#94a3b8] mt-0.5">{item.description}</p>
        )}
      </div>

      {!isComplete && item.action_href && (
        <Link
          href={item.action_href}
          className={`text-xs font-semibold px-2.5 py-1.5 rounded border transition-colors flex-shrink-0 ${
            isRequired
              ? 'border-brand-light bg-brand-light text-white hover:opacity-90'
              : 'border-[#e2e8f0] bg-white text-brand-light hover:bg-brand-subtle'
          }`}
        >
          Git
        </Link>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function SetupChecklistPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="p-6 text-sm text-[#94a3b8]">Oturum açmanız gerekiyor.</div>
    )
  }

  let report: SetupChecklistReport | null = null
  let errorMsg: string | null = null

  try {
    const companyId = await resolveCompanyId(user.id, supabase)
    report = await SetupChecklistService.getReport(companyId, supabase)
  } catch (e) {
    console.error('[setup-checklist page]', e)
    errorMsg = 'Kurulum durumu yüklenemedi. Lütfen sayfayı yenileyin.'
  }

  if (errorMsg || !report) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="px-4 py-3 rounded border border-neg-light bg-neg-light text-neg-text text-sm">
          {errorMsg ?? 'Bilinmeyen hata.'}
        </div>
      </div>
    )
  }

  const { overall_status } = report
  const statusCfg = STATUS_CONFIG[overall_status]
  const groups = groupByCategory(report.items)

  return (
    <div className="max-w-3xl space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1e293b]">Kurulum Durumu</h1>
          <p className="text-xs text-[#94a3b8] mt-1">
            Sistemin düzgün çalışması için gereken yapılandırmalar
          </p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${statusCfg.cls}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* ── Ready banner ────────────────────────────────────────────────── */}
      {overall_status === 'ready' && (
        <div className="rounded-xl border border-pos-light bg-pos-light/40 px-5 py-4 text-center">
          <p className="text-lg font-bold text-pos-text">Sisteme Hazırsınız! 🎉</p>
          <p className="text-sm text-pos-text/80 mt-1">
            Tüm zorunlu kurulum adımları tamamlandı.
          </p>
        </div>
      )}

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1e293b]">Zorunlu Adımlar</p>
          <p className="text-sm font-bold tabular-nums text-[#334155]">
            {report.required_complete} / {report.required_total}
          </p>
        </div>

        <div className="w-full h-2.5 bg-[#f1f5f9] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              report.completion_pct >= 100
                ? 'bg-pos'
                : report.completion_pct >= 80
                ? 'bg-info'
                : report.completion_pct > 0
                ? 'bg-warn'
                : 'bg-[#e2e8f0]'
            }`}
            style={{ width: `${Math.max(0, Math.min(100, report.completion_pct))}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-[#94a3b8]">
          <span>%{report.completion_pct} tamamlandı</span>
          <span>{report.optional_complete} / {report.optional_total} isteğe bağlı</span>
        </div>
      </div>

      {/* ── Next action callout ─────────────────────────────────────────── */}
      {report.next_action && (
        <div className="rounded-xl border border-brand/20 bg-brand-subtle px-5 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand/70 mb-0.5">
              Sonraki Adım
            </p>
            <p className="text-sm font-semibold text-[#1e293b]">{report.next_action.label}</p>
            <p className="text-xs text-[#64748b] mt-0.5">{report.next_action.description}</p>
          </div>
          {report.next_action.action_href && (
            <Link
              href={report.next_action.action_href}
              className="text-xs font-semibold px-3 py-2 rounded border border-brand-light bg-brand-light text-white hover:opacity-90 transition-opacity flex-shrink-0"
            >
              Tamamla →
            </Link>
          )}
        </div>
      )}

      {/* ── Category groups ─────────────────────────────────────────────── */}
      {CATEGORY_ORDER.map(cat => {
        const catItems = groups[cat]
        if (!catItems || catItems.length === 0) return null

        const { done, total } = categoryCompletion(catItems)
        const allDone = done === total

        return (
          <div key={cat} className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden">
            {/* Category header */}
            <div className={`px-5 py-3 border-b border-[#e2e8f0] flex items-center justify-between ${
              allDone ? 'bg-pos-light/20' : 'bg-[#f8fafc]'
            }`}>
              <div className="flex items-center gap-2">
                {allDone && (
                  <span className="w-4 h-4 rounded-full bg-pos-light text-pos-text inline-flex items-center justify-center">
                    <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
                      <path d="M8 2.5L4 7 2 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </span>
                )}
                <p className="text-xs font-black uppercase tracking-widest text-[#64748b]">
                  {CATEGORY_LABELS[cat]}
                </p>
              </div>
              <span className="text-xs tabular-nums text-[#94a3b8]">{done}/{total}</span>
            </div>

            {/* Items */}
            <div className="p-3 space-y-2">
              {catItems.map(item => (
                <ItemRow key={item.key} item={item} />
              ))}
            </div>
          </div>
        )
      })}

      {/* ── Back link ───────────────────────────────────────────────────── */}
      <div className="pt-2">
        <Link
          href="/dashboard/settings"
          className="text-xs font-semibold text-brand-light hover:text-brand px-3 py-2 rounded hover:bg-brand-subtle border border-[#e2e8f0] transition-colors inline-block"
        >
          ← Ayarlara Dön
        </Link>
      </div>
    </div>
  )
}
