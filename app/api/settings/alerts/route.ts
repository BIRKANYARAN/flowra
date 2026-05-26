import { NextRequest, NextResponse } from 'next/server'
import { requireRole }               from '@/lib/require-role'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET  /api/settings/alerts            → list all alert rules for company
// PUT  /api/settings/alerts            → upsert one rule { rule_type, threshold_value, severity, is_active }
// POST /api/settings/alerts/reset      → reset all rules to system defaults

const SYSTEM_DEFAULTS: Array<{ rule_type: string; threshold_value: number; severity: string }> = [
  { rule_type: 'RECEIVABLE_30',     threshold_value: 500,  severity: 'warning'  },
  { rule_type: 'RECEIVABLE_60',     threshold_value: 500,  severity: 'critical' },
  { rule_type: 'CASH_RUNWAY_90',    threshold_value: 90,   severity: 'warning'  },
  { rule_type: 'CASH_RUNWAY_30',    threshold_value: 30,   severity: 'critical' },
  { rule_type: 'PARTNER_BURDEN',    threshold_value: 0.20, severity: 'warning'  },
  { rule_type: 'PARTNER_LOAN_DUE',  threshold_value: 14,   severity: 'critical' },
  { rule_type: 'PERIOD_NOT_CLOSED', threshold_value: 10,   severity: 'warning'  },
  { rule_type: 'TAX_DUE_SOON',      threshold_value: 7,    severity: 'critical' },
  { rule_type: 'BS_IMBALANCED',     threshold_value: 100,  severity: 'critical' },
  { rule_type: 'LEGAL_RESERVE_LOW', threshold_value: 0,    severity: 'warning'  },
  { rule_type: 'DSR_HIGH',          threshold_value: 0.70, severity: 'critical' },
  { rule_type: 'CONCENTRATION',     threshold_value: 0.80, severity: 'warning'  },
]

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const { data, error } = await supabase
      .from('alert_rules')
      .select('id, rule_type, threshold_value, severity, is_active, updated_at')
      .eq('company_id', companyId)
      .order('rule_type')

    if (error) {
      // Table may not exist yet — return system defaults
      return NextResponse.json({ rules: SYSTEM_DEFAULTS.map(r => ({ ...r, id: null, is_active: true })) })
    }

    // Merge: system defaults + DB overrides
    const dbMap = new Map((data ?? []).map(r => [r.rule_type, r]))
    const merged = SYSTEM_DEFAULTS.map(def => {
      const db = dbMap.get(def.rule_type)
      return db ?? { ...def, id: null, is_active: true }
    })

    return NextResponse.json({ rules: merged })
  } catch (e) {
    console.error('[settings/alerts GET]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  return _handlePatch(req)
}

export async function PATCH(req: NextRequest) {
  return _handlePatch(req)
}

async function _handlePatch(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    await requireRole(uid, companyId, 'admin', supabase)

    const body = await req.json()
    const { rule_type, threshold_value, severity, is_active } = body

    if (!rule_type) return NextResponse.json({ error: 'rule_type required' }, { status: 400 })

    // Validate threshold_value: must be a number ≥ 0 if provided
    if (threshold_value !== undefined && threshold_value !== null) {
      if (typeof threshold_value !== 'number' || isNaN(threshold_value)) {
        return NextResponse.json({ error: 'threshold_value must be a number' }, { status: 400 })
      }
      if (threshold_value < 0) {
        return NextResponse.json({ error: 'threshold_value must be ≥ 0' }, { status: 400 })
      }
    }

    const { data: upserted, error } = await supabase
      .from('alert_rules')
      .upsert({
        company_id:      companyId,
        rule_type,
        threshold_value: threshold_value ?? null,
        severity:        severity ?? 'warning',
        is_active:       is_active ?? true,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'company_id,rule_type' })
      .select('id, rule_type, threshold_value, severity, is_active, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Return the full merged threshold object (DB row merged with system defaults)
    const systemDefault = SYSTEM_DEFAULTS.find(d => d.rule_type === rule_type)
    const fullRule = {
      ...systemDefault,
      ...upserted,
    }

    // Re-fetch all rules to return a complete snapshot
    const { data: allRules } = await supabase
      .from('alert_rules')
      .select('id, rule_type, threshold_value, severity, is_active, updated_at')
      .eq('company_id', companyId)
      .order('rule_type')

    const dbMap = new Map((allRules ?? []).map((r: { rule_type: string }) => [r.rule_type, r]))
    const mergedAll = SYSTEM_DEFAULTS.map(def => {
      const db = dbMap.get(def.rule_type)
      return db ?? { ...def, id: null, is_active: true }
    })

    return NextResponse.json({ rule: fullRule, rules: mergedAll })
  } catch (e) {
    console.error('[settings/alerts PATCH]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
