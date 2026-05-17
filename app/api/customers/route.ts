export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireString, optionalString, ValidationError } from '@/lib/validation'
import { resolveApiAuth } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const body = await req.json()
    const payload = {
      user_id:    uid,
      name:       requireString(body.name, 'name', 300),
      address:    optionalString(body.address,    'address',    1000),
      tax_number: optionalString(body.tax_number, 'tax_number', 50),
      tax_office: optionalString(body.tax_office, 'tax_office', 200),
      email:      optionalString(body.email,      'email',      300),
      phone:      optionalString(body.phone,      'phone',      50),
      website:    optionalString(body.website,    'website',    300),
      notes:      optionalString(body.notes,      'notes',      2000),
      company_id: companyId,
    }

    const { data, error } = await supabase
      .from('customers')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      console.error('[customers POST] Insert error:', error.message, error.code)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
    }

    return NextResponse.json({ id: data.id }, { status: 201 })

  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 422 })
    }
    console.error('[customers POST] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const body = await req.json()
    const id   = requireString(body.id, 'id')
    const payload = {
      name:       requireString(body.name, 'name', 300),
      address:    optionalString(body.address,    'address',    1000),
      tax_number: optionalString(body.tax_number, 'tax_number', 50),
      tax_office: optionalString(body.tax_office, 'tax_office', 200),
      email:      optionalString(body.email,      'email',      300),
      phone:      optionalString(body.phone,      'phone',      50),
      website:    optionalString(body.website,    'website',    300),
      notes:      optionalString(body.notes,      'notes',      2000),
    }

    const { error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (error) {
      console.error('[customers PATCH] Update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ id })

  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 422 })
    }
    console.error('[customers PATCH] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id') ?? ''
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 422 })

    const { error } = await supabase
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('[customers DELETE] Soft-delete error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ deleted: true })

  } catch (err) {
    console.error('[customers DELETE] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
