// ── Proforma Service ──────────────────────────────────────────────────────────
// Route → THIS SERVICE → DB
// All proforma business logic lives here. Routes are thin callers only.

import { createClient } from '@/lib/supabase-server'
import { logger, type RequestContext } from '@/lib/logger'
import {
  checkIdempotency, reserveIdempotencyKey,
  commitIdempotencyKey, failIdempotencyKey,
  computePayloadHash,
} from '@/lib/idempotency'
import {
  requireString, optionalString, optionalUUID, requireArray,
  sanitizeCurrency, validateProformaLine, ValidationError,
} from '@/lib/validation'
import { AppError } from '@/types/errors'
import { fetchTcmbWithFallback } from '@/lib/fx'
import { calculateTotals, type LineInput } from '@/lib/calc'
import { safeSystemQuery } from '@/lib/admin-db'

export { ValidationError }

// ── FX snapshot helper ────────────────────────────────────────────────────────
// Fetches today's USD and EUR rates from TCMB and falls back to the most
// recent stored rate if TCMB is unavailable (weekend, holiday, network error).
// Returns { fx_usd, fx_eur, fx_try } — all immutable once stored on the proforma.

interface FxSnapshot {
  fx_usd:       number | null
  fx_eur:       number | null
  fx_try:       number         // always 1
  fx_source:    string         // 'tcmb_today' | 'tcmb_last_business_day' | 'db' | 'fallback'
  fx_rate_date: string | null  // YYYY-MM-DD the rate applies to
}

async function snapshotFxRates(): Promise<FxSnapshot> {
  // Try live TCMB (today.xml) then last business day archive (up to 7 days)
  const tcmb = await fetchTcmbWithFallback()
  if (tcmb) {
    return { fx_usd: tcmb.usd, fx_eur: tcmb.eur, fx_try: 1, fx_source: tcmb.source, fx_rate_date: tcmb.date }
  }

  // Fall back to most recent stored rates from fx_rates table
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  const { data: storedRates } = await supabase
    .from('fx_rates')
    .select('currency, buying, rate_date')
    .in('currency', ['USD', 'EUR'])
    .lte('rate_date', today)
    .order('rate_date', { ascending: false })
    .limit(4)

  let fx_usd: number | null = null
  let fx_eur: number | null = null
  let fx_rate_date: string | null = null

  if (storedRates) {
    // Take the most recent row per currency
    const usdRow = storedRates.find(r => r.currency === 'USD')
    const eurRow = storedRates.find(r => r.currency === 'EUR')
    fx_usd = usdRow ? Number(usdRow.buying) : null
    fx_eur = eurRow ? Number(eurRow.buying) : null
    fx_rate_date = (usdRow?.rate_date as string) ?? null
  }

  return { fx_usd, fx_eur, fx_try: 1, fx_source: fx_usd ? 'db' : 'fallback', fx_rate_date }
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface CreateProformaInput {
  idempotency_key:  string
  customer_id?:     string | null
  bank_id?:         string | null
  customer_name:    string
  currency:         string
  validity_days:    number
  notes?:           string | null
  internal_notes?:  string | null
  sales_rep_name?:  string | null
  sales_rep_title?: string | null
  sales_rep_phone?: string | null
  items:            unknown[]
}

export interface UpdateProformaInput {
  id:               string
  customer_id?:     string | null
  bank_id?:         string | null
  customer_name:    string
  currency:         string
  validity_days:    number
  notes?:           string | null
  internal_notes?:  string | null
  sales_rep_name?:  string | null
  sales_rep_title?: string | null
  sales_rep_phone?: string | null
  items:            unknown[]
}

export interface ProformaResult {
  id:          string
  proforma_no: string | null
  cached?:     boolean
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ProformaService {

  // ── Create ───────────────────────────────────────────────────────────────
  static async create(
    userId:    string,
    input:     CreateProformaInput,
    companyId: string,
    ctx:       RequestContext,
  ): Promise<ProformaResult> {

    // 1. Compute payload hash for idempotency validation
    const payloadHash = computePayloadHash({
      customer_id: input.customer_id, customer_name: input.customer_name,
      currency: input.currency, items: input.items,
    })

    // 2. Idempotency check
    const cached = await checkIdempotency(userId, input.idempotency_key, 'proforma_create')
    if (cached?.status === 'success' && cached.result_id) {
      // Verify payload hash matches — reject 409 if same key but different payload
      if (cached.request_hash && cached.request_hash !== payloadHash) {
        throw new AppError('IDEMPOTENCY_MISMATCH',
          'Bu idempotency anahtarı farklı bir istek için kullanıldı.',
          { key: input.idempotency_key, status: 409 })
      }
      await logger.info(ctx, 'proforma_create:cache_hit', { key: input.idempotency_key })
      return {
        id:          cached.result_id,
        proforma_no: (cached.result_data?.proforma_no as string) ?? null,
        cached:      true,
      }
    }
    if (cached?.status === 'pending') {
      throw new AppError('IDEMPOTENCY_PENDING', 'Bu işlem hâlâ devam ediyor, lütfen bekleyin.', { key: input.idempotency_key })
    }

    // 3. Reserve key with payload hash
    await reserveIdempotencyKey(userId, input.idempotency_key, 'proforma_create', 24, payloadHash)

    try {
      // 3. Validate inputs
      const customer_id    = optionalUUID(input.customer_id, 'customer_id')
      const bank_id        = optionalUUID(input.bank_id, 'bank_id')
      const customer_name  = requireString(input.customer_name ?? '', 'customer_name', 300)
      const currency       = sanitizeCurrency(input.currency ?? 'TRY')
      const validity_days  = Math.max(1, Math.min(365, Number(input.validity_days ?? 1)))
      const notes          = optionalString(input.notes, 'notes', 2000)
      const internal_notes = optionalString(input.internal_notes, 'internal_notes', 2000)
      const sales_rep_name  = optionalString(input.sales_rep_name,  'sales_rep_name',  200)
      const sales_rep_title = optionalString(input.sales_rep_title, 'sales_rep_title', 200)
      const sales_rep_phone = optionalString(input.sales_rep_phone, 'sales_rep_phone', 100)

      const rawItems = requireArray(input.items ?? [], 'items')
      if (rawItems.length === 0) throw new AppError('NO_ITEMS', 'En az bir ürün satırı zorunludur')
      const items = rawItems.map((l, i) => validateProformaLine(l, i))
      const total = calculateTotals(items as LineInput[]).grand_total

      // 4. Snapshot FX rates at creation time
      //    These values are stored immutably — old proformas always use their
      //    own snapshot, never the current fx_rates table.
      const fxSnapshot = await snapshotFxRates()
      await logger.info(ctx, 'proforma_create:fx_snapshot', {
        fx_usd: fxSnapshot.fx_usd,
        fx_eur: fxSnapshot.fx_eur,
        fx_source: fxSnapshot.fx_source,
        fx_rate_date: fxSnapshot.fx_rate_date,
      })

      const supabase = createClient()

      // 5. Snapshot company + customer data for deterministic PDF rendering
      //    Even if company/customer details change later, this proforma's PDF
      //    always uses the data as it existed at creation time.
      const [settingsRes, customerRes] = await Promise.all([
        safeSystemQuery('user_settings')
          .select('company_name, address, phone, website, tax_number, tax_office, mersis_no, logo_url')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        customer_id
          ? supabase
              .from('customers')
              .select('name, address, tax_number, tax_office, email, phone')
              .eq('id', customer_id)
              .is('deleted_at', null)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const companySnapshot = settingsRes.data
        ? {
            name:       settingsRes.data.company_name ?? '',
            address:    settingsRes.data.address ?? '',
            phone:      settingsRes.data.phone ?? '',
            website:    settingsRes.data.website ?? '',
            tax_number: settingsRes.data.tax_number ?? '',
            tax_office: settingsRes.data.tax_office ?? '',
            mersis_no:  settingsRes.data.mersis_no ?? '',
            logo_url:   settingsRes.data.logo_url ?? '',
          }
        : null

      const customerSnapshot = customerRes.data
        ? {
            name:       customerRes.data.name ?? customer_name,
            address:    customerRes.data.address ?? '',
            tax_number: customerRes.data.tax_number ?? '',
            tax_office: customerRes.data.tax_office ?? '',
            email:      customerRes.data.email ?? '',
            phone:      customerRes.data.phone ?? '',
          }
        : { name: customer_name, address: '', tax_number: '', tax_office: '', email: '', phone: '' }

      // 6. Build payloads (log before insert for debugging)
      const itemPayloads = items.map(l => ({ ...l }))
      // fx_rate_try: the rate for THIS proforma's currency (backward compat)
      const fxRateTry = currency === 'USD' ? fxSnapshot.fx_usd
                      : currency === 'EUR' ? fxSnapshot.fx_eur
                      : 1

      await logger.info(ctx, 'proforma_create:payload', {
        header: { customer_id, customer_name, currency, total, items_count: itemPayloads.length },
      })

      // 7. Atomic RPC — single transaction, no fallback
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('create_proforma_atomic', {
        p_user_id:           userId,
        p_customer_id:       customer_id,
        p_bank_id:           bank_id,
        p_customer_name:     customer_name,
        p_currency:          currency,
        p_validity_days:     validity_days,
        p_notes:             notes,
        p_internal_notes:    internal_notes,
        p_total:             total,
        p_fx_usd:            fxSnapshot.fx_usd,
        p_fx_eur:            fxSnapshot.fx_eur,
        p_fx_try:            fxSnapshot.fx_try,
        p_fx_source:         fxSnapshot.fx_source,
        p_fx_rate_date:      fxSnapshot.fx_rate_date,
        p_fx_rate_try:       fxRateTry,
        p_company_snapshot:  companySnapshot,
        p_customer_snapshot: customerSnapshot,
        p_items:             itemPayloads,
        p_company_id:        companyId,
      })

      if (rpcErr || !rpcResult) {
        await logger.error(ctx, 'proforma_create:rpc_failed', {
          dbError: rpcErr?.message, dbCode: rpcErr?.code, dbDetails: rpcErr?.details,
        })
        await failIdempotencyKey(userId, input.idempotency_key, 'proforma_create')
        throw new AppError('DB_INSERT_FAILED',
          `Proforma kaydedilemedi: ${rpcErr?.message ?? 'bilinmeyen hata'}`,
          { dbError: rpcErr?.message, dbCode: rpcErr?.code })
      }

      // RPC returns jsonb { id, proforma_no }
      const result = rpcResult as { id: string; proforma_no: string | null }
      const prf = { id: result.id, proforma_no: result.proforma_no ?? null }
      await logger.info(ctx, 'proforma_create:success', { id: prf.id, proforma_no: prf.proforma_no })

      // Persist sales rep fields (not part of the atomic RPC — safe to do after commit)
      if (sales_rep_name || sales_rep_title || sales_rep_phone) {
        await supabase.from('proformas')
          .update({ sales_rep_name, sales_rep_title, sales_rep_phone })
          .eq('id', prf.id)
      }

      // 7. Commit idempotency
      await commitIdempotencyKey(userId, input.idempotency_key, 'proforma_create', prf.id, { proforma_no: prf.proforma_no })

      return { id: prf.id, proforma_no: prf.proforma_no }

    } catch (err) {
      if (!(err instanceof ValidationError) && !(err instanceof AppError)) {
        await failIdempotencyKey(userId, input.idempotency_key, 'proforma_create').catch(() => {})
      }
      throw err
    }
  }

  // ── Update (draft-only gate) ─────────────────────────────────────────────
  // NOTE: FX snapshot is NOT refreshed on update — it was locked at creation.
  // Only content fields (customer, items, notes) can change.
  static async update(
    userId:    string,
    companyId: string,
    input:     UpdateProformaInput,
    ctx:       RequestContext
  ): Promise<{ id: string }> {
    const supabase    = createClient()
    const proforma_id = requireString(input.id, 'id')

    const { data: existing } = await supabase
      .from('proformas').select('id, status')
      .eq('id', proforma_id).eq('company_id', companyId).is('deleted_at', null).maybeSingle()

    if (!existing) throw new AppError('PROFORMA_NOT_FOUND', 'Proforma bulunamadı', { id: proforma_id })
    if (existing.status === 'converted') throw new AppError('PROFORMA_NOT_DRAFT', 'Dönüştürülmüş proformalar düzenlenemez', { status: existing.status })

    const customer_id    = optionalUUID(input.customer_id, 'customer_id')
    const bank_id        = optionalUUID(input.bank_id, 'bank_id')
    const customer_name  = requireString(input.customer_name ?? '', 'customer_name', 300)
    const currency       = sanitizeCurrency(input.currency ?? 'TRY')
    const validity_days  = Math.max(1, Math.min(365, Number(input.validity_days ?? 1)))
    const notes          = optionalString(input.notes, 'notes', 2000)
    const internal_notes = optionalString(input.internal_notes, 'internal_notes', 2000)
    const sales_rep_name  = optionalString(input.sales_rep_name,  'sales_rep_name',  200)
    const sales_rep_title = optionalString(input.sales_rep_title, 'sales_rep_title', 200)
    const sales_rep_phone = optionalString(input.sales_rep_phone, 'sales_rep_phone', 100)

    const rawItems = requireArray(input.items ?? [], 'items')
    if (rawItems.length === 0) throw new AppError('NO_ITEMS', 'En az bir ürün satırı zorunludur')
    const items = rawItems.map((l, i) => validateProformaLine(l, i))
    const total = calculateTotals(items as LineInput[]).grand_total

    // Intentionally NOT updating fx_usd / fx_eur / fx_try — snapshot is immutable
    // Editing resets status to draft and clears status timestamps
    const { error: updErr } = await supabase.from('proformas')
      .update({
        customer_id, bank_id, customer_name, currency, validity_days, notes, internal_notes, total,
        sales_rep_name, sales_rep_title, sales_rep_phone,
        status: 'draft', sent_at: null, approved_at: null, rejected_at: null,
      })
      .eq('id', proforma_id).eq('company_id', companyId)

    if (updErr) throw new AppError('DB_UPDATE_FAILED', 'Proforma güncellenemedi', { dbError: updErr.message })

    await supabase.from('proforma_items').delete().eq('proforma_id', proforma_id)
    const { error: iErr } = await supabase.from('proforma_items')
      .insert(items.map(l => ({ ...l, proforma_id })))
    if (iErr) throw new AppError('DB_INSERT_FAILED', 'Ürün satırları güncellenemedi', { dbError: iErr.message })

    await logger.info(ctx, 'proforma_update:success', { id: proforma_id })
    return { id: proforma_id }
  }

  // ── Status transition ─────────────────────────────────────────────────────
  // TASK 9: Idempotent — same-state transitions are no-ops, not errors.
  // "sent" is allowed from ANY non-converted state.
  // Transitions:
  //   draft    → sent
  //   sent     → sent (idempotent), draft, accepted, rejected
  //   accepted → sent, draft
  //   rejected → sent, draft
  static async updateStatus(
    userId:     string,
    companyId:  string,
    proformaId: string,
    newStatus:  string,
    ctx:        RequestContext
  ): Promise<{ id: string; status: string }> {
    const TRANSITIONS: Record<string, string[]> = {
      draft:     ['sent', 'draft'],
      sent:      ['sent', 'accepted', 'approved', 'rejected', 'draft'],
      approved:  ['sent', 'draft', 'approved', 'accepted'],
      rejected:  ['sent', 'draft', 'rejected'],
      // 'accepted' kept as alias for backward compatibility
      accepted:  ['sent', 'draft', 'accepted', 'approved'],
      // 'converted' is a terminal state — no manual transitions allowed.
      // Conversion is only via convert_proforma_to_sale RPC.
      converted: [],
    }

    const supabase = createClient()
    const { data: prf } = await supabase
      .from('proformas').select('id, status')
      .eq('id', proformaId).eq('company_id', companyId).is('deleted_at', null).maybeSingle()

    if (!prf) throw new AppError('PROFORMA_NOT_FOUND', 'Proforma bulunamadı', { id: proformaId })

    // Same state → idempotent no-op
    if (prf.status === newStatus) {
      return { id: proformaId, status: newStatus }
    }

    const allowed = TRANSITIONS[prf.status] ?? []
    if (!allowed.includes(newStatus)) {
      throw new AppError('PROFORMA_INVALID_STATUS', `${prf.status} → ${newStatus} geçişine izin verilmiyor`, { from: prf.status, to: newStatus })
    }

    // Build update payload with status timestamp
    const updatePayload: Record<string, unknown> = { status: newStatus }
    const now = new Date().toISOString()
    if (newStatus === 'sent')     updatePayload.sent_at     = now
    if (newStatus === 'accepted' || newStatus === 'approved') updatePayload.approved_at = now
    if (newStatus === 'rejected') updatePayload.rejected_at = now
    // Note: converted_at is set by the RPC function, not here

    // If editing (going back to draft), reset status to draft
    if (newStatus === 'draft') {
      // Clear downstream timestamps when reverting to draft
      updatePayload.sent_at     = null
      updatePayload.approved_at = null
      updatePayload.rejected_at = null
    }

    await supabase.from('proformas').update(updatePayload).eq('id', proformaId)

    if (newStatus === 'sent') {
      try {
        const { EventService } = await import('@/lib/services/event.service')
        await EventService.emit(supabase, userId, 'proforma.sent', {
          proforma_id: proformaId,
        })
      } catch { /* never crash on event emit failure */ }
    }

    await logger.info(ctx, 'proforma_status:updated', { id: proformaId, from: prf.status, to: newStatus })
    return { id: proformaId, status: newStatus }
  }

  // ── Soft delete ───────────────────────────────────────────────────────────
  static async softDelete(userId: string, companyId: string, proformaId: string, ctx: RequestContext): Promise<void> {
    const supabase = createClient()
    const { data: prf } = await supabase
      .from('proformas').select('id, status')
      .eq('id', proformaId).eq('company_id', companyId).is('deleted_at', null).maybeSingle()

    if (!prf) throw new AppError('PROFORMA_NOT_FOUND', 'Proforma bulunamadı', { id: proformaId })
    if (prf.status === 'converted') throw new AppError('ALREADY_CONVERTED', 'Dönüştürülmüş proformalar silinemez')

    await supabase.from('proformas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', proformaId).eq('company_id', companyId)

    await logger.info(ctx, 'proforma_delete:success', { id: proformaId })
  }
}
