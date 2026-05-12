// ── /dashboard/tasks — Görev Yönetimi (server component) ─────────────────────
//
// FAZ 12: Converted from 'use client' to server component.
//
// Server-rendered sections (static, no JS):
//   Zone 1 — KPI strip: open, overdue, due this week, completion rate
//   Zone 2 — Upcoming overdue alert banner (if any)
//
// Client island:
//   TasksClient — full CRUD + local tab filtering (no API call on tab switch)
//
// Self-HTTP eliminated: data loaded directly via Supabase server client.
// All tasks prefetched at once → client filters locally by status tab.

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import type { Task, Customer, Sale } from '@/types'
import TasksClient          from './TasksClient'

// ── Analytics helpers (pure, tested in tests/task-analytics.test.ts) ──────────

function overdueCount(tasks: Task[], today: string): number {
  return tasks.filter(t => t.status === 'open' && t.due_date != null && t.due_date < today).length
}

function dueThisWeek(tasks: Task[], today: string): number {
  const weekOut = addDays(today, 7)
  return tasks.filter(t =>
    t.status === 'open' &&
    t.due_date != null &&
    t.due_date >= today &&
    t.due_date <= weekOut
  ).length
}

function completionRate(tasks: Task[]): number {
  const closed = tasks.filter(t => t.status === 'done' || t.status === 'cancelled').length
  return tasks.length > 0 ? Math.round((closed / tasks.length) * 100) : 0
}

function tasksByStatus(tasks: Task[]): Record<string, number> {
  const counts: Record<string, number> = { open: 0, done: 0, cancelled: 0 }
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1
  }
  return counts
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + n))
  return date.toISOString().slice(0, 10)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TasksPage() {
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

  const today = new Date().toISOString().slice(0, 10)

  // ── Parallel fetch ─────────────────────────────────────────────────────────
  const [tasksRes, customersRes, salesRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, customers(name)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200),

    supabase
      .from('customers')
      .select('id, name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name'),

    supabase
      .from('sales')
      .select('id, customer_name, total_try, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  // Normalize tasks: flatten joined customer name
  const tasks = ((tasksRes.data ?? []) as (Task & { customers?: { name: string } | null })[])
    .map(t => ({
      ...t,
      customer_name: t.customer_name ?? (
        typeof t.customers === 'object' && t.customers !== null
          ? (t.customers as { name: string }).name
          : null
      ),
      customers: undefined,  // strip the join noise
    })) as Task[]

  const customers = (customersRes.data ?? []) as Pick<Customer, 'id' | 'name'>[]
  const sales     = (salesRes.data     ?? []) as Pick<Sale, 'id' | 'customer_name' | 'total_try' | 'created_at'>[]

  // ── Server-side analytics ──────────────────────────────────────────────────
  const statusCounts = tasksByStatus(tasks)
  const overdue      = overdueCount(tasks, today)
  const thisWeek     = dueThisWeek(tasks, today)
  const compRate     = completionRate(tasks)

  // Overdue tasks for alert banner
  const overdueTasks = tasks
    .filter(t => t.status === 'open' && t.due_date != null && t.due_date < today)
    .slice(0, 3)

  return (
    <div className="max-w-3xl space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Görevler</h1>
        <p className="text-xs text-gray-400 mt-0.5">Hafif CRM — takip ve hatırlatma · {tasks.length} kayıt</p>
      </div>

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────── */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[
            {
              label: 'Açık Görev',
              value: String(statusCounts.open ?? 0),
              sub:   'bekliyor',
              color: statusCounts.open > 0 ? 'text-blue-700' : 'text-gray-400',
            },
            {
              label: 'Vadesi Geçmiş',
              value: overdue > 0 ? String(overdue) : '—',
              sub:   overdue > 0 ? 'hemen ele alınmalı' : 'gecikmiş yok ✓',
              color: overdue > 0 ? 'text-red-600' : 'text-emerald-600',
            },
            {
              label: 'Bu Hafta Vade',
              value: thisWeek > 0 ? String(thisWeek) : '—',
              sub:   thisWeek > 0 ? '7 gün içinde' : 'yaklaşan yok',
              color: thisWeek > 0 ? 'text-amber-700' : 'text-gray-400',
            },
            {
              label: 'Tamamlanma Oranı',
              value: tasks.length > 0 ? `%${compRate}` : '—',
              sub:   `${statusCounts.done ?? 0} tamamlandı · ${statusCounts.cancelled ?? 0} iptal`,
              color: compRate >= 70 ? 'text-emerald-700' : compRate >= 40 ? 'text-amber-600' : 'text-gray-500',
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

      {/* ── Zone 2: Overdue Alert ─────────────────────────────────────────── */}
      {overdueTasks.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h2 className="text-xs font-bold text-red-700 uppercase tracking-widest mb-2">
            🔴 Vadesi Geçmiş Görevler ({overdue})
          </h2>
          <div className="space-y-1">
            {overdueTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs text-red-600">
                <span className="font-semibold truncate">{t.title}</span>
                <span className="text-red-400 shrink-0">
                  — {t.due_date && new Date(t.due_date + 'T00:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </span>
              </div>
            ))}
            {overdue > 3 && (
              <div className="text-xs text-red-400 mt-1">+{overdue - 3} görev daha…</div>
            )}
          </div>
        </div>
      )}

      {/* ── Client island: task list + CRUD ───────────────────────────────── */}
      <TasksClient
        initialTasks={tasks}
        initialCustomers={customers}
        initialSales={sales}
      />

    </div>
  )
}
