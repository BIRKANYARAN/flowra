// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/rollback
//
// Creates a compensating (reversal) record for a specific entity.
// Does NOT delete any data — only creates new offsetting records.
//
// Supported entity_type values:
//   'stock_movement'      → creates reverse stock_movement (qty = -original)
//   'expense'             → soft-deletes the original expense
//   'partner_transaction' → creates opposite-direction transaction
//
// Body:
//   {
//     entity_type: 'stock_movement' | 'expense' | 'partner_transaction',
//     entity_id:   string,   // UUID of the record to reverse
//     reason:      string    // required — why this reversal is happening
//   }
//
// Response 201:
//   {
//     original_entity_id: string,
//     reversal_entity_id: string,
//     entity_type:        string,
//     reason:             string
//   }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER }         from '@/middleware'
import { RollbackService }           from '@/lib/rollback'
import { toErrorResponse, AppError } from '@/types/errors'
import type { RollbackEntityType }   from '@/lib/rollback'
import { resolveApiAuth }            from '@/lib/api-auth'
import { requireRole }               from '@/lib/require-role'

const SUPPORTED_TYPES = new Set<RollbackEntityType>([
  'stock_movement',
  'expense',
  'partner_transaction',
])

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    await requireRole(uid, companyId, 'manager', supabase)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Geçersiz JSON', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    const entity_type = String(body.entity_type ?? '')
    const entity_id   = String(body.entity_id   ?? '')
    const reason      = String(body.reason       ?? '').trim()

    if (!SUPPORTED_TYPES.has(entity_type as RollbackEntityType)) {
      throw new AppError(
        'ROLLBACK_NOT_SUPPORTED',
        `Desteklenmeyen entity_type: '${entity_type}'. Desteklenenler: ${[...SUPPORTED_TYPES].join(', ')}`,
      )
    }

    if (!entity_id) {
      throw new AppError('VALIDATION_ERROR', 'entity_id zorunludur')
    }

    if (!reason) {
      throw new AppError('VALIDATION_ERROR', 'reason zorunludur — tersine çevirme sebebini belirtiniz')
    }

    const result = await RollbackService.dispatch(uid, companyId, {
      entityType: entity_type as RollbackEntityType,
      entityId:   entity_id,
      reason,
    }, ctx)

    return NextResponse.json(result, {
      status:  201,
      headers: { [REQUEST_ID_HEADER]: ctx.requestId },
    })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
