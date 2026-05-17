// ─────────────────────────────────────────────────────────────────────────────
// lib/alerts/derive.ts
//
// Pure alert derivation — no DB calls, no side effects.
//
// Takes pre-fetched business data and returns a list of AlertSpec objects.
// Each spec contains the entity_type/entity_id key used for de-duplication,
// plus the message and severity.
//
// Why pure? Testability, composability, and separation of concerns:
//   • The DB query layer (alerts/generate) stays lean — just fetch + insert.
//   • Thresholds and logic live here, not scattered across the route.
//   • Unit tests can call deriveAlerts() directly without mocking Supabase.
//
// Alert types:
//   1. overdue_payment  — per sale: unpaid/partial/overdue AND > 30 days old
//   2. low_stock        — per product: stock_qty ≤ stock_alert_qty
//   3. negative_cashflow — company-level: projected next-month net is negative
//   4. overdue_critical  — company-level: aged_60_plus receivables exceed threshold
// ─────────────────────────────────────────────────────────────────────────────

/** Data required to derive all alert types. All fields are pre-fetched by the caller. */
export interface AlertDeriveInput {
  // ── Per-sale overdue payment checks ────────────────────────────────────────
  /** Sales with payment_status in (unpaid, partial, overdue) AND sale_date < 30 days ago */
  overdueSales: Array<{
    id:              string
    customer_name:   string
    total_try:       number
    amount_paid?:    number | null   // included to compute net outstanding for partial sales
    payment_status:  string
    sale_date:       string   // business invoice date — used for aging (not created_at)
  }>

  // ── Per-product low stock checks ───────────────────────────────────────────
  /** Active products where stock_alert_qty > 0 */
  stockProducts: Array<{
    id:              string
    name:            string
    stock_qty:       number
    stock_alert_qty: number
  }>

  // ── Company-level cashflow projection ─────────────────────────────────────
  /** Monthly TRY equivalent of active recurring expenses (pre-computed by caller) */
  recurringMonthlyTry: number
  /** Outstanding sales total_try (unpaid/partial) — used as expected incoming cash */
  outstandingTotal:    number
  /** The YYYY-MM month being projected (next calendar month) */
  nextYM:              string

  // ── Receivable aging (optional — used for aged_60_plus alert) ────────────
  aged60PlusTry?: number   // total receivable older than 60 days (defaults to 0 if absent)
  aged60PlusCount?: number // count of those sales
}

/** One alert to be inserted. De-duplication key = entity_type::entity_id. */
export interface AlertSpec {
  entity_type: string
  entity_id:   string
  message:     string
  severity:    'info' | 'warning' | 'critical'
}

// ── Thresholds ─────────────────────────────────────────────────────────────────
// Centralised so tests and monitoring can reference the same constants.

/** Minimum negative projected net (TRY) before a cashflow alert fires. */
export const CASHFLOW_ALERT_THRESHOLD_TRY = -1_000

/** Minimum aged_60_plus receivables (TRY) before a critical overdue alert fires. */
export const AGED60_ALERT_THRESHOLD_TRY = 5_000

/** Conservative collection fraction applied to outstanding sales in projection. */
export const PROJECTED_COLLECTION_RATE = 0.3   // 30% of outstanding expected next month

/** Sentinel UUID for company-level (non-entity) alerts. */
export const COMPANY_SENTINEL_ID = '00000000-0000-0000-0000-000000000000'

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive alert specs from pre-fetched data.
 *
 * This function is PURE — it does not touch the database or any external service.
 * The caller is responsible for:
 *   1. Fetching all required input data.
 *   2. Calling deriveAlerts() to get candidate specs.
 *   3. Filtering specs against the recent de-dup window.
 *   4. Inserting the remaining specs as alerts.
 *
 * Validation / formula documentation:
 *
 *   Alert 1 (overdue_payment):
 *     fires when:  ageDays = floor((now - created_at) / 86400000) > 30
 *                  AND payment_status ∈ {unpaid, partial, overdue}
 *     severity:    critical if ageDays > 60, else warning
 *     entity_key:  'sale::<sale_id>'
 *
 *   Alert 2 (low_stock):
 *     fires when:  stock_qty <= stock_alert_qty  (stock_alert_qty > 0)
 *     severity:    critical if stock_qty == 0, else warning
 *     entity_key:  'stock_movement::<product_id>'
 *
 *   Alert 3 (negative_cashflow):
 *     projected_collections = outstandingTotal × PROJECTED_COLLECTION_RATE
 *     projected_net         = projected_collections − recurringMonthlyTry
 *     fires when:  projected_net < CASHFLOW_ALERT_THRESHOLD_TRY
 *     severity:    critical if projected_net < −10_000, else warning
 *     entity_key:  'expense::COMPANY_SENTINEL_ID'  (company-level, not entity-scoped)
 *
 *   Alert 4 (aged_60_plus_receivable):
 *     fires when:  aged60PlusTry > AGED60_ALERT_THRESHOLD_TRY
 *     severity:    critical if aged60PlusTry > 50_000, else warning
 *     entity_key:  'sale::COMPANY_SENTINEL_ID'  (company-level aggregate)
 */
export function deriveAlerts(input: AlertDeriveInput): AlertSpec[] {
  const specs: AlertSpec[] = []
  const nowMs = Date.now()

  // ── 1. Overdue payment — per sale ─────────────────────────────────────────
  for (const sale of input.overdueSales) {
    const ageDays = Math.floor((nowMs - new Date(sale.sale_date + 'T00:00:00Z').getTime()) / 86_400_000)
    if (ageDays <= 30) continue   // caller should pre-filter; guard here too

    const severity: AlertSpec['severity'] = ageDays > 60 ? 'critical' : 'warning'
    // Show net outstanding (total_try - amount_paid) for partial payments
    const outstanding = Math.max(0, Number(sale.total_try) - Number(sale.amount_paid ?? 0))
    const amtStr  = outstanding.toLocaleString('tr-TR', { minimumFractionDigits: 0 })

    specs.push({
      entity_type: 'sale',
      entity_id:   sale.id,
      message:     `${sale.customer_name} — ${ageDays} gündür ödeme bekleniyor (₺${amtStr})`,
      severity,
    })
  }

  // ── 2. Low stock — per product ────────────────────────────────────────────
  for (const p of input.stockProducts) {
    const qty   = Number(p.stock_qty      ?? 0)
    const alert = Number(p.stock_alert_qty ?? 0)
    if (alert <= 0 || qty > alert) continue

    specs.push({
      entity_type: 'stock_movement',
      entity_id:   p.id,
      message:     `Düşük stok: ${p.name} — ${qty} adet kaldı (uyarı eşiği: ${alert})`,
      severity:    qty === 0 ? 'critical' : 'warning',
    })
  }

  // ── 3. Negative next-month cashflow projection ────────────────────────────
  //
  // projected_collections = outstanding × PROJECTED_COLLECTION_RATE (30%)
  // projected_net         = projected_collections − recurringMonthlyTry
  //
  // Using adjustedBurnRate (recurring committed) as the expense denominator
  // rather than just the trailing average ensures future obligations are reflected.
  //
  const projectedCollections = input.outstandingTotal * PROJECTED_COLLECTION_RATE
  const projectedNet         = projectedCollections - input.recurringMonthlyTry

  if (projectedNet < CASHFLOW_ALERT_THRESHOLD_TRY) {
    const absStr = Math.abs(projectedNet).toLocaleString('tr-TR', { minimumFractionDigits: 0 })
    specs.push({
      entity_type: 'expense',
      entity_id:   COMPANY_SENTINEL_ID,
      message:     `${input.nextYM} nakit açığı tahmini: ₺${absStr} eksik`,
      severity:    projectedNet < -10_000 ? 'critical' : 'warning',
    })
  }

  // ── 4. Aged 60+ receivables — company-level ───────────────────────────────
  //
  // Fires when the sum of receivables older than 60 days exceeds threshold.
  // This is a company-level aggregate alert (not per sale) to avoid alert fatigue
  // when there are many old small invoices.
  //
  const aged60 = Number(input.aged60PlusTry ?? 0)
  if (aged60 > AGED60_ALERT_THRESHOLD_TRY) {
    const count  = input.aged60PlusCount ?? '?'
    const amtStr = aged60.toLocaleString('tr-TR', { minimumFractionDigits: 0 })
    specs.push({
      entity_type: 'sale',
      entity_id:   COMPANY_SENTINEL_ID,
      message:     `${count} satış 60+ gün vadesi geçmiş: ₺${amtStr} — tahsilat riski`,
      severity:    aged60 > 50_000 ? 'critical' : 'warning',
    })
  }

  return specs
}
