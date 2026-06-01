// ── WhatIf scenario logic — extracted from WhatIfClient.tsx ────────────────────
// Pure compute (computeScenario) + types + localStorage/DB persistence helpers.
// No React; computeScenario is independently testable.

export const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
export function fmt(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return FMT.format(n)
}
export function fmtFull(n: number) {
  return (n < 0 ? '−' : '') + FMT.format(Math.abs(n))
}
export function pct(v: number) { return `${(v * 100).toFixed(1).replace('.', ',')}%` }

export interface Baseline {
  revenue:            number
  cogs:               number
  expenses:           number
  salesVat:           number
  purchaseVat:        number
  monthlyDebtService: number
}

export interface SavedScenario {
  id:          string
  name:        string
  savedAt:     string
  is_baseline?: boolean
  sliders: {
    revChange:      number
    expChange:      number
    cogsChange:     number
    collDelay:      number
    debtChange:     number
    taxRateOverride: number
  }
  summary: {
    netIncome:       number
    grossMarginPct:  number
    distributable:   number
    runwayMonths:    number | null
  }
}

export const STORAGE_KEY = 'flowra_whatif_scenarios'
export const MAX_SAVED   = 20

// ── localStorage helpers (offline / optimistic fallback) ──────────────────────
export function loadLocal(): SavedScenario[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return raw ? (JSON.parse(raw) as SavedScenario[]) : []
  } catch { return [] }
}
export function persistLocal(scenarios: SavedScenario[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios)) } catch { /* quota */ }
}

// ── DB helpers — best-effort, errors are non-fatal ────────────────────────────
export async function fetchDBScenarios(): Promise<SavedScenario[]> {
  try {
    const res  = await fetch('/api/simulation/scenarios', { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json() as { scenarios?: Array<{ id: string; name: string; is_baseline: boolean; inputs: { sliders: SavedScenario['sliders'] }; summary: SavedScenario['summary']; created_at: string }> }
    return (json.scenarios ?? []).map(r => ({
      id:          r.id,
      name:        r.name,
      savedAt:     r.created_at,
      is_baseline: r.is_baseline ?? false,
      sliders: r.inputs?.sliders ?? { revChange: 0, expChange: 0, cogsChange: 0, collDelay: 0, debtChange: 0, taxRateOverride: 25 },
      summary: r.summary ?? { netIncome: 0, grossMarginPct: 0, distributable: 0, runwayMonths: null },
    }))
  } catch { return [] }
}

export async function saveDBScenario(
  name: string,
  sliders: SavedScenario['sliders'],
  summary: SavedScenario['summary'],
): Promise<string | null> {
  try {
    const res  = await fetch('/api/simulation/scenarios', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, inputs: { sliders }, summary }),
    })
    if (!res.ok) return null
    const json = await res.json() as { scenario?: { id: string } }
    return json.scenario?.id ?? null
  } catch { return null }
}

export async function deleteDBScenario(id: string): Promise<void> {
  // UUIDs from DB; skip for local-only IDs (timestamp strings)
  if (!id.includes('-')) return
  try {
    await fetch(`/api/simulation/scenarios/${id}`, { method: 'DELETE' })
  } catch { /* non-fatal */ }
}

export async function markDBBaseline(id: string): Promise<boolean> {
  if (!id.includes('-')) return false
  try {
    const res = await fetch(`/api/simulation/scenarios/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_baseline: true }),
    })
    return res.ok
  } catch { return false }
}

// ── Pure scenario compute (no React state — usable outside component) ─────────
export function computeScenario(sliders: SavedScenario['sliders'], baseline: Baseline) {
  const revenue  = Math.max(0, baseline.revenue  * (1 + sliders.revChange  / 100))
  const cogs     = Math.max(0, baseline.cogs     * (1 + sliders.cogsChange / 100))
  const expenses = Math.max(0, baseline.expenses * (1 + sliders.expChange  / 100))
  const debtSvc  = Math.max(0, baseline.monthlyDebtService * (1 + sliders.debtChange / 100))
  const grossProfit    = revenue - cogs
  const grossMarginPct = revenue > 0 ? grossProfit / revenue : 0
  const ebitda         = grossProfit - expenses
  const ebt            = ebitda - debtSvc
  const tax            = ebt > 0 ? ebt * sliders.taxRateOverride / 100 : 0
  const netIncome      = ebt - tax
  const distributable  = Math.max(0, netIncome * 0.95) // after 5% legal reserve
  const monthlyBurn    = expenses + debtSvc
  const runwayMonths   = netIncome < 0 && monthlyBurn > 0
    ? Math.max(0, revenue / monthlyBurn)
    : null
  return { revenue, cogs, grossProfit, grossMarginPct, expenses, debtSvc, ebitda, ebt, tax, netIncome, distributable, runwayMonths }
}
