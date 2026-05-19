// ── TasksContent — Planning hub / tasks tab ───────────────────────────────────

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import type { Task, Customer, Sale } from '@/types'
import TasksClient from '@/app/dashboard/tasks/TasksClient'

function overdueCount(tasks: Task[], today: string): number {
  return tasks.filter(t => t.status === 'open' && t.due_date != null && t.due_date < today).length
}

function dueThisWeek(tasks: Task[], today: string): number {
  const weekOut = addDays(today, 7)
  return tasks.filter(t =>
    t.status === 'open' && t.due_date != null && t.due_date >= today && t.due_date <= weekOut
  ).length
}

function completionRate(tasks: Task[]): number {
  const closed = tasks.filter(t => t.status === 'done' || t.status === 'cancelled').length
  return tasks.length > 0 ? Math.round((closed / tasks.length) * 100) : 0
}

function tasksByStatus(tasks: Task[]): Record<string, number> {
  const counts: Record<string, number> = { open: 0, done: 0, cancelled: 0 }
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1
  return counts
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

interface Props { companyId: string }

export async function TasksContent({ companyId }: Props) {
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

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
      .select('id, customer_name, total_try:total, sale_date, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: false })
      .limit(100),
  ])

  const tasks = ((tasksRes.data ?? []) as (Task & { customers?: { name: string } | null })[])
    .map(t => ({
      ...t,
      customer_name: t.customer_name ?? (
        typeof t.customers === 'object' && t.customers !== null
          ? (t.customers as { name: string }).name
          : null
      ),
      customers: undefined,
    })) as Task[]

  const customers    = (customersRes.data ?? []) as Pick<Customer, 'id' | 'name'>[]
  const sales        = (salesRes.data     ?? []) as Pick<Sale, 'id' | 'customer_name' | 'total_try' | 'sale_date' | 'created_at'>[]
  const statusCounts = tasksByStatus(tasks)
  const overdue      = overdueCount(tasks, today)
  const thisWeek     = dueThisWeek(tasks, today)
  const compRate     = completionRate(tasks)
  const overdueTasks = tasks.filter(t => t.status === 'open' && t.due_date != null && t.due_date < today).slice(0, 3)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-black text-[#0f172a] tracking-tight">Görevler</h2>
        <p className="text-xs text-[#94a3b8] mt-0.5">Hafif CRM — takip ve hatırlatma · {tasks.length} kayıt</p>
      </div>

      {/* KPI Strip */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          {[
            { label: 'Açık Görev',       value: String(statusCounts.open ?? 0),   sub: 'bekliyor',          color: statusCounts.open > 0 ? 'text-info-text' : 'text-[#94a3b8]' },
            { label: 'Vadesi Geçmiş',    value: overdue > 0 ? String(overdue) : '—', sub: overdue > 0 ? 'hemen ele alınmalı' : 'gecikmiş yok ✓', color: overdue > 0 ? 'text-neg' : 'text-pos-text' },
            { label: 'Bu Hafta Vade',    value: thisWeek > 0 ? String(thisWeek) : '—', sub: thisWeek > 0 ? '7 gün içinde' : 'yaklaşan yok', color: thisWeek > 0 ? 'text-warn-text' : 'text-[#94a3b8]' },
            { label: 'Tamamlanma Oranı', value: tasks.length > 0 ? `%${compRate}` : '—', sub: `${statusCounts.done ?? 0} tamamlandı · ${statusCounts.cancelled ?? 0} iptal`, color: compRate >= 70 ? 'text-pos-text' : compRate >= 40 ? 'text-warn-text' : 'text-[#64748b]' },
          ].map((card, i) => (
            <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Overdue alert */}
      {overdueTasks.length > 0 && (
        <div className="bg-neg-light border border-neg-light rounded p-4">
          <h3 className="text-xs font-bold text-neg-text uppercase tracking-widest mb-2">🔴 Vadesi Geçmiş Görevler ({overdue})</h3>
          <div className="space-y-1">
            {overdueTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs text-neg">
                <span className="font-semibold truncate">{t.title}</span>
                <span className="text-neg shrink-0">
                  — {t.due_date && new Date(t.due_date + 'T00:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </span>
              </div>
            ))}
            {overdue > 3 && <div className="text-xs text-neg mt-1">+{overdue - 3} görev daha…</div>}
          </div>
        </div>
      )}

      <TasksClient initialTasks={tasks} initialCustomers={customers} initialSales={sales} />

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Görevler tahsilat ve satış akışıyla koordineli yönetilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/commercial?tab=collections" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Tahsilat →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=pipeline" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Satış Akışı →
          </Link>
        </div>
      </div>
    </div>
  )
}
