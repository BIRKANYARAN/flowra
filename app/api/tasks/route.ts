// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/tasks  — list tasks for the current company
// POST /api/tasks  — create a new task
//
// GET query params:
//   status   'open' | 'done' | 'cancelled' | 'all'  (default 'open')
//   limit    number  (default 50, max 200)
//
// POST body:
//   { title, due_date?, status?, related_customer_id?, notes? }
//
// Tasks are company-scoped. Any company member can view all company tasks.
// Only the creator can soft-delete their own tasks (via PATCH status=cancelled).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }    from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import type { TaskStatus } from '@/types'

const VALID_STATUSES: TaskStatus[] = ['open', 'done', 'cancelled']

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 },
    )
  }

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED' }, { status: 409 }) }

  const url    = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'open'
  const limit  = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  try {
    let query = supabase
      .from('tasks')
      .select(`
        id, user_id, company_id, title, due_date, status,
        related_customer_id, related_sale_id, notes, created_at, updated_at,
        customers(name)
      `)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status !== 'all' && VALID_STATUSES.includes(status as TaskStatus)) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) {
      console.error('[tasks GET] DB error:', error.message, '| code:', (error as { code?: string }).code)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Flatten customer name join
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = (data ?? []).map((t: any) => ({
      ...t,
      customer_name: t.customers?.name ?? null,
      customers:     undefined,
    }))

    return NextResponse.json(enriched)
  } catch (err) {
    console.error('[tasks GET] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 },
    )
  }
  const userId = authData.user.id

  let companyId: string
  try { companyId = await resolveCompanyId(userId, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED' }, { status: 409 }) }

  try {
    const body = await req.json()

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      return NextResponse.json({ error: 'Görev başlığı zorunludur.', field: 'title' }, { status: 422 })
    }

    const due_date = typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date)
      ? body.due_date
      : null

    const status: TaskStatus = VALID_STATUSES.includes(body.status as TaskStatus)
      ? (body.status as TaskStatus)
      : 'open'

    const related_customer_id = typeof body.related_customer_id === 'string' && body.related_customer_id
      ? body.related_customer_id
      : null

    const related_sale_id = typeof body.related_sale_id === 'string' && body.related_sale_id
      ? body.related_sale_id
      : null

    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id:             userId,
        company_id:          companyId,
        title,
        due_date,
        status,
        related_customer_id,
        related_sale_id,
        notes,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Guard: .single() guarantees non-null when error is null, but access is
    // still unsafe if PostgREST ever returns an empty body. Explicit check
    // prevents a TypeError from propagating to the caller as an unhandled 500.
    if (!data) return NextResponse.json({ error: 'Görev oluşturulamadı', code: 'INSERT_RETURNED_NULL' }, { status: 500 })
    return NextResponse.json({ id: data.id }, { status: 201 })

  } catch (err) {
    console.error('[tasks POST]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
