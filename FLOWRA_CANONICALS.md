# FLOWRA_CANONICALS.md — Behavioral & Product Rules
> **Status: AUTHORITATIVE — read before every implementation session**
>
> This document governs HOW Flowra behaves, not how it looks.
> Visual rules live in `components/ds/SPEC.md`.
> These rules apply to every layer: UI, service, API, DB.
>
> When a behavior question arises that is not covered here, document the decision and add it.

---

## 1. Number Formatting (CANONICAL)

All number display in the Flowra UI goes through `lib/format.ts`. No exceptions.

### 1.1 Currency

```tsx
import { fmtTRY, fmtMoney, fmtCompact, formatTRY } from '@/lib/format'

fmtTRY(value)                 // "₺1.234.567,89"          — standard display
fmtTRY(value, 0)              // "₺1.234.568"              — no decimals
fmtCompact(value)             // "₺1,2M" | "₺340,5K"      — KPI strips only
fmtMoney(value, currency)     // "₺..." | "$..." | "€..."  — multi-currency
formatTRY(value)              // "1.234.567,89 TL"         — PDF/accountant format ONLY
```

**Rules:**
- `fmtTRY()` for all TRY values in the UI.
- `fmtCompact()` ONLY in KPI strips where full precision would overflow the cell.
- `formatTRY()` ONLY in PDF generation and accountant-facing report exports.
- Never `.toLocaleString()`, `.toFixed()`, or `Intl.NumberFormat` directly in JSX.
- The `₺` symbol is always prefix, never suffix, in UI display.
- Negative values display as `-₺1.234,56` — never `(₺1.234,56)`.
- Zero / null values display as `—` (em dash) — never `₺0,00` unless that zero is financially meaningful.

### 1.2 Percentage

```tsx
import { fmtPct } from '@/lib/format'

fmtPct(0.1274)       // "%12,7"   — decimal input
fmtPct(12.74, false) // "%12,7"   — percent input (pass false as second arg)
```

**Rules:**
- Always Turkish locale decimal separator (`,`).
- `%` prefix. Never suffix.
- One decimal place unless the context demands more (e.g. KDV rate: `%20`, `%10`, `%0`).
- Delta values: `+%12,3` when positive, `-%4,1` when negative (sign explicit).

### 1.3 Dates

```tsx
import { fmtDate, fmtMonth, fmtDateShort } from '@/lib/format'

fmtDate('2026-05-15')      // "15 May 2026"
fmtMonth('2026-05')        // "Mayıs 2026"
fmtDateShort('2026-05-15') // "15 May"
```

**Rules:**
- Always Turkish locale (`tr-TR`).
- Never raw ISO strings in UI (`2026-05-15`).
- Never `new Date().toLocaleDateString()` inline in JSX.
- Period labels use `fmtMonth()` — never "May-26" or "05/2026".
- Due dates in tables: `fmtDate()` — always. Overdue days: calculated in service layer, displayed as `+34g`.

### 1.4 Exchange Rates

```tsx
import { fmtFx } from '@/lib/format'

fmtFx(45.3877)    // "₺45,3877"   — 4 decimal places
```

**Rules:**
- Always 4 decimal places for FX rates.
- Displayed in top context strip only. Never repeated inside table cells.
- FX rate at transaction time is frozen on the record — never recalculated at display time.

---

## 2. Table Behavior (CANONICAL)

### 2.1 Table Data Source

- Table data arrives as a typed DTO array. Never raw Supabase row types.
- Sorting: server-side for paginated tables. Client-side for tables <100 rows.
- Pagination: cursor-based (`after=<id>`) — never offset-based (`page=3`).
- Empty state: always rendered as a full-width `<tr>` inside `<tbody>` — never as a sibling `<div>`.

### 2.2 Table Mutation Flow

1. User clicks action (e.g. "Tahsil Et")
2. Button enters loading state immediately (`cursor-wait`, text `"..."`)
3. Optimistic update applied to local state (if applicable)
4. API call fires
5. **On success**: toast notification + table row updates
6. **On error**: optimistic update reverted + inline error message on the row + toast error
7. Button returns to normal state

**Rule**: Never mutate and then refetch the entire table. Update the specific row.

### 2.3 Financial Table Rules

- Totals row always uses `border-t-2` — visually heavier than row dividers.
- Negative subtotals (e.g. COGS) display with `text-neg`.
- Positive net results display with `text-pos`.
- Sum lines (Toplam, Brüt Kâr, EBITDA) have `font-semibold`.
- Zero rows still display — they communicate deliberate absence.

---

## 3. Loading States (CANONICAL)

### 3.1 Loading Hierarchy

```
Level 1 — Route segment:   Next.js loading.tsx with skeleton layout
Level 2 — Panel section:   <Suspense> with skeleton panel
Level 3 — Inline refresh:  Skeleton rows in-place (table never disappears)
Level 4 — Button action:   Button loading state (never a panel spinner)
```

**Never:**
- Show a loading spinner over existing data (data doesn't disappear while refreshing)
- Show ₺0,00 while data is loading (skeleton instead)
- Use a global page spinner for partial data fetches
- Flash a loading state for requests that resolve in <100ms (suppress under threshold)

### 3.2 Skeleton Shapes

Every loading skeleton must mirror the exact layout of the content it replaces:
- A table with 4 columns → skeleton has 4 columns, approximate widths
- A KPI strip with 5 cells → skeleton has 5 cells
- A single number → `h-4 w-20 bg-[#f1f5f9] rounded animate-pulse`

---

## 4. Error States (CANONICAL)

### 4.1 Error Hierarchy

```
Level 1 — Fetch failure:     Error banner at section top with "Yenile →" link
Level 2 — Partial failure:   Named error in banner (which service failed)
Level 3 — Mutation failure:  Inline on the affected row/field + toast
Level 4 — Validation:        Field-level error message below the input
Level 5 — Fatal:             Next.js error.tsx with recovery action
```

**The sq() rule (critical):** Any service call that can silently fail MUST use a tracked error pattern:

```tsx
// ❌ FORBIDDEN — silent swallower
async function sq<T>(p: Promise<T>): Promise<T | null> {
  try { return await p } catch { return null }  // error eaten silently
}

// ✅ REQUIRED — tracked error pattern (as implemented in CFOTab)
const loadErrors: string[] = []
function sqt<T>(label: string, p: Promise<T>): Promise<T | null> {
  return p.catch(() => { loadErrors.push(label); return null })
}
// Then render the error banner when loadErrors.length > 0
```

**Rule**: A financial number that is ₺0 because a service failed must never appear as legitimate data.
**Rule**: Every server component that fetches data must have a visible error state.
**Rule**: Error banners include: which service failed + a reload action.

### 4.2 Error Copy Rules

- Error messages are in Turkish, first-person plural ("Veriler yüklenemedi").
- Never show raw error messages, stack traces, or SQL errors in the UI.
- Error severity matches the scope: a single panel failure ≠ a page-level error.

---

## 5. Mutation Flow (CANONICAL)

All data mutations follow this pattern:

```
User action → [Confirm if destructive] → Optimistic update → API call
                                                              ├─ Success → Toast + state sync
                                                              └─ Error   → Rollback + inline error
```

### 5.1 Confirmation Rules

Actions that require confirmation before firing:
- Any deletion (hard or soft)
- Any financial transaction (payment, distribution, period close)
- Any action described as "irreversible" in SPEC.md
- Any action affecting multiple records

Confirmation pattern: inline confirmation state in the button, not a modal dialog. Example:
```
[Sil] → click → [Emin misiniz? Evet / İptal] → click Evet → fires
```

Modals are reserved for: new record creation forms, complex multi-field updates.

### 5.2 Toast Rules

```
Success: green, 3 seconds, top-right
Warning: amber, 5 seconds, top-right
Error:   red, persistent until dismissed, top-right
Info:    gray, 4 seconds, top-right
```

One toast at a time. New toast replaces previous if same type.
Toast messages: subject + action. "Proforma oluşturuldu" not "Success!".

### 5.3 Save Confirmation

- Auto-save (inline forms): no explicit confirmation. Show "Kaydediliyor..." then "Kaydedildi" in-field.
- Explicit save (modal forms): "Kaydet" button → success toast → modal closes.
- Bulk actions: "N kayıt güncellendi" in toast.

---

## 6. Auth Context (CANONICAL)

### 6.1 Auth Flow

```
Request arrives → middleware.ts → supabase-server.ts (session check)
                                  ├─ No session → redirect /login
                                  └─ Session → resolveCompanyId()
                                               ├─ No company → /onboarding
                                               └─ company_id → WorkspaceContext
```

### 6.2 WorkspaceContext Rules

- `WorkspaceContext` is initialized in `app/dashboard/layout.tsx` via RSC.
- **RSC** passes `companyId` as a prop or via server context — never re-fetches it from the client.
- **Client components** access `companyId` via `useWorkspace()` hook only.
- `companyId` is NEVER hardcoded, guessed, or derived from URL params in components.
- `companyId` is NEVER stored in `localStorage` or `sessionStorage`.

### 6.3 Permission Rules

```tsx
import { usePermissions } from '@/lib/workspace-context'
const { canManagePartners, canClosePeriod } = usePermissions()

// ✅ CORRECT — check permission, then render
{canManagePartners && <button>Ortak Ekle</button>}

// ❌ FORBIDDEN — hardcode role check in component
{userRole === 'admin' && <button>Ortak Ekle</button>}
```

All permission checks go through `usePermissions()`. Never check `userRole` directly in components.

---

## 7. Server / Client Boundary (CANONICAL)

### 7.1 The Hierarchy

```
RSC (default) → data fetching, layout, passing props to client islands
'use client'  → interactivity, state, browser APIs, TanStack Query
```

### 7.2 Rules

```
✅ RSC fetches data from lib/services/ and passes typed DTOs to client components
✅ 'use client' components receive DTOs as props or read from TanStack Query cache
✅ Mutations happen via API routes (/api/*) called from client components
✅ Loading states for RSC data: Next.js Suspense boundaries
✅ Loading states for client mutations: local useState in client component

❌ RSC imports 'use client' modules (functions, hooks, state)
❌ 'use client' component calls lib/services/ directly
❌ useEffect(() => { fetch('/api/...') }, []) for initial data load
❌ API routes that re-export service functions directly (API routes validate + authorize)
```

### 7.3 'use client' Boundary Markers

Every file with `'use client'` must have a comment explaining WHY it needs client rendering:

```tsx
'use client'
// Client component: requires useState for tab selection and TanStack Query for
// real-time mutation feedback. Receives initial data as RSC prop.
```

---

## 8. Financial Calculation (CANONICAL)

### 8.1 Ownership Rules

```
lib/services/     → domain-specific computations (sales totals, COGS, KDV)
lib/engines/      → cross-domain computations (forecast, situation, alert, risk)
lib/finance/      → financial core (runway, burn, metrics, balance sheet)
lib/calc.ts       → pure math primitives (round2, calculateLine)

app/              → ZERO financial calculations. Components display, never compute.
components/       → ZERO financial calculations. Components display, never compute.
```

### 8.2 Immutability Rules

These values are frozen at record creation and must NEVER be recalculated at display time:

```
sales.fx_rate_try          — FX rate at sale creation. Immutable.
sales.total_try            — TRY total at sale creation. Immutable.
sales.revenue_try          — Net TRY revenue at sale creation. Immutable.
sale_items.unit_price      — Price at sale time. Immutable.
stock_lots.entry_cost_try  — FIFO cost at intake. Immutable.
journal_entries.*          — Append-only. No updates. No deletes.
partner_finance_events.*   — Append-only. No updates. No deletes.
```

**Rule**: If a component displays a historical financial value and recalculates it using current FX rates, that is a bug, not a feature.

### 8.3 Double-Entry Invariant

Every journal entry must satisfy: `Σ debit_try = Σ credit_try`

This is enforced by DB constraint. Any service that generates journal entries must verify balance before insert. If an entry would be unbalanced, it must throw — not silently drop a line.

### 8.4 FIFO Invariant

Stock deductions always use oldest available lot first. FIFO order is determined by `stock_lots.received_at ASC`. FIFO allocation must never result in negative remaining quantity on a lot.

### 8.5 KDV Calculation

```typescript
// canonical KDV calculation
const kdv_amount = round2(subtotal * (kdv_rate / 100))
const total = round2(subtotal + kdv_amount)

// reverse calculation (when total is known, subtotal unknown)
const subtotal = round2(total / (1 + kdv_rate / 100))
const kdv_amount = round2(total - subtotal)
```

`round2()` from `lib/calc.ts` is the ONLY rounding function used in financial calculations.

---

## 9. DTO Mapping (CANONICAL)

### 9.1 Layer Separation

```
DB row type (from supabase types)   →   service transforms   →   DTO   →   component prop
```

Components receive DTOs. Never raw DB row types. Never `any`.

### 9.2 Source-of-Truth Labels

Every data field displayed in the UI belongs to one of three tiers:

**OPERATIONAL** — Source: `sales`, `expenses`, `purchases`, `stock_lots`
> These are the primary transactional records. They're what happened.
> KDV is computed from these. Revenue is aggregated from these.
> These do NOT require a closed accounting period to be valid.

**GL (General Ledger)** — Source: `journal_entries`, GL projection functions
> Double-entry truth. Requires the GL to be active (`gl_mode != 'shadow'`).
> Trial balance, balance sheet, income statement, cash flow are derived from here.
> When `gl_mode = 'shadow'`, GL data is indicative only — mark it clearly.

**HYBRID** — Source: both operational + GL, reconciled
> Partner balances, period net profit, retained earnings.
> These must be consistent between operational and GL tiers.
> Reconciliation service flags discrepancies.

**Rule**: When displaying GL-sourced data while `gl_mode = 'shadow'`, show an amber banner: "Bu veriler gölge modda — muhasebe defteri aktif değil."

### 9.3 DTO Conventions

```typescript
// Date fields: always string 'YYYY-MM-DD', never Date object
created_at: string   // not: Date

// Amount fields: always number, never string
total_try: number    // not: string | number

// Optional fields: always explicit
customer_name?: string  // not: customer_name: string | null | undefined

// Enum fields: always typed union
status: 'draft' | 'sent' | 'approved' | 'converted'  // not: string

// ID fields: always string (UUIDs)
id: string           // not: number
```

---

## 10. Canonical Financial Truth

These are the single sources of truth for each financial concept:

| Concept | Source of Truth | Function |
|---------|----------------|----------|
| Company cash | `banks` table, sum of balances | `FinanceService.getCash()` |
| Monthly burn | 3-month average of expense outflows | `getCfoMetrics().burn.monthly_burn_rate` |
| Cash runway | `cash / burn_rate` | `getCfoMetrics().burn.runway_months` |
| Receivables total | `sales` where `payment_status IN ('unpaid','partial','overdue')` | `getCfoMetrics().receivables.total_outstanding` |
| KDV net | `sales.kdv_amount_try` - `expenses.kdv_deductible_try` | `TaxService.computeKdv()` |
| Net profit (period) | GL income accounts - GL expense accounts | `IncomeStatementService.compute()` |
| Partner equity | `partner_finance_events` EQUITY events | `PCLEEngine.getPartnerState()` |
| Partner loan balance | `partner_loan_tranches` net of repayments | `PCLEEngine.getPartnerState()` |
| Distributable profit | Net profit - legal reserve - unpaid compensation | `PCLEEngine.getDistributableProfit()` |
| Trial balance | Σ `journal_entry_lines` per account | `TrialBalanceService.compute()` |
| Balance sheet | GL account balances per MSUGT category | `BalanceSheetService.compute()` |

**Rule**: If two places in the UI show the same financial concept and they show different numbers, one of them is using the wrong source. Fix it by using the canonical function.

---

## 11. Period Awareness (CANONICAL)

### 11.1 Period-Aware Rules

- Every financial display is implicitly period-bound. The current period is visible in the top context strip.
- Historical views always show a period selector. No historical view shows "all time" without explicit user intent.
- When `period.status = 'locked'`, ALL write operations are blocked at the middleware level.
- When `period.status = 'pre_close'`, only adjustment entries are allowed.

### 11.2 Period Status Display

```
open:      Green badge "Açık" — N gün kaldı
pre_close: Amber badge "Ön Kapanış"
closed:    Gray badge "Kapalı"
locked:    Gray badge "Kilitli" (no further indication needed — middleware handles it)
```

### 11.3 Period Guard

The period guard in `lib/middleware/period-guard.ts` is inviolable.

No component may circumvent the period guard. No service may accept a write operation for a locked period. If a UI element would create a write operation for a locked period, it must be `disabled` with tooltip "Bu dönem kilitli."

---

## 12. gl_mode Awareness (CANONICAL)

```
shadow:     Journal entries NOT written. All GL-sourced displays are estimate/indicative.
parallel:   Journal entries written async. GL may lag by minutes.
gl_primary: Journal entries written sync. GL is authoritative real-time.
```

### 12.1 UI Rules Per Mode

**shadow mode:**
- Finance → Mizan, Bilanço, Gelir Tablosu show amber banner: "GL gölge modda — veriler operasyonel tahmin."
- CFO Cockpit shows: "Muhasebe defteri aktif değil. GL modu etkinleştirmek için Yönetim → Ayarlar."
- All other tabs function normally (operational data is not gl_mode dependent).

**parallel mode:**
- Light info banner: "Defter paralel yazıyor — veriler birkaç dakika gecikmeli olabilir."
- Trial balance has a "Son güncelleme: X dakika önce" timestamp.

**gl_primary mode:**
- No banner. Full GL confidence. This is the target steady state.

### 12.2 The gl_mode Cache Rule

`getGlMode()` is cached per-company with 60-second TTL in `dual-write.service.ts`. This is the canonical cache. Do NOT call `getGlMode()` in hot paths (e.g. per-row in a table). Pass it down as a prop or context value.

---

## 13. Simulation Rules (CANONICAL)

- Simulation scenarios are read-only computations. They never write to operational tables.
- A baseline scenario exists (one per company). Changing baseline requires explicit user action.
- Scenario comparison: always 3 (pessimistic / base / optimistic) or user-selected saved scenarios.
- Simulation inputs come from: current `sales` trends + current `expenses` + explicit user overrides.
- Simulation output is always labeled "Tahmin" — never presented as fact.
- Debt pressure timeline uses real `partner_loan_tranches` data — never synthetic.

---

## 14. Partner Finance Rules (CANONICAL)

- Partner loan display uses net position (disbursements - repayments), not gross.
- Burden score is always shown as `+N%` (over-financed) or `-N%` (under-financed) relative to equity share.
- Waterfall uses two-phase normalized algorithm (Phase 1: excess repayment, Phase 2: pro-rata with cap). Never largest-first.
- Distributable profit calculation blocks at negative value — this is a hard guard, not a warning.
- Huzur hakkı is OPEX. It reduces distributable profit before dividend calculation.
- Dividend withholding is always 10% (GVK 94) — never configurable in the UI without legal review.

---

*Version: 1.0 — 2026-05-19*
*Review trigger: new financial module, new data source, new calculation added to codebase*
