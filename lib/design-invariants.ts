// ─────────────────────────────────────────────────────────────────────────────
// lib/design-invariants.ts — Flowra Non-Negotiable Invariants
//
// PURPOSE:
//   This file documents the absolute rules that govern Flowra's UI, financial
//   logic, and system boundaries. It is referenced by every implementation
//   session and every code review.
//
// STATUS: DOCUMENTATION + CONSTANTS (not wired into runtime yet)
//   When a rule is violated, the fix is to correct the code — not remove the rule.
//   These constants may be used in lint rules, test assertions, or storybook
//   annotations in future phases.
//
// READ THIS BEFORE:
//   - Adding a new component
//   - Modifying any financial calculation
//   - Changing a server/client boundary
//   - Adding a new data display format
// ─────────────────────────────────────────────────────────────────────────────

// ── I. DISPLAY FORMATTING ─────────────────────────────────────────────────────

/**
 * NUMBER_FORMAT
 * All monetary values displayed in the UI go through lib/format.ts functions.
 * Raw .toLocaleString(), .toFixed(), or Intl.NumberFormat are forbidden in JSX.
 *
 * Canonical functions:
 *   fmtTRY(value)            → "₺1.234.567,89"
 *   fmtTRY(value, 0)         → "₺1.234.568"
 *   fmtCompact(value)        → "₺1,2M" | "₺340,5K"  (KPI strips only)
 *   fmtMoney(value, currency)→ multi-currency
 *   fmtPct(value)            → "%12,3"
 *   fmtDate(dateString)      → "15 May 2026"
 *   fmtFx(rate)              → "₺45,3877"
 *
 * Null/undefined/zero display rule:
 *   Null or undefined → "—" (em dash)
 *   Zero that is meaningful → fmtTRY(0) = "₺0,00"
 *   Zero during loading → skeleton, not "₺0,00"
 */
export const NUMBER_FORMAT = {
  canonical_import:    '@/lib/format',
  currency_fn:         'fmtTRY(value, decimals?)',
  compact_fn:          'fmtCompact(value) — KPI strips only',
  multicurrency_fn:    'fmtMoney(value, currency)',
  percentage_fn:       'fmtPct(value)',
  date_fn:             'fmtDate(isoString)',
  fx_fn:               'fmtFx(rate) — 4 decimal places',
  null_display:        '—',
  loading_display:     'skeleton (never ₺0,00 while loading)',
  negative_format:     '-₺value (never parentheses)',
  forbidden_patterns:  [
    '.toLocaleString()',
    '.toFixed()',
    'new Intl.NumberFormat(',
    'parseFloat(',
  ],
} as const

// ── II. TABLE DENSITY ─────────────────────────────────────────────────────────

/**
 * TABLE_DENSITY
 * All data tables follow a consistent density spec.
 * Tables are the PRIMARY data display pattern in Flowra — not card grids.
 *
 * Deviation from these values creates visual inconsistency across views.
 */
export const TABLE_DENSITY = {
  row_padding:         'py-2 px-4',
  row_padding_compact: 'py-1.5 px-4',
  header_padding:      'py-2.5 px-4',
  total_border:        'border-t-2 border-[#e2e8f0]',
  hover_state:         'hover:bg-[#f8fafc] transition-colors',
  divider:             'divide-y divide-[#f1f5f9]',
  number_cell:         'text-right font-mono tabular-nums',
  header_cell:         'text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]',
  container:           'bg-white border border-[#e2e8f0] rounded overflow-hidden',
  forbidden: {
    row_padding:  ['py-3', 'py-4', 'py-1', 'px-3', 'px-5'],
    card_as_list: 'Never use grid of cards for list data. Use tables.',
    zebra_stripes: 'No bg-gray-50 on alternating rows. Hover-only highlighting.',
  },
} as const

// ── III. COLOR PALETTE ────────────────────────────────────────────────────────

/**
 * COLOR_PALETTE
 * Flowra uses a closed semantic color system.
 * Arbitrary Tailwind colors (text-green-600, text-red-500) are forbidden.
 * All status colors go through the semantic aliases below.
 *
 * This palette is configured in tailwind.config.js.
 * Never use raw hex in JSX className strings.
 */
export const COLOR_PALETTE = {
  ink: {
    1: '#0f172a',   // primary text, nav background
    2: '#334155',   // body text, table cells
    3: '#64748b',   // secondary text, subtitles
    4: '#94a3b8',   // labels, captions
    5: '#cbd5e1',   // dividers, placeholders
  },
  surface: {
    1: '#ffffff',   // card backgrounds
    2: '#f8fafc',   // page background, table hover
    3: '#f1f5f9',   // table headers, input backgrounds
    border:  '#e2e8f0',  // all borders
    divider: '#f1f5f9',  // table row dividers
  },
  brand: {
    default: '#5b21b6',  // active nav, primary CTA
    light:   '#7c3aed',  // hover state
    subtle:  '#ede9fe',  // avatar bg, light tint
  },
  pos: {
    default: '#059669',  // positive values, healthy
    text:    '#065f46',  // text on light bg
    light:   '#d1fae5',  // background tint
  },
  neg: {
    default: '#dc2626',  // negative values, critical
    text:    '#991b1b',
    light:   '#fee2e2',
  },
  warn: {
    default: '#d97706',  // warning, caution
    text:    '#92400e',
    light:   '#fef3c7',
  },
  info: {
    default: '#2563eb',  // informational
    text:    '#1e40af',
    light:   '#dbeafe',
  },
  forbidden_tailwind: [
    'text-green-*',  'bg-green-*',
    'text-red-*',    'bg-red-*',
    'text-amber-*',  'bg-amber-*',
    'text-violet-*', 'bg-violet-*',
    'text-indigo-*', 'bg-indigo-*',
    'text-zinc-*',   'bg-zinc-*',
    'text-slate-*',  'bg-slate-*',
  ],
} as const

// ── IV. LABEL STYLE ───────────────────────────────────────────────────────────

/**
 * LABEL_STYLE
 * Section labels, table headers, and KPI labels share one canonical style.
 * Any deviation from this style creates visual inconsistency.
 *
 * This is the most commonly violated rule — every new component must check this.
 */
export const LABEL_STYLE = {
  section_label:     'text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]',
  table_header:      'text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]',
  kpi_label:         'text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5',
  kpi_sub:           'text-[0.65rem] text-[#94a3b8]',
  nav_group_header:  'text-[0.65rem] font-black uppercase tracking-widest text-white/20',
  forbidden_variants: [
    'text-xs font-semibold uppercase',           // wrong weight
    'text-[10px] font-bold uppercase',           // font-bold not font-black
    'text-xs font-black uppercase tracking-wide', // tracking-wide not tracking-widest
    'text-sm uppercase',                          // wrong size
  ],
} as const

// ── V. BUTTON SYSTEM ──────────────────────────────────────────────────────────

/**
 * PRIMARY_BUTTON
 * Button variants for Flowra. Primary is used sparingly (one per view max).
 * All variants use system-ui font, rounded (not rounded-xl).
 */
export const PRIMARY_BUTTON = {
  primary:     'px-3 py-1.5 text-xs font-semibold bg-[#5b21b6] text-white rounded hover:bg-[#7c3aed] transition-colors',
  secondary:   'px-3 py-1.5 text-xs font-semibold border border-[#e2e8f0] rounded bg-white text-[#334155] hover:border-[#64748b] transition-colors',
  ghost:       'text-[0.65rem] font-semibold text-[#5b21b6] hover:text-[#7c3aed]',
  destructive: 'px-3 py-1.5 text-xs font-semibold border border-[#dc2626]/20 rounded bg-[#fee2e2] text-[#991b1b] hover:bg-[#dc2626]/20 transition-colors',
  disabled:    'opacity-50 cursor-not-allowed pointer-events-none',
  loading:     'Replace label with "..." — never add spinner next to label',
  rules: {
    primary_per_view:     'One primary button per view maximum',
    position:             'Top-right of page header or section header. Never floating.',
    destructive_confirm:  'Destructive actions require inline confirmation before firing',
    no_icon_only:         'No icon-only buttons without tooltip',
  },
} as const

// ── VI. FINANCIAL TRUTH ───────────────────────────────────────────────────────

/**
 * FINANCIAL_TRUTH
 * The most critical invariant set. Violations here can cause incorrect financial
 * reports, audit failures, or partner disputes.
 *
 * Rule: components display, services compute.
 * No financial calculation may live inside a React component.
 */
export const FINANCIAL_TRUTH = {
  calculation_layers: {
    lib_services:  'Domain-specific computations (sales totals, COGS, KDV)',
    lib_engines:   'Cross-domain computations (forecast, situation, alert, risk)',
    lib_finance:   'Financial core (runway, burn, balance sheet, metrics)',
    lib_calc:      'Pure math primitives (round2, calculateLine)',
    components:    'ZERO calculations. Display only.',
    app_dir:       'ZERO calculations. Layout and coordination only.',
  },
  immutable_fields: [
    'sales.fx_rate_try',
    'sales.total_try',
    'sales.revenue_try',
    'sale_items.unit_price',
    'stock_lots.entry_cost_try',
    'journal_entries.*',
    'partner_finance_events.*',
  ],
  double_entry_invariant: 'Σ journal_entry debits === Σ journal_entry credits for each entry',
  fifo_invariant:         'Stock deduction always uses oldest lot first. Never negative remaining.',
  kdv_rounding:           'round2() from lib/calc.ts — never Math.round() or .toFixed(2)',
  corporate_tax_rate:     'CORPORATE_TAX_RATE_TR in lib/finance/financial-core.ts — legal number, not configurable',
  period_guard:           'lib/middleware/period-guard.ts is inviolable. No write to locked periods.',
  distributable_guard:    'distributable_net < 0 → distribution BLOCKED. Hard guard, not warning.',
  legal_reserve_rule:     'TTK 519: min(profit × 0.05, max(0, capital × 0.20 - existing_reserves))',
  dividend_withholding:   'GVK 94: always 10%. Not configurable without legal review.',
} as const

// ── VII. SERVER / CLIENT BOUNDARY ─────────────────────────────────────────────

/**
 * SERVER_CLIENT_BOUNDARY
 * Next.js App Router RSC/client boundary rules for Flowra.
 * Violations here can cause hydration errors, data leaks, or N+1 queries.
 */
export const SERVER_CLIENT_BOUNDARY = {
  rsc_responsibilities: [
    'Fetch data from lib/services/ or lib/engines/',
    'Pass typed DTOs as props to client components',
    'Render static layout structure',
    'Never import from "use client" modules (functions)',
  ],
  client_responsibilities: [
    'Local state (tabs, modals, forms)',
    'TanStack Query for mutations and real-time updates',
    'Browser API access',
    'Event handlers',
  ],
  forbidden_in_client: [
    'Direct import of lib/services/* functions',
    'Direct Supabase queries',
    'useEffect(() => fetch("/api/..."), []) for initial data load',
  ],
  forbidden_in_rsc: [
    'useState, useEffect, useRef',
    'Import of browser APIs',
    'Import of "use client" hook files',
  ],
  company_id_rule: 'companyId propagated from RSC layout → client via props or WorkspaceContext. Never from URL params in components.',
  mutation_pattern: 'Client component → /api/* route → service → DB. Never direct service call from client.',
} as const

// ── VIII. AUTH CONTEXT ────────────────────────────────────────────────────────

/**
 * AUTH_CONTEXT
 * Authentication and authorization rules.
 * Violations here affect multi-tenant data isolation.
 */
export const AUTH_CONTEXT = {
  company_id_source:   'resolveCompanyId() in lib/resolve-company.ts — the only authoritative source',
  permission_check:    'usePermissions() hook — never check userRole string directly in components',
  rls_dependency:      'All DB queries are scoped by company_id via Supabase RLS. No manual WHERE company_id = needed in most queries.',
  session_storage:     'Never store companyId in localStorage or sessionStorage',
  service_role_usage:  'supabase-admin.ts with service role — only in server-side admin operations, never in user-facing paths',
  forbidden_patterns: [
    'userRole === "admin"',  // use usePermissions()
    'localStorage.getItem("companyId")',
    'searchParams.get("company")',
  ],
  protected_pages:    'All /dashboard/* routes require active session + companyId resolution via middleware.ts',
} as const

// ── IX. MUTATION SAFETY ───────────────────────────────────────────────────────

/**
 * MUTATION_SAFETY
 * Rules for all data mutations (creates, updates, deletes).
 * Financial mutations carry additional requirements.
 */
export const MUTATION_SAFETY = {
  confirmation_required: [
    'Any deletion (hard or soft)',
    'Any financial transaction (payment, distribution, period close)',
    'Any action labeled "irreversible"',
    'Any bulk operation affecting >1 record',
    'Partner capital / loan entry',
    'Period close transition',
    'Period lock transition',
  ],
  confirmation_pattern:  'Inline button state (not modal): [Action] → click → [Confirm? Yes/Cancel]',
  optimistic_update:     'Apply optimistic update → API call → rollback on error',
  error_rollback:        'On mutation error: revert optimistic state + show inline error + toast error',
  idempotency:           'All API mutations use idempotency keys (lib/idempotency.ts)',
  audit_log:             'Every financial mutation writes to audit_logs (async acceptable)',
  period_guard:          'Middleware blocks all writes to locked periods before mutation handler runs',
  forbidden_patterns: [
    'Fire-and-forget mutations without error handling',
    'Mutations inside useEffect',
    'Direct Supabase .insert()/.update() from client components',
  ],
} as const

// ── X. SOURCE OF TRUTH ────────────────────────────────────────────────────────

/**
 * SOURCE_OF_TRUTH
 * Which layer is authoritative for each financial concept.
 * When two parts of the UI show different numbers for the same concept,
 * this map determines which is correct and which needs fixing.
 */
export const SOURCE_OF_TRUTH = {
  tiers: {
    OPERATIONAL: {
      description: 'Primary transactional records — what happened.',
      tables: ['sales', 'expenses', 'purchases', 'stock_lots', 'banks'],
      valid_without_gl: true,
      note: 'These are always valid regardless of gl_mode.',
    },
    GL: {
      description: 'Double-entry ledger — accounting truth.',
      tables: ['journal_entries', 'journal_entry_lines'],
      valid_without_gl: false,
      note: 'When gl_mode = "shadow", these values are ESTIMATES. Must be labeled.',
    },
    HYBRID: {
      description: 'Derived from both tiers, must be reconciled.',
      examples: ['partner balances', 'period net profit', 'retained earnings'],
      valid_without_gl: false,
      note: 'Reconciliation service flags discrepancies between tiers.',
    },
  },
  canonical_functions: {
    cash:                'FinanceService.getCash(companyId)',
    burn_rate:           'getCfoMetrics().burn.monthly_burn_rate',
    runway:              'getCfoMetrics().burn.runway_months',
    receivables:         'getCfoMetrics().receivables.total_outstanding',
    kdv_net:             'TaxService.computeKdv()',
    net_profit:          'IncomeStatementService.compute() — GL tier',
    partner_equity:      'PCLEEngine.getPartnerState().equity_paid',
    partner_loan:        'PCLEEngine.getPartnerState().net_loan',
    distributable:       'PCLEEngine.getDistributableProfit()',
    trial_balance:       'TrialBalanceService.compute()',
    balance_sheet:       'BalanceSheetService.compute()',
  },
} as const

// ── XI. PERIOD & GL MODE AWARENESS ────────────────────────────────────────────

/**
 * PERIOD_AWARENESS
 * Every financial display is period-bound.
 * These constants govern how period context is communicated and enforced.
 */
export const PERIOD_AWARENESS = {
  gl_mode_cache_ttl_ms: 60_000,  // 60 seconds — see dual-write.service.ts
  period_status_labels: {
    open:      'Açık',
    pre_close: 'Ön Kapanış',
    closed:    'Kapalı',
    locked:    'Kilitli',
  } as const,
  gl_mode_banners: {
    shadow:   'GL gölge modda — veriler operasyonel tahmin.',
    parallel: 'Defter paralel yazıyor — veriler birkaç dakika gecikmeli olabilir.',
    gl_primary: null,  // no banner needed — full confidence
  } as const,
  inviolable_files: [
    'lib/middleware/period-guard.ts',
    'lib/services/ledger/',
    'lib/services/pcle/',
    'supabase/',
  ],
} as const

// ── XII. COMPONENT GOVERNANCE ─────────────────────────────────────────────────

/**
 * COMPONENT_GOVERNANCE
 * Rules for where components live and how they're imported.
 */
export const COMPONENT_GOVERNANCE = {
  canonical_barrel:     '@/components/ds',
  format_barrel:        '@/lib/format',
  workspace_hook:       '@/lib/workspace-context',
  permission_hook:      'usePermissions() from @/lib/workspace-context',
  rules: [
    'All reusable components export from @/components/ds',
    'No component used in >3 places without being added to the barrel',
    'Financial display components (Num, Money, FxPair) never recreated inline',
    'Table layout always uses the Table component — never bare <table> in page files',
    'Badge levels are typed union — never ad-hoc string colors',
    'No emoji in data displays, table cells, status indicators',
  ],
  violation_detection: {
    inline_formatting:  "grep -r 'toLocaleString\\|toFixed\\|parseFloat' app/ --include='*.tsx'",
    direct_subpackage:  "grep -r 'from.*ui-kit/Flowra' app/ --include='*.tsx'",
    role_check:         "grep -r 'userRole ===' app/ --include='*.tsx'",
    raw_emoji_status:   "grep -r '[🟢🔴🟡⚠️✅❌]' app/ --include='*.tsx'",
  },
} as const

// ── EXPORT ────────────────────────────────────────────────────────────────────

/**
 * Complete invariant set — use for documentation, lint reference, test assertions.
 *
 * Usage example (test assertion):
 *   import { FINANCIAL_TRUTH } from '@/lib/design-invariants'
 *   // Verify no calculation in component files
 *   expect(FINANCIAL_TRUTH.calculation_layers.components).toBe('ZERO calculations. Display only.')
 */
export const FLOWRA_INVARIANTS = {
  NUMBER_FORMAT,
  TABLE_DENSITY,
  COLOR_PALETTE,
  LABEL_STYLE,
  PRIMARY_BUTTON,
  FINANCIAL_TRUTH,
  SERVER_CLIENT_BOUNDARY,
  AUTH_CONTEXT,
  MUTATION_SAFETY,
  SOURCE_OF_TRUTH,
  PERIOD_AWARENESS,
  COMPONENT_GOVERNANCE,
} as const

export type FlowraInvariantKey = keyof typeof FLOWRA_INVARIANTS
