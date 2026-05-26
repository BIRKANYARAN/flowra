// Period Guard — application-level write-block for locked/closed periods
// Called at the top of every financial write API route.
// DB trigger (fn_guard_period_write) is the second layer of defense.

import { AppError } from '@/types/errors'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export type PeriodStatus = 'open' | 'pre_close' | 'closed' | 'locked'

export interface PeriodGuardResult {
  blocked:        boolean
  reason?:        string
  period_status?: PeriodStatus
  period_id?:     string
}

// Returns the period that covers the given date, or null if none.
export async function getPeriodForDate(
  companyId:       string,
  transactionDate: string,   // YYYY-MM-DD
  supabase:        AnySupabaseClient,
): Promise<{ id: string; status: PeriodStatus } | null> {
  const { data, error } = await supabase
    .from('accounting_periods')
    .select('id, status')
    .eq('company_id', companyId)
    .lte('period_start', transactionDate)
    .gte('period_end',   transactionDate)
    .limit(1)
    .maybeSingle()

  if (error) return null    // defensive: if period table missing, don't block
  return data ? { id: data.id, status: data.status as PeriodStatus } : null
}

// Primary check: should this write be blocked?
export async function checkPeriodGuard(
  companyId:       string,
  transactionDate: string,   // YYYY-MM-DD
  supabase:        AnySupabaseClient,
  options?: {
    allowAdjustment?: boolean   // if true, allows writes into 'closed' periods
  },
): Promise<PeriodGuardResult> {
  const period = await getPeriodForDate(companyId, transactionDate, supabase)

  if (!period) return { blocked: false }  // no period covering this date → allow

  if (period.status === 'locked') {
    return {
      blocked:        true,
      reason:         `Bu tarihin ait olduğu dönem kilitlenmiş. Finansal kayıt yapılamaz (${transactionDate}).`,
      period_status:  'locked',
      period_id:      period.id,
    }
  }

  if (period.status === 'closed' && !options?.allowAdjustment) {
    return {
      blocked:        true,
      reason:         `Bu dönem kapandı. Sadece düzeltme girişi yapılabilir (${transactionDate}).`,
      period_status:  'closed',
      period_id:      period.id,
    }
  }

  return {
    blocked:        false,
    period_status:  period.status,
    period_id:      period.id,
  }
}

// Strict variant: throws AppError('PERIOD_LOCKED') if period is locked/closed.
// Use in server actions / mutations that must never proceed on locked periods.
// Unlike checkPeriodGuard (which returns a result), this throws directly
// so callers can simply: await strictPeriodGuard(companyId, date, supabase)
export async function strictPeriodGuard(
  companyId:       string,
  transactionDate: string,   // YYYY-MM-DD
  supabase:        AnySupabaseClient,
): Promise<void> {
  const result = await checkPeriodGuard(companyId, transactionDate, supabase)
  if (result.blocked) {
    throw new AppError(
      'PERIOD_LOCKED',
      result.reason ?? `Bu tarihin ait olduğu dönem kilitlenmiş veya kapalı (${transactionDate}).`,
      { period_id: result.period_id, period_status: result.period_status },
    )
  }
}

// Convenience assertion: throws AppError if guardResult.blocked === true.
// Usage:
//   const g = await checkPeriodGuard(companyId, date, supabase)
//   assertNotLocked(g)
export function assertNotLocked(guardResult: PeriodGuardResult): void {
  if (guardResult.blocked) {
    throw new AppError(
      'PERIOD_LOCKED',
      guardResult.reason ?? 'Bu dönem kilitlenmiş veya kapalı.',
      { period_id: guardResult.period_id, period_status: guardResult.period_status },
    )
  }
}

// Convenience: get gl_mode for a company
export async function getGlMode(
  companyId: string,
  supabase:  AnySupabaseClient,
): Promise<'shadow' | 'parallel' | 'gl_primary'> {
  const { data } = await supabase
    .from('companies')
    .select('gl_mode')
    .eq('id', companyId)
    .maybeSingle()

  return (data?.gl_mode ?? 'shadow') as 'shadow' | 'parallel' | 'gl_primary'
}
