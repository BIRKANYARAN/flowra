'use client'
// ─────────────────────────────────────────────────────────────────────────────
// components/dashboard/views/shared.tsx
//
// Shared types, formatters and small building blocks for the role dashboards.
// ─────────────────────────────────────────────────────────────────────────────

import React, { ReactNode } from 'react'
import Link from 'next/link'

// ── Payload types (mirror /api/dashboard/home) ──────────────────────────────────

export interface HomePayload {
  role: 'admin' | 'manager' | 'viewer'
  summary: {
    situation: {
      composite_score: number
      status: 'healthy' | 'caution' | 'at-risk' | 'critical'
      situation_line: string
      components: Record<string, number>
    }
    kpis: {
      revenue_mtd_try: number
      net_income_mtd_try: number
      cash_balance_try: number
      runway_months: number | null
      accounts_receivable_try: number
      overdue_receivable_try: number
      active_alerts: number
      pending_workflows: number
    }
    top_alerts: Array<{
      id: string; severity: 'info' | 'warning' | 'critical'
      title: string; detail: string
      action_label: string | null; action_href: string | null; amount_try: number | null
    }>
    partner_strip: Array<{
      partner_id: string; name: string; share_pct: number
      loan_outstanding_try: number; burden_score: number
      health: 'healthy' | 'attention' | 'critical'
    }>
    computed_at: string
  }
  charts: {
    monthly: Array<{ label: string; ym: string; revenue: number; expense: number; net: number }>
    expenseBreakdown: Array<{ name: string; value: number }>
    topCustomers: Array<{ name: string; value: number }>
    pipeline: { open_count: number; open_total: number; items: Array<{ id: string; customer_name: string; total: number; status: string; valid_until: string | null }> }
  }
}

// ── Formatters ──────────────────────────────────────────────────────────────────

export function fmtTRY(n: number): string {
  return '₺' + Math.round(Number(n) || 0).toLocaleString('tr-TR')
}
export function fmtCompact(n: number): string {
  const v = Number(n) || 0   // null/undefined/NaN → 0 (never render "₺NaN")
  const a = Math.abs(v)
  if (a >= 1e9) return '₺' + (v / 1e9).toFixed(1).replace('.', ',') + 'Mr'
  if (a >= 1e6) return '₺' + (v / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return '₺' + (v / 1e3).toFixed(0) + 'B'
  return '₺' + Math.round(v).toLocaleString('tr-TR')
}

export const STATUS_STYLE: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  healthy:   { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  label: 'Sağlıklı' },
  caution:   { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',    label: 'Dikkat' },
  'at-risk': { dot: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',   label: 'Risk' },
  critical:  { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',      label: 'Kritik' },
}

// ── KPI tile ─────────────────────────────────────────────────────────────────────

export function KpiTile({
  label, value, sub, tone = 'neutral', accent, href,
}: {
  label: string; value: string; sub?: string
  tone?: 'neutral' | 'positive' | 'negative'
  accent?: string
  href?: string
}) {
  const valueColor =
    tone === 'negative' ? 'text-red-600' : tone === 'positive' ? 'text-emerald-600' : 'text-[#0f172a]'
  const inner = (
    <div className="relative fl-card px-4 py-3.5 h-full flex flex-col justify-center overflow-hidden transition-all hover:shadow-soft-lg hover:-translate-y-px">
      {accent && <span className="absolute left-0 top-0 h-full w-1 rounded-l-2xl" style={{ background: accent }} />}
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#94a3b8] truncate">{label}</p>
      <p className={`text-[23px] font-extrabold tabular-nums leading-tight tracking-tight mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#94a3b8] truncate mt-1">{sub}</p>}
    </div>
  )
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}

// ── Alert list ─────────────────────────────────────────────────────────────────

const SEV_STYLE: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50/40',
  warning:  'border-l-amber-500 bg-amber-50/40',
  info:     'border-l-blue-400 bg-blue-50/30',
}

export function AlertList({ alerts }: { alerts: HomePayload['summary']['top_alerts'] }) {
  if (!alerts.length) {
    return <EmptyHint icon="✓" text="Aktif uyarı yok — her şey yolunda." />
  }
  return (
    <ul className="flex flex-col gap-1.5 overflow-auto h-full pr-0.5">
      {alerts.map(a => {
        const body = (
          <div className={`border-l-[3px] rounded-r px-2.5 py-1.5 ${SEV_STYLE[a.severity] ?? SEV_STYLE.info}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-[#0f172a] truncate">{a.title}</span>
              {a.amount_try != null && <span className="text-[11px] font-bold tabular-nums text-[#334155] shrink-0">{fmtCompact(a.amount_try)}</span>}
            </div>
            <p className="text-[11px] text-[#64748b] truncate">{a.detail}</p>
          </div>
        )
        return (
          <li key={a.id}>
            {a.action_href ? <Link href={a.action_href} className="block hover:opacity-80 transition-opacity">{body}</Link> : body}
          </li>
        )
      })}
    </ul>
  )
}

export function EmptyHint({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-1 py-4">
      <span className="text-2xl opacity-60">{icon}</span>
      <span className="text-[12px] text-[#94a3b8] max-w-[80%]">{text}</span>
    </div>
  )
}

// ── Simple ranked list (top customers, pipeline) ────────────────────────────────

export function RankedList({
  rows,
}: {
  rows: Array<{ key: string; name: string; value: string; meta?: string; href?: string }>
}) {
  if (!rows.length) return <EmptyHint icon="—" text="Veri yok." />
  return (
    <ul className="flex flex-col divide-y divide-[#f1f5f9] overflow-auto h-full">
      {rows.map(r => {
        const body = (
          <div className="flex items-center justify-between gap-2 py-1.5 px-1">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-[#0f172a] truncate">{r.name}</p>
              {r.meta && <p className="text-[10px] text-[#94a3b8] truncate">{r.meta}</p>}
            </div>
            <span className="text-[12px] font-bold tabular-nums text-[#334155] shrink-0">{r.value}</span>
          </div>
        )
        return <li key={r.key}>{r.href ? <Link href={r.href} className="block hover:bg-[#f8fafc] transition-colors">{body}</Link> : body}</li>
      })}
    </ul>
  )
}

// ── Lens switcher ─────────────────────────────────────────────────────────────

export type Lens = 'ceo' | 'cfo' | 'sales'
export const LENS_LABEL: Record<Lens, string> = { ceo: 'Yönetici', cfo: 'Finans', sales: 'Satış' }

export function LensSwitcher({ value, onChange }: { value: Lens; onChange: (l: Lens) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg bg-[#f1f5f9] p-0.5 gap-0.5">
      {(['ceo', 'cfo', 'sales'] as Lens[]).map(l => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${
            value === l ? 'bg-white text-[#7c3aed] shadow-sm' : 'text-[#64748b] hover:text-[#334155]'
          }`}
        >
          {LENS_LABEL[l]}
        </button>
      ))}
    </div>
  )
}

export function StatusBadge({ status }: { status: keyof typeof STATUS_STYLE }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.caution
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </span>
  )
}
