// ─────────────────────────────────────────────────────────────────────────────
// lib/services/decision-context/decision-context.pure.ts
//
// Client-safe pure helpers for the Decision Context Engine. Extracted from
// decision-context.service.ts so 'use client' components (DecisionContextTab)
// can import them without dragging the server-only service chain
// (PartnerService → auth-context → next/headers) into the bundle.
// The service re-exports these for backward compatibility.
//
// The ContextSnapshot type is imported type-only (erased at build), so this
// module carries no runtime dependency on the service.
// ─────────────────────────────────────────────────────────────────────────────

import type { ContextSnapshot } from './decision-context.service'

/**
 * Compute how much has changed between two snapshots (numeric distance 0–100).
 * Compares key numeric fields across all four state groups and returns a
 * weighted average of relative differences, clamped to [0, 100].
 */
export function computeSnapshotDrift(prev: ContextSnapshot, curr: ContextSnapshot): number {
  // Each entry: [prevValue, currValue, maxScale (used to normalise)]
  const comparisons: Array<[number, number, number]> = [
    // Financial state
    [prev.financial_state.cash_try,             curr.financial_state.cash_try,             1_000_000],
    [prev.financial_state.cash_runway_months,   curr.financial_state.cash_runway_months,   24],
    [prev.financial_state.net_income_try,        curr.financial_state.net_income_try,        500_000],
    [prev.financial_state.composite_score,       curr.financial_state.composite_score,       100],
    // Partner state
    [prev.partner_state.total_partner_debt_try,  curr.partner_state.total_partner_debt_try,  1_000_000],
    [prev.partner_state.active_partners,         curr.partner_state.active_partners,         20],
    [prev.partner_state.overfinanced_partners,   curr.partner_state.overfinanced_partners,   10],
    // Receivables state
    [prev.receivables_state.total_receivables_try,   curr.receivables_state.total_receivables_try,   1_000_000],
    [prev.receivables_state.overdue_receivables_try, curr.receivables_state.overdue_receivables_try, 500_000],
    [prev.receivables_state.overdue_ratio,           curr.receivables_state.overdue_ratio,           100],
    // Governance state
    [prev.governance_state.open_period_days,  curr.governance_state.open_period_days,  365],
    [prev.governance_state.pending_workflows, curr.governance_state.pending_workflows, 50],
    [prev.governance_state.recent_resolutions, curr.governance_state.recent_resolutions, 30],
  ]

  let totalDrift = 0
  for (const [p, c, scale] of comparisons) {
    const diff = Math.abs(c - p)
    const normalised = scale > 0 ? Math.min(1, diff / scale) : 0
    totalDrift += normalised
  }

  const avgDrift = totalDrift / comparisons.length
  return Math.round(Math.min(100, avgDrift * 100))
}

/**
 * Returns a human-readable title for what changed most between two snapshots.
 */
export function summarizeChanges(prev: ContextSnapshot, curr: ContextSnapshot): string {
  const candidates: Array<{ label: string; relChange: number }> = [
    {
      label: 'nakit',
      relChange: prev.financial_state.cash_try !== 0
        ? Math.abs((curr.financial_state.cash_try - prev.financial_state.cash_try) / Math.abs(prev.financial_state.cash_try))
        : curr.financial_state.cash_try !== 0 ? 1 : 0,
    },
    {
      label: 'nakit ömrü',
      relChange: prev.financial_state.cash_runway_months !== 0
        ? Math.abs((curr.financial_state.cash_runway_months - prev.financial_state.cash_runway_months) / Math.abs(prev.financial_state.cash_runway_months))
        : curr.financial_state.cash_runway_months !== 0 ? 1 : 0,
    },
    {
      label: 'net gelir',
      relChange: prev.financial_state.net_income_try !== 0
        ? Math.abs((curr.financial_state.net_income_try - prev.financial_state.net_income_try) / Math.abs(prev.financial_state.net_income_try))
        : curr.financial_state.net_income_try !== 0 ? 1 : 0,
    },
    {
      label: 'bileşik skor',
      relChange: prev.financial_state.composite_score !== 0
        ? Math.abs((curr.financial_state.composite_score - prev.financial_state.composite_score) / Math.abs(prev.financial_state.composite_score))
        : curr.financial_state.composite_score !== 0 ? 1 : 0,
    },
    {
      label: 'ortak borcu',
      relChange: prev.partner_state.total_partner_debt_try !== 0
        ? Math.abs((curr.partner_state.total_partner_debt_try - prev.partner_state.total_partner_debt_try) / Math.abs(prev.partner_state.total_partner_debt_try))
        : curr.partner_state.total_partner_debt_try !== 0 ? 1 : 0,
    },
    {
      label: 'toplam alacak',
      relChange: prev.receivables_state.total_receivables_try !== 0
        ? Math.abs((curr.receivables_state.total_receivables_try - prev.receivables_state.total_receivables_try) / Math.abs(prev.receivables_state.total_receivables_try))
        : curr.receivables_state.total_receivables_try !== 0 ? 1 : 0,
    },
    {
      label: 'gecikme oranı',
      relChange: prev.receivables_state.overdue_ratio !== 0
        ? Math.abs((curr.receivables_state.overdue_ratio - prev.receivables_state.overdue_ratio) / Math.abs(prev.receivables_state.overdue_ratio))
        : curr.receivables_state.overdue_ratio !== 0 ? 1 : 0,
    },
    {
      label: 'bekleyen iş akışı',
      relChange: prev.governance_state.pending_workflows !== 0
        ? Math.abs((curr.governance_state.pending_workflows - prev.governance_state.pending_workflows) / Math.abs(prev.governance_state.pending_workflows))
        : curr.governance_state.pending_workflows !== 0 ? 1 : 0,
    },
  ]

  const revenue_trend_changed =
    prev.financial_state.revenue_trend !== curr.financial_state.revenue_trend
  const status_changed =
    prev.financial_state.situation_status !== curr.financial_state.situation_status

  candidates.sort((a, b) => b.relChange - a.relChange)
  const top = candidates[0]

  const parts: string[] = []

  if (top.relChange > 0) {
    parts.push(`En büyük değişim: ${top.label}`)
  }
  if (status_changed) {
    parts.push(`durum ${prev.financial_state.situation_status} → ${curr.financial_state.situation_status}`)
  }
  if (revenue_trend_changed) {
    parts.push(`gelir trendi ${prev.financial_state.revenue_trend} → ${curr.financial_state.revenue_trend}`)
  }

  if (parts.length === 0) return 'Anlamlı bir değişim tespit edilmedi.'
  return parts.join('; ') + '.'
}

/**
 * Classify snapshot age based on capturedAt ISO timestamp.
 * fresh  = < 24 hours
 * stale  = >= 24 hours and < 7 days
 * outdated = >= 7 days
 */
export function classifySnapshotAge(
  capturedAt: string,
  nowIso: string,
): 'fresh' | 'stale' | 'outdated' {
  const capturedMs = new Date(capturedAt).getTime()
  const nowMs      = new Date(nowIso).getTime()
  const diffHours  = (nowMs - capturedMs) / (1000 * 60 * 60)

  if (diffHours < 24)         return 'fresh'
  if (diffHours < 7 * 24)     return 'stale'
  return 'outdated'
}

/**
 * Build a clean annotation tag string from an array of tags.
 * Rules: trim whitespace, deduplicate, keep max 5, join with ", ".
 */
export function buildAnnotationTag(tags: string[]): string {
  const seen = new Set<string>()
  const result: string[] = []

  for (const tag of tags) {
    const t = tag.trim()
    if (!t) continue
    if (seen.has(t)) continue
    seen.add(t)
    result.push(t)
    if (result.length === 5) break
  }

  return result.join(', ')
}
