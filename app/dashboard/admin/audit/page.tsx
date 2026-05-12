// ── /dashboard/admin/audit — Denetim Kaydı (server component) ────────────────
//
// FAZ 13: Converted from 'use client' to server component.
//
// Server-rendered sections (static, no JS):
//   Zone 1 — KPI strip: total logs, action distribution, this-month count
//   Zone 2 — Access-denied panel (rendered instead of KPI when not admin)
//
// Client island:
//   AuditClient — filters + pagination + row expansion (re-fetches /api/admin/audit)
//
// Directly calls safeAdminQuery for the first page of logs.
// Self-HTTP eliminated for the initial render.

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { requireAdmin }     from '@/lib/require-role'
import { safeAdminQuery }   from '@/lib/admin-db'
import { AppError }         from '@/types/errors'
import type { AuditLog }    from '@/types'
import AuditClient          from './AuditClient'

// ── Analytics helpers (pure, tested in tests/audit-log-analytics.test.ts) ────

function actionDistribution(logs: AuditLog[]): Record<string, number> {
  const counts: Record<string, number> = { create: 0, update: 0, delete: 0 }
  for (const log of logs) {
    counts[log.action] = (counts[log.action] ?? 0) + 1
  }
  return counts
}

function entityTypeSummary(logs: AuditLog[]): { type: string; count: number }[] {
  const map = new Map<string, number>()
  for (const log of logs) {
    map.set(log.entity_type, (map.get(log.entity_type) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}

function thisMonthCount(logs: AuditLog[], ym: string): number {
  // ym format: 'YYYY-MM'
  return logs.filter(log => log.created_at.slice(0, 7) === ym).length
}

const PAGE_SIZE = 50

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminAuditPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch { redirect('/auth') }

  // ── Admin guard ────────────────────────────────────────────────────────────
  let isAdmin = true
  try { await requireAdmin(uid, companyId, supabase) }
  catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      isAdmin = false
    } else {
      throw e
    }
  }

  // ── Access-denied view ─────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="max-w-lg">
        <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="font-bold text-red-700 mb-1">Yetkisiz Erişim</h2>
          <p className="text-sm text-red-600">Bu sayfaya yalnızca yöneticiler erişebilir.</p>
        </div>
      </div>
    )
  }

  // ── Fetch first page of audit logs ─────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const thisYM = today.slice(0, 7)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = safeAdminQuery('audit_logs', companyId)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1)

  const { data: rawLogs, count } = await q
  const logs  = (rawLogs ?? []) as AuditLog[]
  const total = count ?? 0

  // ── Server-side analytics (on the first-page sample) ──────────────────────
  // For KPI accuracy we also fetch a lightweight count-only query for this month
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthQ: any = safeAdminQuery('audit_logs', companyId)
    .select('*', { count: 'exact', head: true })
    .gte('created_at', thisYM + '-01T00:00:00Z')

  const { count: monthCount } = await monthQ
  const thisMonth = monthCount ?? 0

  const actionDist  = actionDistribution(logs)
  const topEntities = entityTypeSummary(logs).slice(0, 3)

  // ── Action label map for KPI strip ─────────────────────────────────────────
  const ACTION_LABELS: Record<string, string> = {
    create: 'Oluşturma',
    update: 'Güncelleme',
    delete: 'Silme',
  }

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Denetim Kaydı</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Şirketteki tüm işlem geçmişi · {total.toLocaleString('tr-TR')} kayıt
        </p>
      </div>

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────── */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[
            {
              label: 'Toplam Kayıt',
              value: total.toLocaleString('tr-TR'),
              sub:   'tüm işlemler',
              color: 'text-gray-900',
            },
            {
              label: 'Bu Ay',
              value: thisMonth > 0 ? thisMonth.toLocaleString('tr-TR') : '—',
              sub:   thisMonth > 0 ? 'son 30 gün' : 'henüz kayıt yok',
              color: thisMonth > 0 ? 'text-blue-700' : 'text-gray-400',
            },
            {
              label: 'Oluşturma',
              value: actionDist.create > 0 ? String(actionDist.create) : '—',
              sub:   'son 50 kayıtta',
              color: actionDist.create > 0 ? 'text-emerald-700' : 'text-gray-400',
            },
            {
              label: 'Silme',
              value: actionDist.delete > 0 ? String(actionDist.delete) : '—',
              sub:   'son 50 kayıtta',
              color: actionDist.delete > 0 ? 'text-red-600' : 'text-gray-400',
            },
          ].map((card, i) => (
            <div key={card.label}
              className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Action distribution + top entities (server-rendered) ─────────── */}
      {total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Action bars */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              İşlem Dağılımı (son 50)
            </div>
            <div className="space-y-2">
              {(['create', 'update', 'delete'] as const).map(action => {
                const count = actionDist[action] ?? 0
                const pct   = logs.length > 0 ? Math.round((count / logs.length) * 100) : 0
                const colors = {
                  create: { bar: 'bg-emerald-400', text: 'text-emerald-700' },
                  update: { bar: 'bg-blue-400',    text: 'text-blue-700'    },
                  delete: { bar: 'bg-red-400',      text: 'text-red-600'    },
                }
                return (
                  <div key={action}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs text-gray-600">{ACTION_LABELS[action]}</span>
                      <span className={`text-xs font-semibold tabular-nums ${colors[action].text}`}>
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors[action].bar} rounded-full transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top entity types */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              En Aktif Kayıt Türleri (son 50)
            </div>
            {topEntities.length === 0 ? (
              <p className="text-xs text-gray-400">Veri yok.</p>
            ) : (
              <div className="space-y-2">
                {topEntities.map(({ type, count }) => {
                  const ENTITY_LABELS: Record<string, string> = {
                    stock_movement:      'Stok Hareketi',
                    purchase:            'Satın Alma',
                    sale:                'Satış',
                    expense:             'Gider',
                    recurring_expense:   'Tekrarlayan Gider',
                    partner_transaction: 'Ortak İşlemi',
                    partner:             'Ortak',
                  }
                  const label = ENTITY_LABELS[type] ?? type
                  const pct   = logs.length > 0 ? Math.round((count / logs.length) * 100) : 0
                  return (
                    <div key={type}>
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs text-gray-600">{label}</span>
                        <span className="text-xs font-semibold tabular-nums text-gray-700">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Client island: filters + table + pagination ───────────────────── */}
      <AuditClient
        initialLogs={logs}
        initialTotal={total}
      />

    </div>
  )
}
