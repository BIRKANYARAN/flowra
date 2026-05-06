# Flowra ERP — Financial Model Reference

> **Status:** Locked as of Phase 4. Do not alter formulas without updating this document.  
> **Scope:** All financial computations in `app/api/cashflow`, `app/api/analytics/kpi`, `app/api/analytics/receivable-aging`, `lib/alerts/derive.ts`.

---

## 1. Financial Model

### 1.1 Cash-Basis Principle

Flowra's cashflow engine operates on a **strict cash basis**. Only events where money has physically moved are counted as cash flows.

| Term | Definition | DB source |
|------|------------|-----------|
| **invoiced** | Total value of sales created in a period (accrual basis) | `sales.total_try` grouped by `sales.created_at` |
| **collected** | Cash actually received: paid sales grouped by payment date | `sales.total_try` WHERE `payment_status = 'paid'`, grouped by `sales.paid_at` |
| **receivable** | Invoiced amount not yet collected | `sales.total_try` WHERE `payment_status IN ('unpaid', 'partial', 'overdue')` |
| **expenses** | Cash paid out: actual ledger entries | `expenses.amount_try` grouped by `expenses.expense_date` |

**The golden rule:**

```
net = collected − expenses        ← CASH BASIS
```

`invoiced` never enters the net formula. It is context data only.

---

### 1.2 Invoiced vs Collected

```
Timeline example:

  Jan 10  Sale created → ₺100K invoiced
                          invoiced[Jan] += 100K
                          receivable[Jan] += 100K   (still unpaid)
                          collected[Jan]  = 0        (not yet paid)

  Mar  5  Customer pays → paid_at = Mar 5
                           collected[Mar] += 100K
                           receivable[Jan]  unchanged  (snapshot at creation month)
                           net[Jan]         unchanged  (was already 0 for Jan)
                           net[Mar]        += 100K
```

**Why this matters:** `invoiced` grows when a sale is entered. `collected` grows only when `paid_at` is set and `payment_status = 'paid'`. A healthy company has `collected` close to `invoiced`. A growing gap is a receivable risk signal.

---

### 1.3 Receivables vs Revenue

| Concept | Flowra term | Formula |
|---------|-------------|---------|
| Accrual revenue | `invoiced` | `Σ sales.total_try` (by `created_at`) |
| Cash revenue | `collected` | `Σ sales.total_try WHERE payment_status='paid'` (by `paid_at`) |
| Outstanding receivable | `receivable` | `Σ sales.total_try WHERE payment_status IN ('unpaid','partial','overdue')` |
| Overdue receivable | `overdue_receivables` | Same as above AND `created_at < 30 days ago` |

`revenue` as a concept is ambiguous. In Flowra code:
- Use `invoiced` when you mean "the value of sales we have raised"
- Use `collected` when you mean "cash we have received"
- Never use `invoiced` as a proxy for cash

---

### 1.4 Cashflow Month Structure (`CashflowMonth`)

Each month in the cashflow window contains:

```typescript
{
  month:        string    // YYYY-MM
  invoiced:     number    // context only — NOT used in net
  collected:    number    // cash inflow — used in net
  receivable:   number    // still-outstanding invoices from this month
  expenses:     number    // cash outflow — used in net
  net:          number    // = collected − expenses
  cumulative:   number    // running sum of net from month[0]
  is_projected: boolean   // true = future month (no actual cash data yet)
}
```

**Projection rule:** For `is_projected = true` months, `expenses` includes recurring expense projections. For past/current months (`is_projected = false`), only actual ledger entries from the `expenses` table are counted. Recurring projections are **not added** to past months to avoid double-counting.

---

### 1.5 Partial Payments

Flowra does not have an `amount_paid` column. Partial payment handling:

- `payment_status = 'partial'` → the entire `total_try` is counted as a receivable
- When a partial becomes fully paid (`payment_status → 'paid'`, `paid_at` set): the full `total_try` moves into `collected` in the `paid_at` month
- There is no mechanism to track how much of a partial was paid at any intermediate stage

This is a known limitation. See Section 4.

---

## 2. KPI Definitions

Source: `app/api/analytics/kpi/route.ts`  
Response type: `KpiResult` in `types/index.ts`

---

### 2.1 Period-Scoped Metrics

These are filtered by `from` / `to` query parameters (default: first day of current month to today).

#### `total_revenue`
```
Σ sales.total_try
WHERE company_id = ?
  AND deleted_at IS NULL
  AND created_at BETWEEN from AND to
```
**Interpretation:** Accrual-basis revenue for the period. This is invoiced value, not cash.  
**Edge cases:**
- A sale created before `from` but paid within the period: counted in `total_collected` but NOT in `total_revenue`.
- A sale created within the period but paid after `to`: counted in `total_revenue` but NOT in `total_collected`.

#### `total_collected`
```
Σ sales.total_try
WHERE company_id = ?
  AND deleted_at IS NULL
  AND payment_status = 'paid'
  AND paid_at IS NOT NULL
  AND paid_at BETWEEN from AND to
```
**Interpretation:** Cash received in the period, regardless of when the sale was invoiced.  
**Edge cases:**
- Payment of an invoice from a prior period: counted here but not in `total_revenue`.
- `paid_at` is null even for paid status: excluded by `NOT NULL` guard.

#### `total_expenses`
```
Σ expenses.amount_try
WHERE company_id = ?
  AND deleted_at IS NULL
  AND expense_date BETWEEN from AND to
```
**Edge cases:**
- `amount_try` is the TRY-denominated value at the FX rate frozen at entry time. It does not fluctuate with FX movements after recording.
- Recurring expenses appear here only when they have been explicitly entered as individual expense rows. The recurring template itself does not contribute.

#### `net_profit`
```
net_profit = (total_revenue − total_cogs) − total_expenses
```
where `total_cogs = Σ sales.cogs` for the same period filter.  
**Interpretation:** Accrual-basis gross profit minus period expenses.  
**Edge cases:**
- This is an **approximation**. It mixes accrual revenue with cash expenses. It should not be used as a cash-flow figure.
- COGS is based on the FIFO allocation at the time of sale creation.

---

### 2.2 All-Time Receivable Metrics

Not period-limited. Represent the company's current receivable position across all time.

#### `outstanding_receivables`
```
Σ sales.total_try
WHERE company_id = ?
  AND deleted_at IS NULL
  AND payment_status IN ('unpaid', 'partial', 'overdue')
```
**Interpretation:** Total face value of all currently unpaid invoices.  
**Edge case:** Partial payments are counted at full face value (no `amount_paid` column).

#### `overdue_receivables`
```
Σ sales.total_try
WHERE company_id = ?
  AND deleted_at IS NULL
  AND payment_status IN ('unpaid', 'partial', 'overdue')
  AND created_at < (NOW − 30 days)
```
**Interpretation:** Subset of outstanding receivables where the invoice is more than 30 days old.  
**Edge case:** Age is measured from `created_at` (invoice date), not from a formal due date (which does not exist in the schema).

---

### 2.3 Balance Sheet Proxy

#### `stock_value`
```
Σ (stock_lots.qty_remaining × stock_lots.entry_cost_try)
WHERE company_id = ?
  AND deleted_at IS NULL
  AND qty_remaining > 0
```
**Interpretation:** FIFO inventory value at frozen entry cost. Not a market value.  
**Edge cases:**
- `entry_cost_try` is frozen at the time the lot was created. It does not change with FX movements.
- Lots with `qty_remaining = 0` are excluded (they are exhausted).
- If no stock lots exist, result is 0.

---

### 2.4 Cash Position and Runway

#### `cash_position`
```
cash_position = all_time_collected − all_time_expenses
```
where:
```
all_time_collected = Σ sales.total_try WHERE payment_status='paid' (no date filter)
all_time_expenses  = Σ expenses.amount_try (no date filter)
```
**Interpretation:** Gross cumulative cash surplus since the company's inception in Flowra.  
**Edge cases:**
- Does not account for liabilities outside the system (bank loans, tax payables not entered as expenses).
- Can be negative: means more cash has been spent than collected in Flowra's ledger.
- Does not include partner loan inflows; those are tracked separately in `partner_transactions`.

#### `monthly_burn_rate`
```
monthly_burn_rate = last_3_months_expenses / 3
```
where `last_3_months_expenses = Σ expenses.amount_try WHERE expense_date >= (today − 3 months)`.  
**Interpretation:** Trailing 3-month average monthly cash outflow.  
**Edge cases:**
- If the company has fewer than 3 months of expense history, the rate is still divided by 3 (understates true average for new companies).
- Does not include recurring expenses not yet entered as actual expense rows.

#### `adjusted_burn_rate`
```
recurring_monthly_commitment = Σ over active recurring_expenses:
  IF frequency = 'monthly':   amount_try × 1
  IF frequency = 'quarterly': amount_try × (1/3)
  IF frequency = 'yearly':    amount_try × (1/12)

adjusted_burn_rate = max(monthly_burn_rate, recurring_monthly_commitment)
```
**Interpretation:** The higher of actual trailing burn or committed monthly obligations.  
**Purpose:** Prevents underestimating burn when recurring liabilities have not yet been entered as individual expense records (e.g. invoice received but not yet logged).  
**Edge cases:**
- If all recurring expenses are already in the ledger, `monthly_burn_rate` dominates and `adjusted_burn_rate = monthly_burn_rate` (no change).
- If the company has recurring expenses but no actual expenses logged (new company), `adjusted_burn_rate = recurring_monthly_commitment`.
- Recurring expenses with `end_date` in the past are not fetched (filtered by `is_active = true`).

#### `runway_months`
```
IF adjusted_burn_rate > 0:
  runway_months = cash_position / adjusted_burn_rate   (rounded to 1 decimal place)
ELSE:
  runway_months = null
```
**Interpretation:** How many months the current cash position can sustain at the adjusted burn rate.  
**Edge cases:**
- `null` when `adjusted_burn_rate ≤ 0` (no meaningful burn — company has zero expenses).
- Negative when `cash_position < 0` (company is already in deficit).
- Expressed in months, rounded to 1 decimal.

---

### 2.5 Receivable Aging Buckets

Source: `app/api/analytics/receivable-aging/route.ts`  
Response type: `ReceivableAging` in `types/index.ts`

Age = `floor((now_ms − created_at_ms) / 86_400_000)` calendar days.

| Bucket | Age range | Risk level |
|--------|-----------|------------|
| `current` | 0–30 days | Normal collection cycle |
| `aged_30_60` | 31–60 days | Follow-up needed |
| `aged_60_plus` | 61+ days | High risk / potential bad debt |
| `total` | all of the above | Sum |

**Invariant (pre-rounding):**
```
total.count     = current.count     + aged_30_60.count     + aged_60_plus.count
total.total_try = current.total_try + aged_30_60.total_try + aged_60_plus.total_try
```
**Rounding note:** Each bucket and the total are independently rounded to 2 decimal places. Due to floating-point arithmetic, the displayed sum of the three buckets may differ from the displayed total by at most ±0.02 TRY. This is a display artifact, not a logic error.

---

## 3. Alert Logic

Source: `lib/alerts/derive.ts` (pure derivation) + `app/api/alerts/generate/route.ts` (fetch/insert)

### 3.1 Architecture

Alert generation is split into three phases:

1. **FETCH** — parallel DB queries in `generate/route.ts`. No business logic.
2. **DERIVE** — `deriveAlerts(input)` in `lib/alerts/derive.ts`. Pure function. No DB access.
3. **INSERT** — de-dup filter + batch insert in `generate/route.ts`.

The pure function can be unit-tested without mocking Supabase.

---

### 3.2 Alert Types and Triggers

#### Alert 1 — Overdue Payment (per sale)
```
entity_type = 'sale'
entity_id   = sale.id

Fires when:
  payment_status IN ('unpaid', 'partial', 'overdue')
  AND age_days > 30
  (where age_days = floor((now − sale.created_at) / 86_400_000))

severity = 'critical'  if age_days > 60
severity = 'warning'   if 30 < age_days ≤ 60
```
**De-dup key:** `sale::<sale_id>` — one alert per sale per 7-day window.

#### Alert 2 — Low Stock (per product)
```
entity_type = 'stock_movement'
entity_id   = product.id

Fires when:
  is_active = true
  AND stock_alert_qty > 0
  AND stock_qty <= stock_alert_qty

severity = 'critical'  if stock_qty = 0
severity = 'warning'   if 0 < stock_qty ≤ stock_alert_qty
```
**De-dup key:** `stock_movement::<product_id>` — one alert per product per 7-day window.

#### Alert 3 — Negative Cashflow Projection (company-level)
```
entity_type = 'expense'
entity_id   = '00000000-0000-0000-0000-000000000000'  (sentinel)

projected_collections = outstanding_total × 0.30
projected_net         = projected_collections − recurring_monthly_try

Fires when:
  projected_net < −1_000 TRY

severity = 'critical'  if projected_net < −10_000
severity = 'warning'   if −10_000 ≤ projected_net < −1_000
```
**De-dup key:** `expense::00000000-0000-0000-0000-000000000000` — one per 7-day window.  
**Collection rate:** 30% of outstanding is assumed to be collected next month. This is a conservative heuristic.

#### Alert 4 — Aged 60+ Receivables (company-level)
```
entity_type = 'sale'
entity_id   = '00000000-0000-0000-0000-000000000000'  (sentinel)

aged_60_plus_try = Σ total_try WHERE created_at < (now − 60 days)
                                 AND payment_status IN ('unpaid','partial','overdue')

Fires when:
  aged_60_plus_try > 5_000 TRY

severity = 'critical'  if aged_60_plus_try > 50_000
severity = 'warning'   if 5_000 < aged_60_plus_try ≤ 50_000
```
**De-dup key:** `sale::00000000-0000-0000-0000-000000000000` — one per 7-day window.

---

### 3.3 Thresholds (exported constants)

All thresholds are exported from `lib/alerts/derive.ts` so tests and monitoring reference the same values.

| Constant | Value | Purpose |
|----------|-------|---------|
| `CASHFLOW_ALERT_THRESHOLD_TRY` | `−1_000` | Minimum negative projected net to fire cashflow alert |
| `AGED60_ALERT_THRESHOLD_TRY` | `5_000` | Minimum aged_60_plus receivables to fire overdue-critical alert |
| `PROJECTED_COLLECTION_RATE` | `0.30` | Fraction of outstanding assumed collectible next month |
| `COMPANY_SENTINEL_ID` | `'00000000-0000-0000-0000-000000000000'` | UUID for company-level (non-entity-scoped) alerts |

---

### 3.4 De-Duplication

De-dup is **user-scoped** (not company-scoped), over a **7-day rolling window**.

```
recentKeys = Set of `${entity_type}::${entity_id}` strings
             from alerts WHERE actor_user_id = current_user
                          AND created_at >= (now − 7 days)

A derived alert is suppressed if its key is already in recentKeys.
```

**Design decision:** De-dup is per `actor_user_id`, not per `company_id`. If two users in the same company each run `/api/alerts/generate`, each may receive the same company-level alert independently. This is intentional — each user has their own alert feed.

---

## 4. Known Limitations

### 4.1 No Partial Payment Tracking

**Problem:** The `sales` table has no `amount_paid` column. When `payment_status = 'partial'`, it is unknown how much has been paid.

**Current behaviour:**
- Partial sales are counted as **full receivable** in all receivable calculations.
- A partial payment does not increase `collected` until the sale reaches `payment_status = 'paid'`.
- The `receivable` field per cashflow month reflects the full invoice amount, not the remaining balance.

**Impact:** `outstanding_receivables` and `receivable` may overstate the actual uncollected amount when partial payments exist.

**Workaround:** None. Requires a schema change (adding `amount_paid`) or a separate collections table.

---

### 4.2 No Invoice Due Date

**Problem:** The `sales` table has no `due_date` column. All aging is measured from `created_at` (the invoice creation date).

**Current behaviour:**
- "Overdue" in Flowra means: invoice was created more than 30 days ago and is still unpaid.
- `payment_status = 'overdue'` is a field the user manually sets; it is not automatically derived from a due date.
- The aging buckets (0–30, 30–60, 60+) are all relative to `created_at`, not a contractual due date.

**Impact:** A 90-day net-terms invoice will be flagged as overdue after 30 days from creation, even though it is not contractually late.

**Workaround:** Users should manually update `payment_status` to reflect actual contractual status.

---

### 4.3 Rounding Behaviour

**Receivable aging:** Each bucket (`current`, `aged_30_60`, `aged_60_plus`) and `total` are independently rounded to 2 decimal places after accumulation. The mathematical invariant `total = Σ buckets` holds before rounding; after rounding, the displayed values may differ by up to ±0.02 TRY due to floating-point arithmetic. This is a display artifact.

**KPI values:** All KPI fields are rounded to 2 decimal places using `Math.round(value × 100) / 100`. `runway_months` is rounded to 1 decimal place.

**Cashflow net/cumulative:** Not rounded in the route; clients receive raw JavaScript numbers. The chart component formats them using `toFixed()` / `toLocaleString`.

---

### 4.4 Recurring Expense Double-Count Prevention

Recurring expenses are **only projected into future months** (`is_projected = true`). They are not added to past or current months, even if the corresponding actual expense entry was never made. This prevents double-counting (actual + projection) for past months at the cost of potentially understating past expenses when a recurring was not logged.

---

### 4.5 Burn Rate Window

`monthly_burn_rate` uses a fixed **3-calendar-month lookback**, divided by exactly 3. For companies with fewer than 3 months of history, or with highly seasonal spending, this may not represent the true run-rate.

---

### 4.6 `cash_position` Excludes Off-Ledger Liabilities

`cash_position = all_time_collected − all_time_expenses` reflects only what is recorded in Flowra's `sales` and `expenses` tables. Bank loans, overdrafts, tax liabilities, and other off-ledger obligations are not included. The figure should not be treated as a bank balance.

---

## 5. Developer Rules

### Rule 1 — Never use `invoiced` as cash

```
// WRONG — invoiced is accrual, not cash
const cashInflow = month.invoiced

// CORRECT — collected is the only cash inflow
const cashInflow = month.collected
```

`invoiced` exists in `CashflowMonth` for display context only. It must never feed `net`, `cumulative`, or any cash-basis calculation. The `net` formula is hardcoded as `collected − expenses` and must remain so.

---

### Rule 2 — Always scope queries by `company_id`

Every query against a business table must include `.eq('company_id', companyId)` where `companyId` is derived from `resolveCompanyId(user.id, supabase)`. No exceptions.

```typescript
// WRONG — no company scope
const { data } = await supabase.from('sales').select('total_try')

// CORRECT
const { data } = await supabase
  .from('sales')
  .select('total_try')
  .eq('company_id', companyId)
  .is('deleted_at', null)
```

Tables that require company scoping: `sales`, `expenses`, `recurring_expenses`, `products`, `stock_lots`, `tasks`, `customers`, `alerts`, `proformas`, `partners`, `partner_transactions`, `stock_movements`, `purchases`.

---

### Rule 3 — Alerts must be derived, not hardcoded in the route

Alert logic belongs in `lib/alerts/derive.ts`. The `generate` route must:

1. Fetch data (Phase 1)
2. Call `deriveAlerts(input)` (Phase 2 — no DB access)
3. De-dup and insert (Phase 3)

**Do not** add threshold comparisons, message formatting, or severity decisions to `generate/route.ts`. Add them to `deriveAlerts()` and expose thresholds as exported constants.

```typescript
// WRONG — logic in the route
if (projectedNet < -1000) {
  toInsert.push({ message: '...', severity: 'warning' })
}

// CORRECT — logic in the pure function
const specs = deriveAlerts(input)     // all logic lives here
const toInsert = specs.filter(dedup)  // route only filters + inserts
```

---

### Rule 4 — `adjusted_burn_rate`, not `monthly_burn_rate`, for runway

```typescript
// WRONG — ignores committed recurring liabilities
runway = cash_position / monthly_burn_rate

// CORRECT — takes the conservative maximum
runway = cash_position / adjusted_burn_rate
```

`monthly_burn_rate` is a trailing average and may understate obligations when recurring expenses have not yet been logged. `adjusted_burn_rate` is always ≥ `monthly_burn_rate`.

---

### Rule 5 — Partial payments are full receivables

Do not attempt to compute a "remaining balance" for partial payments. Without an `amount_paid` column, this would require assumptions.

```typescript
// WRONG — cannot determine partial balance
if (sale.payment_status === 'partial') {
  receivable += sale.total_try * 0.5   // assumption — invalid
}

// CORRECT — treat as full receivable
if (['unpaid', 'partial', 'overdue'].includes(sale.payment_status)) {
  receivable += sale.total_try
}
```

---

### Rule 6 — Age is measured from `created_at`, not from a due date

All overdue and aging computations use `created_at` as the invoice date. There is no `due_date` column on `sales`. Do not invent a proxy due date.

```typescript
// WRONG — no due_date column
const ageDays = daysBetween(sale.due_date, now)

// CORRECT — use creation date
const ageDays = Math.floor((Date.now() - new Date(sale.created_at).getTime()) / 86_400_000)
```

---

### Rule 7 — Recurring projections apply only to future months

When expanding recurring expenses into the cashflow window, only add to months where `is_projected = true`. Past and current months already have actual expense entries from the ledger.

```typescript
// CORRECT pattern (cashflow/route.ts)
if (row.is_projected) {
  row.expenses += amtTry
}
// No else — past months use actuals only
```

---

## 6. Source of Truth

Every financial figure in Flowra has exactly one authoritative source. When the same value appears in multiple places (e.g. a KPI card and a cashflow bar), both must be derived from the same source query, not from each other.

### 6.1 Table of Authoritative Sources

| Value | Authoritative source | Must NOT derive from |
|-------|---------------------|----------------------|
| Cash inflow for a period | `sales.total_try` WHERE `payment_status='paid'`, grouped by `paid_at` | `sales.total_try` grouped by `created_at` |
| Invoice value for a period | `sales.total_try` grouped by `created_at` | Any cashflow or KPI aggregation |
| Outstanding receivable | `sales.total_try` WHERE `payment_status IN ('unpaid','partial','overdue')` | `invoiced − collected` (this arithmetic is incorrect — timing mismatch) |
| Expense cash outflow | `expenses.amount_try` grouped by `expense_date` | `recurring_expenses` (templates, not ledger entries) |
| Recurring expense projection | `recurring_expenses` × frequency factor | `expenses` table (contains only actuals, not future occurrences) |
| Inventory value | `stock_lots.qty_remaining × stock_lots.entry_cost_try` | `products.stock_qty × products.unit_cost` (denormalised, may drift) |
| Company membership / role | `company_members.role` via `resolveCompanyId` | JWT claims, session metadata, or URL parameters |
| Alert thresholds | Exported constants in `lib/alerts/derive.ts` | Inline literals in route handlers |

### 6.2 Derived vs Stored Values

Flowra computes all financial summaries **at read time** from underlying transaction tables. No summary column is written to the database by the financial engine. This means:

- Every financial response is always consistent with the current ledger state.
- There is no cache invalidation problem for financial figures.
- Recomputing any figure from scratch produces the same result as the last API response, given the same underlying rows.

**The only exception** is `products.stock_qty` (a denormalised counter maintained for legacy compatibility). The authoritative stock quantity is always `Σ stock_movements.qty_change` for a product, not `products.stock_qty`. Do not use `products.stock_qty` in financial calculations. Use `stock_lots` or `stock_movements`.

### 6.3 FX Rate Source of Truth

All TRY-denominated values in the database are **frozen at the time of entry**. The FX rate applied is stored alongside the record (`fx_rate`, `fx_rate_try`, `entry_cost_try`). These values never change after insertion, regardless of subsequent FX movements.

```
amount_try = amount × fx_rate_at_entry   ← frozen, immutable
```

Recalculating `amount_try` from a current FX rate would produce a different number. Do not do this. The frozen value is the source of truth for all historical aggregations.

---

## 7. Time Semantics

Every date and timestamp in Flowra carries a specific meaning. Using the wrong field for a time-based filter is a silent correctness bug.

### 7.1 Field Reference

| Field | Table | Type | Meaning |
|-------|-------|------|---------|
| `created_at` | `sales` | `timestamptz` | When the invoice was raised in Flowra |
| `paid_at` | `sales` | `timestamptz` | When payment was recorded as received |
| `updated_at` | `sales` | `timestamptz` | Last modification; not a business event |
| `expense_date` | `expenses` | `date` | The business date of the expense (may differ from `created_at`) |
| `created_at` | `expenses` | `timestamptz` | When the expense was entered into Flowra |
| `entry_date` | `stock_lots` | `date` | The date the stock lot was received |
| `start_date` | `recurring_expenses` | `date` | First occurrence date of the recurring template |
| `end_date` | `recurring_expenses` | `date` | Last occurrence date; null = open-ended |
| `due_date` | `tasks` | `date` | When a task is due |

### 7.2 Rules for Cashflow Time Bucketing

```
Cashflow inflow  → always bucket by paid_at        (cash received date)
Cashflow invoiced → always bucket by created_at     (invoice date)
Expense outflow  → always bucket by expense_date    (business date, not entry date)
Receivable age   → always measure from created_at   (invoice date, no due_date exists)
```

Mixing these fields produces silent errors. Examples:

```
WRONG: group collections by sales.created_at
       → counts cash in the wrong month (invoice month, not payment month)

WRONG: group expenses by expenses.created_at
       → counts an expense entered late in the wrong month

WRONG: measure receivable age from expenses.expense_date
       → expense_date is irrelevant to receivables
```

### 7.3 Projection Boundary

The current month (`nowYM`) is a past month for cashflow purposes:

```typescript
is_projected = monthDiff(nowYM, ym) > 0   // strictly greater than
```

This means `monthDiff = 0` (current month) yields `is_projected = false`. The current month uses actual ledger data, not recurring projections. This is correct: we always prefer actuals over projections when actuals exist or are accumulating.

**Consequence:** If today is May 15, May expenses entered so far are counted, but recurring expenses for May are not projected (they may already be in the ledger). May's `net` will be understated mid-month relative to the full-month actuals. This is expected behaviour, not a bug.

### 7.4 UTC Convention

All `timestamptz` values are stored and compared in UTC. Helper functions in `cashflow/route.ts` (`toYM`, `ymStart`, `ymEnd`) explicitly use UTC methods (`getUTCFullYear`, `Date.UTC`). Do not use local-time date methods when bucketing financial data.

```typescript
// CORRECT — UTC month extraction
const ym = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`

// WRONG — local time, breaks for users in non-UTC timezones
const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
```

---

## 8. What This System Is NOT

This section documents explicit non-goals. Understanding what Flowra does not model prevents incorrect inferences from the data it does produce.

### 8.1 Not an Accounting System

Flowra is not a double-entry bookkeeping system. It does not maintain:

- A chart of accounts
- Debit/credit journal entries
- A general ledger
- Trial balance or balance sheet
- Auditable financial statements

`cash_position` is not a bank balance. `net_profit` is not an auditable P&L figure. These are **operational approximations** for internal decision-making. For statutory accounting or tax filings, data must be exported to a certified accounting system.

### 8.2 Not a Real-Time System

Financial figures are computed on demand, not maintained in real time. The dashboard reflects the state of the database at the moment the page was loaded. No WebSocket updates, no push invalidation, no event-driven recalculation.

`force-dynamic` is set on all financial routes to prevent Next.js from caching responses, but stale data is still possible within a single page session if the underlying tables change while the page is open.

### 8.3 Not a Multi-Currency Ledger

All aggregations operate in TRY. Foreign-currency amounts are converted to TRY at the FX rate frozen at entry time and stored as `*_try` columns. Flowra does not:

- Revalue open foreign-currency positions (no mark-to-market)
- Compute unrealised FX gains or losses
- Maintain currency-segregated ledgers

A sale in USD is stored with `currency='USD'`, `total=1000`, `total_try=32000` (frozen). If the USD/TRY rate later changes, `total_try` does not change. The USD 1000 receivable is reported as ₺32,000 indefinitely, regardless of current rates.

### 8.4 Not a Payment Gateway

Flowra records payment events entered by users. It does not:

- Connect to any payment processor (Stripe, iyzico, etc.)
- Automatically mark sales as paid when a payment occurs externally
- Verify that a reported payment actually cleared

`paid_at` and `payment_status` are updated by user action only. The system trusts whatever status the user sets.

### 8.5 Not a Forecasting Model

The cashflow projection for future months is a **conservative mechanical expansion** of recurring expenses. It does not:

- Model revenue growth or seasonality
- Apply machine learning or statistical trend fitting
- Incorporate pipeline data (open proformas, expected deals)
- Account for one-time future expenses outside the recurring template

The 30% collection-rate assumption in Alert 3 (`PROJECTED_COLLECTION_RATE = 0.3`) is a static constant, not a model. It does not adapt to the company's historical collection rate.

### 8.6 Not a Stock Valuation System for External Reporting

`stock_value = Σ(qty_remaining × entry_cost_try)` is a **FIFO cost basis** figure, not a fair market value. It does not:

- Apply Lower of Cost or Market (LCM) adjustments
- Account for obsolescence, shrinkage, or damage
- Revalue inventory using current replacement cost

The figure is suitable for internal burn-rate and cash-position estimates. It is not suitable for external financial reporting.

### 8.7 Not a Payroll or HR System

`salary` and `board_fee` entries in `partner_transactions` record distributions to partners. They are not a payroll system. Employee salaries, social security contributions, withholding tax, and other payroll obligations must be managed and recorded externally, then entered as expenses in Flowra if they are to be included in the expense ledger.

---

## 9. Decision Guarantees

This section documents the correctness properties the system guarantees. These are invariants — if any is violated, it is a bug.

### 9.1 Cash Isolation Guarantee

**Guarantee:** No unpaid invoice value ever enters `collected`, `net`, or `cumulative`.

**Mechanism:**
- The `collected` query requires `payment_status = 'paid'` AND `paid_at IS NOT NULL`.
- The `net` formula is `collected − expenses`. It does not reference `invoiced` or `receivable`.
- These are separate Map keys in the cashflow grid; no code path merges them.

**How to verify:**
```sql
-- Should return 0 rows if the guarantee holds
SELECT id FROM sales
WHERE payment_status != 'paid'
  AND paid_at IS NOT NULL
  -- (i.e. no row should be both unpaid and have a paid_at date)
```

---

### 9.2 Company Isolation Guarantee

**Guarantee:** No query returns data belonging to a different company than the authenticated user's resolved company.

**Mechanism:**
- Every business-table query includes `.eq('company_id', companyId)`.
- `companyId` is always derived from `resolveCompanyId(user.id, supabase)`, never from a URL parameter or request body.
- RLS policies on Supabase enforce `company_id = any(user_company_ids())` as a second layer.

**How to verify:**
```
grep -r "\.from\(" app/api/ --include="*.ts" \
  | grep -v "\.eq('company_id'" \
  | grep -v "auth\|fx_rates\|alerts.*actor_user_id"
```
Any match that is not `auth.*`, `fx_rates`, or a user-scoped table is a potential violation.

---

### 9.3 Alert Purity Guarantee

**Guarantee:** `deriveAlerts()` produces the same output for the same input, every time, with no observable side effects.

**Mechanism:**
- `lib/alerts/derive.ts` imports no modules with I/O capability.
- The function takes a plain data object and returns a plain array.
- It reads `Date.now()` internally (for age calculations), which is the only non-deterministic element. This is acceptable: age calculations must reference the current time.

**Implication:** `deriveAlerts` can be unit-tested by calling it directly with fabricated input and asserting the output array. No Supabase mock required.

---

### 9.4 De-Duplication Correctness Guarantee

**Guarantee:** The same alert (identified by `entity_type::entity_id`) is not inserted more than once per user within any 7-day rolling window.

**Mechanism:**
- Phase 1 fetches all alerts for `actor_user_id` created within the last 7 days.
- The de-dup set is built before `deriveAlerts` is called.
- The filter `!recentKeys.has(key)` is applied to every spec before insertion.

**Boundary condition:** If two requests run simultaneously for the same user, a race condition could insert duplicates (no database-level unique constraint on `entity_type + entity_id + actor_user_id + time_window`). The 7-day window makes this a low-probability event in practice, but it is not guaranteed to be zero.

---

### 9.5 Receivable Aging Completeness Guarantee

**Guarantee:** Every outstanding sale is counted in exactly one aging bucket, and the sum of all buckets equals the total.

**Mechanism:**
- A single query fetches all outstanding sales with no date limit.
- The single-pass loop assigns each row to exactly one bucket via mutually exclusive `if / else if / else` on `ageDays`.
- `total` is incremented for every row before the bucket assignment.

**Rounding caveat:** The mathematical invariant holds on raw values. After each field is independently rounded to 2 decimal places, the displayed sum may differ from the displayed total by up to ±0.02 TRY. This is a display artifact, not a violation of the guarantee.

---

### 9.6 Adjusted Burn Rate Floor Guarantee

**Guarantee:** `adjusted_burn_rate ≥ monthly_burn_rate` always.

**Mechanism:**
```typescript
const adjustedBurnRate = Math.max(monthlyBurnRate, recurringMonthlyCommitment)
```
`Math.max` guarantees this. The adjusted rate can only be equal to or higher than the trailing average.

**Implication:** `runway_months` computed from `adjusted_burn_rate` is always ≤ `runway_months` computed from `monthly_burn_rate`. The system is conservative: it never overstates how long cash will last.

---

### 9.7 FX Immutability Guarantee

**Guarantee:** A TRY-denominated value (`*_try` column) written to the database never changes due to FX movement after the record is created.

**Mechanism:**
- All `*_try` columns are written once at INSERT time using the FX rate available at that moment.
- No background job or trigger updates `*_try` fields after insertion.
- The financial aggregation layer only reads `*_try` columns, never recomputes them.

**Implication:** Historical cashflow figures are stable. A query run today for last January will return the same numbers as a query run last January, even if FX rates have moved significantly.

---

## 10. Consistency Model

This section defines what Flowra guarantees about the relationship between the data a user writes and the data they subsequently read — across concurrent requests, across time, and across the boundary between Supabase and the Next.js application layer.

### 10.1 Read-After-Write Consistency

Flowra relies on Supabase (PostgreSQL) for storage. PostgreSQL guarantees **read-your-own-writes** within a single connection. In a serverless environment (Next.js route handlers), each request opens a fresh Supabase client and connection. The following holds:

- A record inserted in one request is visible to a subsequent request from any user as soon as the INSERT commits. PostgreSQL's default isolation level (`READ COMMITTED`) ensures this.
- A `payment_status` update that marks a sale as paid is immediately reflected in the next call to `/api/cashflow` or `/api/analytics/kpi`.
- There is no application-level cache between the route handlers and the database. `force-dynamic` on every financial route prevents Next.js from serving a stale response from its own cache.

**What is not guaranteed:** Two simultaneous requests (e.g. two dashboard tabs open at once) may see different states if a write occurs between them. There is no distributed read-your-own-writes guarantee across separate connections.

### 10.2 Aggregation Consistency

All financial aggregations (cashflow, KPI, receivable aging) are computed in a single request lifetime. They are not assembled from multiple pre-computed snapshots. This means:

- Within a single API response, all figures are internally consistent: they reflect the same database state at the time of the parallel queries.
- Across two separate API calls (e.g. `/api/cashflow` and `/api/analytics/kpi` called independently), figures may differ slightly if a write occurs between the two calls. The dashboard fetches these in parallel to narrow the window, but the gap is not zero.
- There is no serialisable snapshot across all financial endpoints simultaneously.

### 10.3 Soft-Delete Consistency

All business tables use soft-delete via a `deleted_at` column. Every query that reads business data filters `.is('deleted_at', null)`. A record with `deleted_at` set is treated as if it does not exist for all financial purposes.

**Consequence:** Soft-deleting a paid sale retroactively removes it from `collected` in all future API responses for the month it was paid in. This changes historical figures. Flowra does not maintain immutable historical snapshots; the financial model reflects the current state of the ledger, including all soft-deletes.

**Implication for auditing:** If auditability of historical figures is required, do not soft-delete records. Use `payment_status` changes instead, or record corrections as new entries. The audit log in `audit_logs` records what changed but does not restore the pre-change financial state.

### 10.4 No Eventual Consistency

Flowra does not use any eventually-consistent store, message queue, or asynchronous projection pipeline for its financial figures. Every number returned by a financial API route is computed synchronously from the PostgreSQL state at the time of the request. There is no "catch-up lag" to wait for.

The recurring expense engine, alert generation, and cashflow projection are all synchronous, in-process computations. They do not depend on background workers, scheduled jobs, or materialised views.

### 10.5 Alert Generation Consistency

`POST /api/alerts/generate` is not idempotent in the strict sense — calling it twice within 7 days will not insert duplicates (de-dup prevents this), but the first call inserts rows that the second call will then suppress. The result of two calls within a 7-day window is the same as the result of one call: the same set of alerts in the database.

Calling generate once per day per user is the intended cadence. There is no harm in calling it more frequently; the de-dup window absorbs extra calls.

---

## 11. Error Model

This section defines how Flowra financial routes fail and what callers can rely on when they do.

### 11.1 Authentication Errors

All financial routes check authentication as their first operation. If the Supabase session is missing or expired, every route returns:

```json
{ "error": "Unauthorized", "code": "UNAUTHORIZED", "type": "SECURITY" }
```
HTTP status: `401`.

No partial data is returned. The response body is always this exact shape when authentication fails. Callers must not attempt to parse financial fields from a 401 response.

### 11.2 Company Resolution Errors

After authentication, routes call `resolveCompanyId`. If the user has no active company membership, the route returns:

```json
{ "error": "Şirket bilgisi alınamadı", "code": "COMPANY_NOT_RESOLVED" }
```
HTTP status: `409`.

This is not a 404. The user exists but has no resolvable company context. It is expected for newly registered users who have not yet been added to a company. Callers should redirect to an onboarding flow, not retry the financial request.

### 11.3 Partial Query Failures

Financial routes run multiple Supabase queries in parallel using `Promise.all`. If one query fails:

- The route does **not** short-circuit. `Promise.all` rejects only if a promise rejects with a thrown error. Supabase query errors are returned in the result object (`.error` property), not thrown.
- Each query result is guarded with `?? []` or `?? 0`. A failed query silently contributes zero to the aggregate.
- No error is returned to the caller for a partial query failure. The response is HTTP 200 with the figures that succeeded, and zeros for the figures that did not.

**Implication:** A caller cannot distinguish a company with zero sales from a company whose sales query failed. If financial figures are unexpectedly zero, a Supabase RLS error or network issue should be investigated server-side.

**Exception:** If the top-level query in `/api/analytics/receivable-aging` fails, that route returns HTTP 500 with the Supabase error message, because that route has only one query and cannot produce a partial result.

### 11.4 Alert Insert Failures

If the batch insert in Phase 3 of `alerts/generate` fails, the route returns HTTP 500 with the Supabase error message. No alerts are partially inserted (Supabase batch inserts are atomic). The derived specs are discarded. A retry will re-derive the same specs and attempt the insert again, subject to the 7-day de-dup window.

### 11.5 Input Validation Errors

Routes that accept body input (`POST /api/tasks`, `PATCH /api/tasks/[id]`) validate required fields and return:

```json
{ "error": "<message>", "field": "<field_name>" }
```
HTTP status: `422`.

The `field` key identifies which input was invalid. Date fields accept only `YYYY-MM-DD` format (validated via regex). Status fields accept only values in `VALID_STATUSES`. Values failing these checks are silently coerced to `null` or the default, except for `title` which is a hard error.

### 11.6 What Is Never Returned

The following are never included in any API response:

- Stack traces
- Supabase internal error codes beyond the `.message` string
- SQL query text
- Other users' data (enforced by company scoping and RLS)
- Data from soft-deleted records (`deleted_at IS NOT NULL`)

---

## 12. Trust Boundaries

This section defines what Flowra trusts, what it does not trust, and why.

### 12.1 Trusted Inputs

| Source | Trust level | Reason |
|--------|-------------|--------|
| Supabase `auth.getUser()` result | Trusted | Cryptographically verified JWT; Supabase validates signature |
| `resolveCompanyId(user.id)` result | Trusted | Derived from verified user ID against DB; not user-supplied |
| `company_id` from `resolveCompanyId` | Trusted | Server-side derivation; cannot be forged by the client |
| `expenses.amount_try` from DB | Trusted | Frozen at write time; FX immutability guarantee applies |
| `sales.total_try` from DB | Trusted | Same |

### 12.2 Untrusted Inputs

| Source | Trust level | Handling |
|--------|-------------|---------|
| All request body fields | Untrusted | Validated and sanitised before use |
| URL query parameters (`from`, `to`, `status`, `limit`) | Untrusted | Clamped to valid ranges; date params used only as query bounds, never executed |
| `related_customer_id`, `related_sale_id` in task body | Untrusted | Type-checked; passed to DB as a UUID parameter, not interpolated into SQL |
| `payment_status` set by user | Untrusted | Accepted as entered; Flowra does not verify that payment actually occurred |

### 12.3 The Payment Status Trust Gap

`payment_status = 'paid'` and `paid_at` are set by a user action in Flowra. The system does not connect to any payment processor to verify that money was received. A user can mark a sale as paid without any money having moved.

**Implication:** All cash-basis figures (`collected`, `cash_position`, `total_collected`) reflect what users have told Flowra, not what a bank statement would show. The accuracy of cash-basis reporting depends entirely on users keeping payment statuses current and accurate.

This is a deliberate design choice, not a security flaw. Flowra is an internal operations tool, not a payment processor.

### 12.4 RLS as a Second Trust Layer

Supabase Row Level Security policies enforce company scoping at the database level, independent of the application layer. Even if application code omits `.eq('company_id', companyId)`, the RLS policy `company_id = any(user_company_ids())` prevents cross-company data access.

RLS is a defence-in-depth measure. It does not replace the application-level company scoping requirement (Rule 2 in §5). Both must be present: application scoping for correctness and auditability, RLS for security.

### 12.5 Admin Queries

Routes under `/api/admin/` use `safeAdminQuery()` from `lib/admin-db.ts`, which wraps the service-role Supabase client. The service role bypasses RLS. `safeAdminQuery` enforces company scoping programmatically to compensate.

The service-role client (`createAdminClient`) must only be imported by `lib/admin-db.ts`. No route handler imports it directly. This is enforced by convention, not by a build-time check.

### 12.6 Alert De-Duplication Trust

The de-dup window is scoped to `actor_user_id`, not `company_id`. A malicious user cannot suppress another user's alerts by pre-inserting rows with the same `entity_type::entity_id` key, because the de-dup query is filtered to their own `actor_user_id`.

A user can, however, suppress their own future alerts by manually inserting a row into the `alerts` table with the sentinel ID. This is not considered a threat model concern for an internal ERP tool.

---

## 13. Scaling Limits

This section documents the known performance boundaries of the financial model and the query patterns that break down at scale.

### 13.1 Row Count Limits on Financial Queries

Several financial queries fetch entire result sets with no pagination, relying on in-process aggregation. These work correctly for the expected company scale but degrade linearly with row count.

| Query | Fetch limit | Breaks at |
|-------|-------------|-----------|
| All-time paid sales (for `cash_position`) | None | ~10K+ rows: noticeable latency increase |
| All-time expenses (for `cash_position`) | None | ~10K+ rows: noticeable latency increase |
| Outstanding receivables (for `outstanding_receivables`) | None | ~5K+ rows: noticeable latency increase |
| Receivable aging (all outstanding, unbounded) | None | ~5K+ rows |
| Overdue sales for alerts | Hard limit: 50 rows | Above 50: oldest 50 only; newer overdue sales missed |
| Outstanding sales for cashflow alert | Hard limit: 200 rows | Above 200: `outstandingTotal` understated |
| Stock products for low-stock alerts | None | ~2K+ products: noticeable latency |

### 13.2 Cashflow Window Limits

The cashflow endpoint accepts `past_months` and `future_months` parameters, each clamped to `[1, 12]`. The maximum window is 24 months. Requests beyond these bounds are silently clamped, not rejected.

Within the window, all sales and expenses in that date range are fetched without pagination. For a company with high transaction volume over a 12-month historical window, the query may return tens of thousands of rows. No aggregate push-down is currently used; all summation happens in JavaScript.

**Mitigation path if needed:** Replace the full-row fetch + JS reduce with a Supabase RPC or a `group by` + `sum` query. The current architecture fetches individual rows to avoid requiring a Postgres function, at the cost of bandwidth for high-volume companies.

### 13.3 KPI Parallel Query Count

`/api/analytics/kpi` runs 10 parallel Supabase queries per request. Each consumes a connection from the Supabase connection pool. For a Supabase project on a free or starter tier, the pool may be 15–60 connections. Under concurrent dashboard load from multiple users, connection exhaustion is possible.

**Mitigation:** Supabase's `pgBouncer` pooler (transaction mode) handles connection multiplexing transparently for most workloads. If connection errors appear under load, switch to the `?pgbouncer=true` connection string or introduce request-level query batching.

### 13.4 Alert Generation at Scale

`POST /api/alerts/generate` is designed to be called once per user per day. It is not designed for high-frequency polling. Calling it once per minute per user would:

- Execute 6 DB queries per call
- Insert up to ~70 rows per call (50 overdue sales + stock products + company-level alerts)
- Hit the 7-day de-dup window on subsequent calls (suppressing duplicates, but not the queries)

The 7-day de-dup window absorbs extra calls after the first, but Phase 1 queries still execute each time. Rate-limiting `POST /api/alerts/generate` per user to once per hour is advisable for production deployments with many users.

### 13.5 Receivable Aging at Scale

The receivable aging endpoint fetches all outstanding sales for the company with no date limit. For a company that never marks sales as paid (or accumulates years of unpaid invoices), this grows without bound. The in-process bucketing loop is O(n) in the number of outstanding rows.

For companies with more than ~5,000 outstanding invoices, a `CASE WHEN / GROUP BY` approach on the database side would reduce data transfer from O(n rows) to O(3 rows):

```sql
SELECT
  CASE
    WHEN age_days <= 30 THEN 'current'
    WHEN age_days <= 60 THEN 'aged_30_60'
    ELSE                     'aged_60_plus'
  END AS bucket,
  COUNT(*),
  SUM(total_try)
FROM (
  SELECT total_try,
         EXTRACT(DAY FROM now() - created_at)::int AS age_days
  FROM   sales
  WHERE  company_id = $1
    AND  deleted_at IS NULL
    AND  payment_status IN ('unpaid', 'partial', 'overdue')
) t
GROUP BY bucket
```

This optimisation is not currently implemented. It would require a Supabase RPC function.

### 13.6 Recurring Expense Expansion

The cashflow route expands recurring expenses into the window using a nested loop: `O(recurring_count × window_months)`. For a 24-month window and 100 active recurring templates, this is 2,400 iterations — negligible. At 1,000 templates and a 24-month window it is 24,000 iterations, still fast in JavaScript. This loop does not scale with transaction volume, only with the number of recurring templates, which is bounded by what a company can realistically maintain.

### 13.7 What Does Not Scale: Summary

The current financial model is designed for a single company with:

- Up to ~2,000 sales per year
- Up to ~5,000 total expense entries
- Up to ~500 outstanding receivables at any time
- Up to ~100 active recurring expense templates
- Up to ~50 products with stock alert thresholds

Beyond these ranges, API response times will increase but correctness is not affected. No data will be lost or miscomputed; queries will simply take longer and transfer more data.

---

*Document generated from Phase 4 code audit. Last verified against:*
- `app/api/cashflow/route.ts`
- `app/api/analytics/kpi/route.ts`
- `app/api/analytics/receivable-aging/route.ts`
- `lib/alerts/derive.ts`
- `app/api/alerts/generate/route.ts`
- `app/api/tasks/route.ts`
- `app/api/tasks/[id]/route.ts`
- `types/index.ts`
