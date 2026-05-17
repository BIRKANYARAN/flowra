// ── /api/backups — backup management (list & create) ──────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

const BUCKET = 'backups'

// Tables that have a direct company_id column — filtered by companyId.
const COMPANY_SCOPED_TABLES = [
  'customers',
  'products',
  'stock_lots',
  'sales',
  'expenses',
  'proformas',
  'stock_movements',
  'partners',
  'partner_transactions',
] as const

type CompanyScopedTable = typeof COMPANY_SCOPED_TABLES[number]

// ── GET: list backup folders ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, supabase } = auth

    const prefix = `${uid}/`

    // List top-level folders for this user
    const { data: folders, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 100, sortBy: { column: 'name', order: 'desc' } })

    if (listErr) {
      console.error('[backups:list]', listErr.message)
      return NextResponse.json({ error: 'Yedek listesi alınamadı' }, { status: 500 })
    }

    // Parallel: for each folder fetch metadata.json + file list concurrently
    const validFolders = (folders ?? []).filter(f => f.name)
    const backups = await Promise.all(validFolders.map(async folder => {
      const folderPath = `${prefix}${folder.name}`

      const [{ data: metaFile }, { data: files }] = await Promise.all([
        supabase.storage.from(BUCKET).download(`${folderPath}/metadata.json`),
        supabase.storage.from(BUCKET).list(folderPath, { limit: 50 }),
      ])

      let metadata: Record<string, unknown> = {}
      if (metaFile) {
        try { metadata = JSON.parse(await metaFile.text()) } catch { /* ignore */ }
      }

      const totalSize = (files ?? []).reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0)

      return {
        name:      folder.name,
        path:      folderPath,
        fileCount: (files ?? []).length,
        totalSize,
        metadata,
        files: (files ?? []).map(f => ({
          name: f.name,
          size: f.metadata?.size ?? 0,
          path: `${folderPath}/${f.name}`,
        })),
      }
    }))

    return NextResponse.json({ backups })
  } catch (err) {
    console.error('[backups:list]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Yedek listesi alınamadı' }, { status: 500 })
  }
}

// ── POST: create a new backup ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const now = new Date()
    const folderName = now.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
    const folderPath = `${uid}/${folderName}`

    const tableCounts: Record<string, number> = {}
    let uploadedFiles = 0

    // ── Phase 1: company-scoped tables (direct company_id column) ─────────────
    for (const table of COMPANY_SCOPED_TABLES) {
      const { data, error } = await supabase
        .from(table as CompanyScopedTable)
        .select('*')
        .eq('company_id', companyId)

      if (error) {
        console.error(`[backups:export] ${table}:`, error.message)
        tableCounts[table] = 0
        continue
      }

      const rows = data ?? []
      tableCounts[table] = rows.length

      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(`${folderPath}/${table}.json`, blob, { contentType: 'application/json', upsert: false })

      if (uploadErr) {
        console.error(`[backups:upload] ${table}:`, uploadErr.message)
      } else {
        uploadedFiles++
      }
    }

    // ── Phase 2: child tables — no direct company_id, queried via parent IDs ──

    // sale_items → via company's sales
    const { data: companySales } = await supabase
      .from('sales').select('id').eq('company_id', companyId)
    const saleIds = (companySales ?? []).map((r: { id: string }) => r.id)

    if (saleIds.length > 0) {
      const { data: saleItems, error: siErr } = await supabase
        .from('sale_items').select('*').in('sale_id', saleIds)
      if (siErr) {
        console.error('[backups:export] sale_items:', siErr.message)
        tableCounts['sale_items'] = 0
        tableCounts['sale_item_allocations'] = 0
      } else {
        const rows = saleItems ?? []
        tableCounts['sale_items'] = rows.length
        const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(`${folderPath}/sale_items.json`, blob, { contentType: 'application/json', upsert: false })
        if (upErr) console.error('[backups:upload] sale_items:', upErr.message)
        else uploadedFiles++

        // sale_item_allocations → via sale_item IDs
        const saleItemIds = rows.map((r: { id: string }) => r.id)
        if (saleItemIds.length > 0) {
          const { data: allocations, error: allocErr } = await supabase
            .from('sale_item_allocations').select('*').in('sale_item_id', saleItemIds)
          if (allocErr) {
            console.error('[backups:export] sale_item_allocations:', allocErr.message)
            tableCounts['sale_item_allocations'] = 0
          } else {
            tableCounts['sale_item_allocations'] = (allocations ?? []).length
            const aBlob = new Blob([JSON.stringify(allocations ?? [], null, 2)], { type: 'application/json' })
            const { error: aUpErr } = await supabase.storage
              .from(BUCKET)
              .upload(`${folderPath}/sale_item_allocations.json`, aBlob, { contentType: 'application/json', upsert: false })
            if (aUpErr) console.error('[backups:upload] sale_item_allocations:', aUpErr.message)
            else uploadedFiles++
          }
        } else {
          tableCounts['sale_item_allocations'] = 0
        }
      }
    } else {
      tableCounts['sale_items'] = 0
      tableCounts['sale_item_allocations'] = 0
    }

    // proforma_items → via company's proformas
    const { data: companyProformas } = await supabase
      .from('proformas').select('id').eq('company_id', companyId)
    const proformaIds = (companyProformas ?? []).map((r: { id: string }) => r.id)

    if (proformaIds.length > 0) {
      const { data: proformaItems, error: piErr } = await supabase
        .from('proforma_items').select('*').in('proforma_id', proformaIds)
      if (piErr) {
        console.error('[backups:export] proforma_items:', piErr.message)
        tableCounts['proforma_items'] = 0
      } else {
        tableCounts['proforma_items'] = (proformaItems ?? []).length
        const blob = new Blob([JSON.stringify(proformaItems ?? [], null, 2)], { type: 'application/json' })
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(`${folderPath}/proforma_items.json`, blob, { contentType: 'application/json', upsert: false })
        if (upErr) console.error('[backups:upload] proforma_items:', upErr.message)
        else uploadedFiles++
      }
    } else {
      tableCounts['proforma_items'] = 0
    }

    // ── Write metadata file ───────────────────────────────────────────────────
    const metadata = {
      version: '1.0',
      created_at: now.toISOString(),
      user_id: uid,
      company_id: companyId,
      tables: tableCounts,
      total_rows: Object.values(tableCounts).reduce((s, n) => s + n, 0),
      file_count: uploadedFiles,
    }

    const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
    await supabase.storage
      .from(BUCKET)
      .upload(`${folderPath}/metadata.json`, metaBlob, {
        contentType: 'application/json',
        upsert: false,
      })

    return NextResponse.json({
      success: true,
      path: folderPath,
      metadata,
    })
  } catch (err) {
    console.error('[backups:create]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Yedekleme başarısız oldu' }, { status: 500 })
  }
}
