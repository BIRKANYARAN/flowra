// ── Event Outbox Service ──────────────────────────────────────────────────────
// Transactional outbox pattern: emit() inserts events inside the caller's
// transaction, processEvents() picks them up asynchronously.

import { SupabaseClient } from '@supabase/supabase-js'
import { logger, type RequestContext } from '@/lib/logger'

// ── Types ────────────────────────────────────────────────────────────────────

export type EventType =
  | 'sale.created'
  | 'proforma.sent'
  | 'stock.adjusted'
  | 'product.created'

interface OutboxRow {
  id:          string
  user_id:     string
  event_type:  string
  payload:     Record<string, unknown>
  status:      'pending' | 'processing' | 'done' | 'failed'
  retry_count: number
  max_retries: number
  created_at:  string
}

// ── Handlers ─────────────────────────────────────────────────────────────────

type EventHandler = (
  supabase: SupabaseClient,
  event: OutboxRow,
  ctx: RequestContext
) => Promise<void>

const handlers: Record<string, EventHandler> = {

  /** Upsert monthly_metrics when a new sale is recorded */
  'sale.created': async (supabase, event, ctx) => {
    const { user_id, payload } = event
    const saleDate = payload.sale_date as string | undefined
    if (!saleDate) {
      await logger.warn(ctx, 'event:sale.created missing sale_date', { event_id: event.id })
      return
    }

    const month = saleDate.slice(0, 7) // 'YYYY-MM'
    const totalAmount = Number(payload.total_amount ?? 0)
    const currency = (payload.currency as string) ?? 'TRY'

    const { error } = await supabase.rpc('upsert_monthly_metrics', {
      p_user_id:      user_id,
      p_month:        month,
      p_revenue_add:  totalAmount,
      p_sales_add:    1,
      p_currency:     currency,
    })

    if (error) {
      await logger.error(ctx, 'event:sale.created metrics upsert failed', {
        event_id: event.id,
        error:    error.message,
      })
      throw error
    }

    await logger.info(ctx, 'event:sale.created metrics upserted', {
      event_id: event.id,
      month,
      amount:   totalAmount,
    })
  },

  'proforma.sent': async (_supabase, event, ctx) => {
    await logger.info(ctx, 'event:proforma.sent processed', {
      event_id:    event.id,
      proforma_id: event.payload.proforma_id,
    })
  },

  'stock.adjusted': async (_supabase, event, ctx) => {
    await logger.info(ctx, 'event:stock.adjusted processed', {
      event_id:   event.id,
      product_id: event.payload.product_id,
      delta:      event.payload.delta,
    })
  },

  'product.created': async (_supabase, event, ctx) => {
    await logger.info(ctx, 'event:product.created processed', {
      event_id:   event.id,
      product_id: event.payload.product_id,
    })
  },
}

// ── Service ──────────────────────────────────────────────────────────────────

export class EventService {

  /**
   * Insert an event into the outbox.
   * Call this inside the same Supabase client / transaction context as the
   * business operation so the event is committed atomically.
   */
  static async emit(
    supabase: SupabaseClient,
    userId:   string,
    eventType: EventType,
    payload:  Record<string, unknown>
  ): Promise<void> {
    const { error } = await supabase
      .from('event_outbox')
      .insert({
        user_id:    userId,
        event_type: eventType,
        payload,
        status:     'pending',
      })

    if (error) {
      // Never let outbox insertion crash the caller — log and move on
      console.error('[event.emit]', error.message)
    }
  }

  /**
   * Claim up to `batchSize` pending events, process them, and update their
   * status.  Returns the number of events processed (done + failed).
   *
   * Uses the `claim_event_batch` RPC which internally does
   * `FOR UPDATE SKIP LOCKED` — so concurrent workers never double-process.
   */
  static async processEvents(
    supabase:  SupabaseClient,
    ctx:       RequestContext,
    batchSize = 50
  ): Promise<number> {
    // 1. Atomically claim a batch (SELECT + UPDATE in one statement, locked)
    const { data: claimed, error: claimErr } = await supabase
      .rpc('claim_event_batch', { p_batch_size: batchSize })

    if (claimErr) {
      await logger.error(ctx, 'event:claim_batch failed', { error: claimErr.message })
      return 0
    }

    const events = (claimed ?? []) as OutboxRow[]
    if (events.length === 0) return 0

    // 2. Process each claimed event
    let processed = 0

    for (const event of events) {
      const handler = handlers[event.event_type]

      try {
        if (handler) {
          await handler(supabase, event, ctx)
        } else {
          await logger.warn(ctx, 'event:no_handler', {
            event_id:   event.id,
            event_type: event.event_type,
          })
        }

        // Mark done
        const { error: doneErr } = await supabase
          .from('event_outbox')
          .update({ status: 'done', processed_at: new Date().toISOString() })
          .eq('id', event.id)
        if (doneErr) {
          await logger.error(ctx, 'event:mark_done_failed', {
            event_id: event.id,
            error:    doneErr.message,
          })
          throw doneErr
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await logger.error(ctx, 'event:handler_error', {
          event_id:   event.id,
          event_type: event.event_type,
          error:      msg,
        })

        const { error: failErr } = await supabase
          .from('event_outbox')
          .update({
            status: 'failed',
            error_message: msg,
            retry_count: (event.retry_count ?? 0) + 1,
          })
          .eq('id', event.id)
        if (failErr) {
          await logger.error(ctx, 'event:mark_failed_failed', {
            event_id: event.id,
            error:    failErr.message,
          })
        }
      }

      processed++
    }

    await logger.info(ctx, 'event:batch_complete', { processed, total: events.length })
    return processed
  }
}
