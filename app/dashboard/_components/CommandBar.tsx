// ── CommandBar — executive pulse strip ────────────────────────────────────────
//
// Single-row status bar at the top of the Executive Command Center.
// Answers at a glance: "What period, what's the company pulse, what can I do?"
//
// Three zones:
//   LEFT  — Identity: period label + live status badges (alerts, KDV)
//   MID   — Task reminder pills (overdue highlighted red)
//   RIGHT — Quick-action CTA buttons

import Link from 'next/link'
import type { TaskReminder } from '@/lib/finance/executive-summary'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  periodLabel:   string
  alertCount:    number
  vatNet:        number         // >0 = payable
  taskReminders: TaskReminder[]
  cashLabel:     string         // pre-formatted "₺1.24M" etc.
  runwayDays:    number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function runwayBadge(days: number | null): { text: string; cls: string } | null {
  if (days === null) return null
  if (days <= 30)   return { text: `${days}g runway 🔥`, cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days <= 90)   return { text: `${days}g runway ⚠`, cls: 'bg-amber-100 text-amber-700 border-amber-200' }
  return { text: `${days}g runway ✓`, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
}

function fmtVat(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
  if (abs >= 1_000)     return `₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}K`
  return `₺${Math.round(abs).toLocaleString('tr-TR')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandBar({ periodLabel, alertCount, vatNet, taskReminders, cashLabel, runwayDays }: Props) {
  const today   = new Date().toISOString().slice(0, 10)
  const runway  = runwayBadge(runwayDays)
  const tasks   = taskReminders.slice(0, 3)
  const vatPayable = vatNet > 50

  return (
    <div className="flex items-center gap-2 flex-wrap min-h-[36px]">

      {/* ── Identity & pulse ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Period */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-gray-300">CFO</span>
          <h1 className="text-sm font-black text-gray-900 tracking-tight capitalize leading-none">
            {periodLabel}
          </h1>
        </div>

        {/* Cash position badge */}
        {cashLabel && (
          <Link href="/dashboard/cashflow"
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors border border-gray-200 tabular-nums">
            {cashLabel}
          </Link>
        )}

        {/* Runway badge */}
        {runway && (
          <Link href="/dashboard/simulation"
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 ${runway.cls}`}>
            {runway.text}
          </Link>
        )}

        {/* Alert badge */}
        {alertCount > 0 && (
          <Link href="/dashboard/alerts"
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 transition-colors">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            {alertCount} uyarı
          </Link>
        )}

        {/* KDV payable badge */}
        {vatPayable && (
          <Link href="/dashboard/analytics"
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200 transition-colors">
            KDV {fmtVat(vatNet)} ⬆
          </Link>
        )}
      </div>

      {/* ── Task reminder pills ─────────────────────────────────────────────── */}
      {tasks.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">Görev</span>
          {tasks.map(t => {
            const isOverdue = t.due_date < today
            return (
              <Link key={t.id} href="/dashboard/tasks"
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold flex-shrink-0 transition-colors ${
                  isOverdue
                    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                    : 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100'
                }`}>
                {isOverdue && <span className="font-black text-[8px]">!</span>}
                <span className="truncate max-w-[88px]">{t.title}</span>
              </Link>
            )
          })}
          {taskReminders.length > 3 && (
            <Link href="/dashboard/tasks" className="text-[10px] text-gray-400 font-bold">
              +{taskReminders.length - 3}
            </Link>
          )}
        </div>
      )}

      {/* ── Quick actions ───────────────────────────────────────────────────── */}
      <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
        <Link href="/dashboard/proformas/new"
          className="px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-bold hover:bg-gray-700 transition-colors">
          + Proforma
        </Link>
        <Link href="/dashboard/sales/new"
          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition-colors">
          + Satış
        </Link>
        <Link href="/dashboard/collections"
          className="px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-[11px] font-bold hover:bg-primary-700 transition-colors">
          + Tahsilat
        </Link>
        <Link href="/dashboard/expenses"
          className="px-2.5 py-1.5 rounded-lg bg-orange-500 text-white text-[11px] font-bold hover:bg-orange-600 transition-colors">
          + Gider
        </Link>
      </div>

    </div>
  )
}
