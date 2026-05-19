import { NextRequest, NextResponse } from 'next/server'
import { getSystemAdminClient }     from '@/lib/admin-db'
import { WorkflowService }          from '@/lib/services/workflow.service'

export const dynamic = 'force-dynamic'

// POST /api/cron/workflow-expire
//
// Invoked daily by Vercel Cron (suggested: 01:00 UTC, after overdue-update).
// Transitions all pending workflows past their expires_at to status='expired',
// and soft-deletes any orphaned pending expenses whose approval workflow expired.
//
// Why this matters (governance continuity):
//   Without expiry cleanup, an expense submitted by a manager and never approved
//   remains in payment_status='pending' indefinitely:
//     - Not counted in P&L (payment_status filter excludes pending)
//     - Not deleted (visible in DB, invisible to CFO)
//     - No audit trail showing why it was never processed
//   This cron resolves that by expiring the workflow AND cleaning the ghost expense.
//
// Idempotent: running twice for the same batch has no effect (status filter).
// Audit: writes one audit_log row per expired workflow (structured, traceable).

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSystemAdminClient()

  try {
    const result = await WorkflowService.expireStale(supabase)

    if (result.expired === 0) {
      return NextResponse.json({
        ok:                        true,
        expired:                   0,
        orphaned_expenses_cleaned: 0,
        message:                   'Süresi dolan workflow bulunamadı',
      })
    }

    // Write audit log entries for each expired workflow.
    // This is the governance trail proving when and why workflows expired —
    // critical for financial audit of why an expense was never approved.
    if (result.expired_workflows.length > 0) {
      const auditRows = result.expired_workflows.map(wf => ({
        company_id:    wf.company_id,
        action:        'update',
        resource_type: 'workflow',
        resource_id:   wf.id,
        old_values:    { status: 'pending' },
        new_values:    { status: 'expired' },
        description:   `Otomatik süre dolumu — ${wf.workflow_type}${wf.resource_id ? ` (kaynak: ${wf.resource_type ?? 'unknown'} ${wf.resource_id})` : ''}`,
      }))

      // Non-fatal: audit log failure must not prevent the main expiry from being reported
      try {
        await supabase.from('audit_logs').insert(auditRows)
      } catch (auditErr) {
        console.warn('[cron/workflow-expire] audit_logs insert failed (non-fatal):',
          auditErr instanceof Error ? auditErr.message : String(auditErr))
      }
    }

    console.info(
      `[cron/workflow-expire] expired=${result.expired} orphaned_expenses_cleaned=${result.orphaned_expenses_cleaned}`
    )

    return NextResponse.json({
      ok:                        true,
      expired:                   result.expired,
      orphaned_expenses_cleaned: result.orphaned_expenses_cleaned,
      expired_workflow_ids:      result.expired_workflow_ids,
    })
  } catch (e) {
    console.error('[cron/workflow-expire]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
