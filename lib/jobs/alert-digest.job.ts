// ── Alert Digest Job ──────────────────────────────────────────────────────────
//
// Evaluates alerts for a company and sends a digest email to admin users.
//
// Only sends if there are critical or warning alerts (info-only → skip).
// Idempotent via runJob() — same digest is never sent twice per company+date.
//
// Algorithm:
//   1. Fetch financial inputs (parallel queries)
//   2. Evaluate alerts with AlertEngine
//   3. Collect admin emails via ADMIN_DIGEST_EMAIL env var (or auth admin)
//   4. Build digest HTML
//   5. Send via EmailService
//   6. Job_runs record marks completion (idempotency)

import { runJob, buildIdempotencyKey, type JobResult } from './job-runner'
import { evaluateAlerts, type AlertInputs }            from '@/lib/engines/alert.engine'
import { EmailService, buildAlertDigestHtml }          from '@/lib/services/email.service'
import type { DecisionAlert }                          from '@/lib/engines/alert.engine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

/** Format a date as Turkish long format (e.g. "26 Mayıs 2026") */
function fmtDateTR(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return isoDate }
}

export async function runAlertDigestJob(
  companyId:   string,
  supabase:    AnySupabaseClient,
  asOf:        string,   // YYYY-MM-DD
): Promise<JobResult> {
  const idempotencyKey = buildIdempotencyKey('alert_digest', companyId, asOf)

  return runJob(
    {
      jobType:        'alert_digest',
      companyId,
      idempotencyKey,
      startedAt:      new Date(),
    },
    async (_ctx) => {
      // ── 1. Fetch inputs in parallel ────────────────────────────────────────
      const now   = new Date(asOf + 'T00:00:00Z')
      const nowMs = now.getTime()

      const [salesRes, trancheRes, membersRes, companyRes, periodsRes] = await Promise.allSettled([
        supabase
          .from('sales')
          .select('total_try:total, amount_paid:paid_amount, due_date, sale_date')
          .eq('company_id', companyId)
          .in('payment_status', ['unpaid', 'partial', 'overdue'])
          .is('deleted_at', null),
        supabase
          .from('partner_loan_tranches')
          .select('outstanding_try, due_date, annual_interest_rate')
          .eq('company_id', companyId)
          .eq('status', 'active'),
        supabase
          .from('company_members')
          .select('user_id, role')
          .eq('company_id', companyId)
          .eq('role', 'admin')
          .is('deleted_at', null),
        supabase
          .from('companies')
          .select('name')
          .eq('id', companyId)
          .single(),
        supabase
          .from('accounting_periods')
          .select('period_end, status')
          .eq('company_id', companyId)
          .in('status', ['open', 'pre_close'])
          .order('period_end', { ascending: false })
          .limit(1),
      ])

      const overdueRows = salesRes.status === 'fulfilled'   ? (salesRes.value.data    ?? []) : []
      const tranches    = trancheRes.status === 'fulfilled'  ? (trancheRes.value.data  ?? []) : []
      const members     = membersRes.status === 'fulfilled'  ? (membersRes.value.data  ?? []) : []
      const companyName = (companyRes.status === 'fulfilled' ? companyRes.value.data?.name : null) ?? 'Şirket'
      const openPeriods = periodsRes.status === 'fulfilled'  ? (periodsRes.value.data  ?? []) : []

      if (members.length === 0) {
        // No admin members — nothing to notify
        return { status: 'skipped' as const, recordsProcessed: 0 }
      }

      // ── 2. Compute alert inputs ──────────────────────────────────────────────
      let ot30 = 0, ot60 = 0, cnt30 = 0, cnt60 = 0, allOutstanding = 0

      for (const s of overdueRows as Array<Record<string, unknown>>) {
        const age  = Math.round((nowMs - new Date(((s.sale_date as string) ?? asOf) + 'T00:00:00Z').getTime()) / 86_400_000)
        const owed = Math.max(0, Number(s.total_try ?? 0) - Number(s.amount_paid ?? 0))
        allOutstanding += owed
        if (age > 60)      { ot60 += owed; cnt60++ }
        else if (age > 30) { ot30 += owed; cnt30++ }
      }

      let minDueDays = -1, nextAmount = 0
      for (const t of tranches as Array<Record<string, unknown>>) {
        if (!t.due_date) continue
        const days = Math.round((new Date(t.due_date as string).getTime() - nowMs) / 86_400_000)
        if (days >= 0 && (minDueDays === -1 || days < minDueDays)) {
          minDueDays = days
          nextAmount = Number(t.outstanding_try ?? 0)
        }
      }

      const monthlyDebtService = (tranches as Array<Record<string, unknown>>).reduce((sum, t) => {
        const p = Number(t.outstanding_try ?? 0)
        const r = Number(t.annual_interest_rate ?? 0)
        return sum + (r > 0 ? p * r / 12 : p * 0.015)
      }, 0)

      const openDays = openPeriods.length > 0
        ? Math.round((nowMs - new Date(((openPeriods as Array<Record<string, unknown>>)[0].period_end as string) + 'T00:00:00Z').getTime()) / 86_400_000)
        : -1

      const inputs: AlertInputs = {
        overdueCount30:          cnt30,
        overdueTotal30:          ot30,
        overdueCount60:          cnt60,
        overdueTotal60:          ot60,
        totalReceivables:        allOutstanding,
        cashRunwayDays:          -1,   // not computed cheaply in digest
        monthlyNetIncome:        0,
        maxBurdenScoreAbs:       0,
        nextTrancheDueDays:      minDueDays,
        nextTrancheAmount:       nextAmount,
        openPeriodDaysOverdue:   openDays,
        kdvPayable:              0,
        taxDueDays:              -1,
        bsImbalanceTry:          0,
        legalReserveDeficit:     0,
        equityGapTry:            0,
        equityCallOverdueDays:   -1,
        debtServiceRatio:        monthlyDebtService > 0 ? Math.min(1, monthlyDebtService / 1) : 0,
        partnerLoanConcentration:0,
      }

      const alerts: DecisionAlert[] = evaluateAlerts(inputs)
      const critical = alerts.filter(a => a.severity === 'critical')
      const warnings = alerts.filter(a => a.severity === 'warning')

      if (critical.length === 0 && warnings.length === 0) {
        return { status: 'skipped' as const, recordsProcessed: 0 }
      }

      // ── 3. Resolve recipient emails ──────────────────────────────────────────
      const emails: string[] = []

      // Primary: ADMIN_DIGEST_EMAIL env var (simplest, no auth.admin needed)
      const envEmail = process.env.ADMIN_DIGEST_EMAIL
      if (envEmail) emails.push(envEmail)

      if (emails.length === 0) {
        return { status: 'skipped' as const, recordsProcessed: 0 }
      }

      // ── 4. Build and send digest ─────────────────────────────────────────────
      const dashboardUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://flowra-blue.vercel.app') + '/dashboard'
      const dateStr      = fmtDateTR(asOf)

      const html = buildAlertDigestHtml({
        companyName: companyName as string,
        date: dateStr,
        critical: critical.map(a => ({ title: a.title, detail: a.detail, severity: a.severity, amount: a.amount })),
        warnings: warnings.map(a => ({ title: a.title, detail: a.detail, severity: a.severity, amount: a.amount })),
        dashboardUrl,
      })

      const subject = critical.length > 0
        ? `🚨 Flowra — ${critical.length} kritik uyarı · ${dateStr}`
        : `⚠️ Flowra — ${warnings.length} uyarı · ${dateStr}`

      let sentCount = 0
      for (const email of emails) {
        const result = await EmailService.send({ to: email, subject, html })
        if (result.ok) sentCount++
        else console.warn(`[alert-digest] email failed for ${email}:`, result.error)
      }

      return { status: 'completed' as const, recordsProcessed: sentCount }
    },
    supabase,
  )
}
