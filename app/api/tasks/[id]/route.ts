// ═══════════════════════════════════════════════════════════════════════════════
// PATCH  /api/tasks/[id]  — update title, due_date, status, notes
// DELETE /api/tasks/[id]  — soft-delete a task (sets deleted_at)
//
// Any company member can update any company task.
// Only the creator can hard-delete (via soft-delete: sets deleted_at).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { TaskStatus } from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'

const VALID_STATUSES: TaskStatus[] = ['open', 'done', 'cancelled']

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req:     NextRequest,
  { params }: { params: { id: string } },
) {
  const taskId = params.id
  if (!taskId) return NextResponse.json({ error: 'id zorunludur' }, { status: 422 })

  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const body  = await req.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { updated_at: new Date().toISOString() }

    if (typeof body.title === 'string') {
      const t = body.title.trim()
      if (!t) return NextResponse.json({ error: 'Başlık boş olamaz.', field: 'title' }, { status: 422 })
      patch.title = t
    }

    if (body.due_date !== undefined) {
      patch.due_date = typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date)
        ? body.due_date
        : null
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status as TaskStatus)) {
        return NextResponse.json({ error: 'Geçersiz durum.', field: 'status' }, { status: 422 })
      }
      patch.status = body.status
    }

    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    }

    if (body.related_customer_id !== undefined) {
      patch.related_customer_id = body.related_customer_id || null
    }

    if (body.related_sale_id !== undefined) {
      patch.related_sale_id = body.related_sale_id || null
    }

    const { error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', taskId)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (error) {
      console.error('[tasks PATCH] DB error:', error.message, '| code:', (error as { code?: string }).code)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ updated: true })

  } catch (err) {
    console.error('[tasks PATCH] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req:     NextRequest,
  { params }: { params: { id: string } },
) {
  const taskId = params.id
  if (!taskId) return NextResponse.json({ error: 'id zorunludur' }, { status: 422 })

  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    // Enforce creator-only soft-delete as documented in the file header.
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('company_id', companyId)
      .eq('user_id', uid)   // only creator may delete
      .is('deleted_at', null)

    if (error) {
      console.error('[tasks DELETE] DB error:', error.message, '| code:', (error as { code?: string }).code)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[tasks DELETE] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
