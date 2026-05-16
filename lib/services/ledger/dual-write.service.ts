// Dual-Write Service — decides whether to generate journal entries
// based on the company's gl_mode.
//
// shadow     → never writes journal entries (safe default)
// parallel   → writes async (best-effort; sale/expense never blocked)
// gl_primary → writes sync (blocking; journal failure = operation failure)

import { getGlMode } from '@/lib/middleware/period-guard'
import { JournalEntryService } from './journal-entry.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

type JournalEntryBuilder = () => ReturnType<typeof JournalEntryService.buildSaleEntry>

export interface DualWriteParams {
  companyId:   string
  periodId?:   string | null
  createdBy?:  string | null
  supabase:    AnySupabaseClient
  buildEntry:  JournalEntryBuilder
}

export async function dualWrite(params: DualWriteParams): Promise<string | null> {
  const { companyId, periodId, createdBy, supabase, buildEntry } = params
  const glMode = await getGlMode(companyId, supabase)

  if (glMode === 'shadow') return null

  const entryParams = {
    company_id:  companyId,
    period_id:   periodId   ?? null,
    created_by:  createdBy  ?? null,
    ...buildEntry(),
  }

  if (glMode === 'parallel') {
    // Best-effort async — does not block the caller
    JournalEntryService.create(entryParams, supabase).catch(err => {
      console.warn('[dual-write:parallel] journal entry failed', {
        company_id:  companyId,
        source_type: entryParams.source_type,
        source_id:   entryParams.source_id,
        error:       err instanceof Error ? err.message : String(err),
      })
    })
    return null   // caller doesn't wait
  }

  // gl_primary — sync, blocking
  const id = await JournalEntryService.create(entryParams, supabase)
  return id
}

// Helper for routes that need to find the period for a given date
export async function resolvePeriodId(
  companyId:       string,
  transactionDate: string,
  supabase:        AnySupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from('accounting_periods')
    .select('id')
    .eq('company_id', companyId)
    .lte('period_start', transactionDate)
    .gte('period_end',   transactionDate)
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}
