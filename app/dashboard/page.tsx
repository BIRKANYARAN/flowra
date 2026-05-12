export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard — Executive Command Center
//
// FAZ T1: Product Transformation — 889 LOC monolith → decomposed cockpit
//
// Three-layer architecture:
//   LAYER 1 — CommandBar     : company pulse (period, cash, runway, alerts)
//   LAYER 2 — Command Surface: Gündem (decisions) LEFT + Vital Signals RIGHT
//   LAYER 3 — Intelligence   : cashflow chart + P&L waterfall + vergi + ortak
//
// Data: single call to getExecutiveSummary() — all computation centralized
//   → lib/finance/executive-summary.ts
//
// Rendering: four RSC sub-components — each has ONE job, max ~130 LOC
//   → _components/CommandBar.tsx
//   → _components/DecisionCards.tsx
//   → _components/ExecutiveKpis.tsx
//   → _components/IntelligencePanel.tsx
// ═══════════════════════════════════════════════════════════════════════════════

import { redirect }              from 'next/navigation'
import { createClient }          from '@/lib/supabase-server'
import { resolveCompanyId }      from '@/lib/resolve-company'
import { getExecutiveSummary }   from '@/lib/finance/executive-summary'
import { FxWidget }              from '@/components/layout/FxWidget'
import { CommandBar }            from './_components/CommandBar'
import { DecisionCards }         from './_components/DecisionCards'
import { ExecutiveKpis }         from './_components/ExecutiveKpis'
import { IntelligencePanel }     from './_components/IntelligencePanel'

// ── Formatting helper (for cashLabel prop) ────────────────────────────────────

function fmt(n: number): string {
  const abs = Math.abs(Number(n || 0))
  const s   = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${s}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${s}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${s}₺${Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const supabase = createClient()
  let userId: string

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(userId, supabase) }
  catch {
    redirect('/auth')
  }

  // ── Data ──────────────────────────────────────────────────────────────────────
  const summary = await getExecutiveSummary(userId, companyId)

  const {
    period, metrics, pnl, equalization,
    openProformas, alertCount, taskReminders, decisions, fx,
  } = summary

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 max-w-6xl">

      {/* ── LAYER 1: Pulse strip ─────────────────────────────────────────────── */}
      <CommandBar
        periodLabel={period.label}
        alertCount={alertCount}
        vatNet={pnl.vatNet}
        taskReminders={taskReminders}
        cashLabel={fmt(metrics.cash.true_cash_position)}
        runwayDays={metrics.burn.runway_days}
      />

      {/* ── LAYER 2: Command surface ─────────────────────────────────────────── */}
      {/* LEFT: decision agenda (hero) | RIGHT: vital signals */}
      <div className="grid grid-cols-12 gap-3 items-start">

        {/* Gündem — decision cards (8/12 width) */}
        <div className="col-span-8">
          <DecisionCards
            decisions={decisions}
            decisionCount={decisions.length}
          />
        </div>

        {/* Vital Sinyaller — KPI stack (4/12 width) */}
        <div className="col-span-4">
          <ExecutiveKpis
            metrics={metrics}
            netAfterTax={pnl.netAfterTax}
            grossMarginPct={pnl.grossMarginPct}
          />
        </div>

      </div>

      {/* ── LAYER 3: Intelligence panel ─────────────────────────────────────── */}
      <IntelligencePanel
        pnl={pnl}
        metrics={metrics}
        equalization={equalization}
        openProformas={openProformas}
      />

      {/* ── FX strip ─────────────────────────────────────────────────────────── */}
      <FxWidget
        initialFx={{
          USD:        fx.USD,
          EUR:        fx.EUR,
          source:     fx.source,
          rate_date:  fx.rate_date,
          fetched_at: fx.fetched_at,
        }}
      />

    </div>
  )
}
