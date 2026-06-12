// ── ExpensesCommandBar — Gider İstihbarat Şeridi ─────────────────────────────
//
// Server component — renders above ExpensesClient with zero client JS.
// Shows current-month burn intelligence vs prior month.
//
// Zones:
//   LEFT  — 4 KPI pills: Bu Ay · Geçen Ay · MoM Δ · Günlük Hız
//   RIGHT — Top category signal + projected end-of-month burn
//
// Data: two parallel Supabase queries (current month + previous month).

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { fmtCompact as fmt } from '@/lib/format'

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Genel', rent: 'Kira', salary: 'Maaş', utilities: 'Faturalar',
  marketing: 'Pazarlama', logistics: 'Lojistik', software: 'Yazılım',
  equipment: 'Ekipman', tax: 'Vergi', interest: 'Faiz', board_fee: 'Yönetim Ücreti',
  principal: 'Anapara', dividend: 'Kâr Payı', partner_loan: 'Ortak Finansmanı', other: 'Diğer',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export async function ExpensesCommandBar({ companyId }: Props) {
  const supabase = createClient()
  const now      = new Date()
  const year     = now.getFullYear()
  const mon      = String(now.getMonth() + 1).padStart(2, '0')
  const today    = now.toISOString().slice(0, 10)

  // Current month window
  const curFrom = `${year}-${mon}-01`

  // Previous month window
  const prevDate   = new Date(year, now.getMonth() - 1, 1)
  const prevYear   = prevDate.getFullYear()
  const prevMon    = String(prevDate.getMonth() + 1).padStart(2, '0')
  const prevFrom   = `${prevYear}-${prevMon}-01`
  const prevTo     = `${year}-${mon}-01` // exclusive: up to first of current month

  // Days elapsed in current month & days remaining
  const dayOfMonth   = now.getDate()
  const daysInMonth  = new Date(year, now.getMonth() + 1, 0).getDate()
  const daysLeft     = daysInMonth - dayOfMonth

  // ── Parallel queries ────────────────────────────────────────────────────────
  const [curRes, prevRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount_try, category')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', curFrom)
      .lte('expense_date', today),

    supabase
      .from('expenses')
      .select('amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', prevFrom)
      .lt('expense_date', prevTo),
  ])

  const curRows  = curRes.data  ?? []
  const prevRows = prevRes.data ?? []

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const curTotal  = curRows.reduce((s, r) => s + Number(r.amount_try ?? 0), 0)
  const prevTotal = prevRows.reduce((s, r) => s + Number(r.amount_try ?? 0), 0)

  // MoM delta
  const momDelta    = curTotal - prevTotal
  const momDeltaPct = prevTotal > 0 ? (momDelta / prevTotal) * 100 : null

  // Daily run rate and projected end-of-month
  const dailyRate   = dayOfMonth > 0 ? curTotal / dayOfMonth : 0
  const projected   = curTotal + dailyRate * daysLeft

  // Top category this month
  const catMap = new Map<string, number>()
  for (const r of curRows) {
    const key = r.category ?? 'other'
    catMap.set(key, (catMap.get(key) ?? 0) + Number(r.amount_try ?? 0))
  }
  const topCat = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  const topCatPct = curTotal > 0 && topCat ? (topCat[1] / curTotal) * 100 : 0

  // Signal: is burn accelerating?
  const accelerating = momDeltaPct !== null && momDeltaPct > 15
  const decelerating = momDeltaPct !== null && momDeltaPct < -15

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (curTotal === 0 && prevTotal === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f8fafc] border border-[#e8eaef] rounded text-xs text-[#94a3b8]">
        Bu ay henüz gider kaydı yok.
      </div>
    )
  }

  return (
    <div className="space-y-2">

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Bu Ay */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e8eaef] rounded-xl shadow-soft">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Bu Ay</span>
          <span className="text-sm font-extrabold tabular-nums text-[#0f172a]">{fmt(curTotal)}</span>
          <span className="text-[9px] text-[#94a3b8]">{dayOfMonth}. gün</span>
        </div>

        {/* Geçen Ay */}
        {prevTotal > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e8eaef] rounded-xl shadow-soft">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Geçen Ay</span>
            <span className="text-sm font-extrabold tabular-nums text-[#64748b]">{fmt(prevTotal)}</span>
          </div>
        )}

        {/* MoM Delta */}
        {momDeltaPct !== null && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
            accelerating
              ? 'bg-neg-light border-neg-light'
              : decelerating
              ? 'bg-pos-light border-pos-light'
              : 'bg-white border-[#e8eaef]'
          }`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#64748b]">MoM</span>
            <span className={`text-sm font-extrabold tabular-nums ${
              accelerating ? 'text-neg' : decelerating ? 'text-pos-text' : 'text-[#334155]'
            }`}>
              {momDelta >= 0 ? '+' : ''}{momDeltaPct.toFixed(0)}%
            </span>
            <span className="text-[9px] text-[#94a3b8]">
              {momDelta >= 0 ? '↑' : '↓'} {fmt(Math.abs(momDelta))}
            </span>
          </div>
        )}

        {/* Günlük Hız */}
        {dailyRate > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e8eaef] rounded-xl shadow-soft">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Günlük</span>
            <span className="text-sm font-extrabold tabular-nums text-warn-text">{fmt(dailyRate)}</span>
            <span className="text-[9px] text-[#94a3b8]">/gün</span>
          </div>
        )}

        {/* Link to cashflow */}
        <Link href="/dashboard/finance?tab=cashflow"
          className="ml-auto text-[10px] text-brand-light font-semibold hover:text-brand transition-colors shrink-0">
          Nakit Akışı →
        </Link>
      </div>

      {/* ── Projection + Top Category ──────────────────────────────────────── */}
      {(projected > 0 || topCat) && (
        <div className={`flex items-center justify-between gap-4 px-4 py-2.5 rounded border text-xs ${
          accelerating
            ? 'bg-neg-light border-neg-light'
            : 'bg-[#f8fafc] border-[#e8eaef]'
        }`}>

          {/* Left: projection */}
          {projected > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#64748b]">
                Ay Sonu Tahmini
              </span>
              <span className="text-sm font-black text-[#0f172a] tabular-nums">
                {fmt(projected)}
              </span>
              {prevTotal > 0 && (
                <span className="text-[10px] text-[#94a3b8]">
                  ({daysLeft} gün kaldı · {fmt(dailyRate)}/gün)
                </span>
              )}
            </div>
          )}

          {/* Right: top category */}
          {topCat && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#64748b]">En büyük kalem:</span>
              <span className="text-[10px] font-bold text-[#334155]">
                {CATEGORY_LABELS[topCat[0]] ?? topCat[0]}
              </span>
              <span className="text-[10px] font-black text-warn-text tabular-nums">
                {fmt(topCat[1])}
              </span>
              <span className="text-[10px] text-[#94a3b8]">
                (%{topCatPct.toFixed(0)})
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Accelerating burn alert ────────────────────────────────────────── */}
      {accelerating && (
        <div className="flex items-center gap-2 px-4 py-2 bg-neg-light border border-neg-light rounded">
          <span className="w-1.5 h-1.5 bg-neg-light rounded-full animate-pulse shrink-0" />
          <span className="text-[10px] font-bold text-neg-text">
            Gider hızlanıyor — geçen aya kıyasla %{momDeltaPct!.toFixed(0)} artış.
          </span>
          <Link href="/dashboard/finance?tab=cashflow"
            className="ml-auto text-[10px] font-semibold text-neg hover:text-neg-text shrink-0">
            Nakit Akışına Bak →
          </Link>
        </div>
      )}

    </div>
  )
}
