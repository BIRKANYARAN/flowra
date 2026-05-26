// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/admin/gl-mode     — read current gl_mode for the company
// PATCH /api/admin/gl-mode    — update gl_mode (admin only)
//
// PATCH body: { gl_mode: 'shadow' | 'parallel' | 'gl_primary', force?: boolean }
//
// Progression guard: only shadow → parallel → gl_primary is safe by default.
// Pass `force: true` to allow any transition (admin override).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }          from 'next/server'
import { requireAdmin }                        from '@/lib/require-role'
import { AppError }                            from '@/types/errors'
import { resolveApiAuth }                      from '@/lib/api-auth'
import { getGlMode }                           from '@/lib/middleware/period-guard'
import { invalidateGlModeCache }               from '@/lib/services/ledger/dual-write.service'
import { logAudit }                            from '@/lib/audit'

type GlMode = 'shadow' | 'parallel' | 'gl_primary'

const GL_MODE_RANK: Record<GlMode, number> = {
  shadow:     0,
  parallel:   1,
  gl_primary: 2,
}

const VALID_GL_MODES = new Set<string>(['shadow', 'parallel', 'gl_primary'])

function isValidGlMode(value: unknown): value is GlMode {
  return typeof value === 'string' && VALID_GL_MODES.has(value)
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    const glMode = await getGlMode(companyId, supabase)

    return NextResponse.json({ gl_mode: glMode, company_id: companyId })
  } catch (err) {
    console.error('[admin/gl-mode GET]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Geçersiz istek gövdesi', code: 'INVALID_INPUT' },
        { status: 400 },
      )
    }

    const { gl_mode: newMode, force = false } = body

    if (!isValidGlMode(newMode)) {
      return NextResponse.json(
        {
          error: "gl_mode 'shadow', 'parallel' veya 'gl_primary' olmalıdır",
          code:  'INVALID_INPUT',
        },
        { status: 400 },
      )
    }

    // Read current mode
    const currentMode = await getGlMode(companyId, supabase)

    // Progression guard — only allow upgrades unless force=true
    if (!force) {
      const currentRank = GL_MODE_RANK[currentMode]
      const newRank     = GL_MODE_RANK[newMode]

      if (newRank < currentRank) {
        return NextResponse.json(
          {
            error:        `GL mod düşürme güvenli değil: '${currentMode}' → '${newMode}'. Zorla geçiş için force:true gönderin.`,
            code:         'INVALID_INPUT',
            current_mode: currentMode,
            requested:    newMode,
          },
          { status: 409 },
        )
      }

      if (newRank === currentRank) {
        // No-op — already at this mode
        return NextResponse.json({ gl_mode: currentMode, company_id: companyId, changed: false })
      }
    }

    // Perform update
    const { error: updateError } = await supabase
      .from('companies')
      .update({ gl_mode: newMode })
      .eq('id', companyId)

    if (updateError) {
      console.error('[admin/gl-mode PATCH] update failed', updateError)
      return NextResponse.json({ error: 'GL mod güncellenemedi', code: 'DB_UPDATE_FAILED' }, { status: 500 })
    }

    // Invalidate in-process cache
    invalidateGlModeCache(companyId)

    // Audit log (fire-and-forget) — use 'user_settings' as closest entity type
    // for company-level configuration changes
    logAudit({
      userId:     uid,
      companyId,
      entityType: 'user_settings',
      entityId:   companyId,
      action:     'update',
      oldData:    { gl_mode: currentMode },
      newData:    { gl_mode: newMode },
    })

    return NextResponse.json({ gl_mode: newMode, company_id: companyId, changed: true })
  } catch (err) {
    console.error('[admin/gl-mode PATCH]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
