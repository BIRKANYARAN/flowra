// ── POST /api/backups/restore — restore from backup ──────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'

const BUCKET = 'backups'

// Download order: parents first so child-table references resolve correctly
// when the atomic restore_user_data() RPC inserts them.
// partners must precede partner_transactions (FK dependency).
const INSERT_ORDER = [
  'partners',
  'partner_transactions',
  'customers',
  'products',
  'expenses',
  'proformas',
  'proforma_items',
  'stock_lots',
  'stock_movements',
  'sales',
  'sale_items',
  'sale_item_allocations',
] as const

type BackupTable = typeof INSERT_ORDER[number]
type BackupRow = Record<string, unknown>

// Tables that have a company_id column and need it rewritten on restore.
const COMPANY_TABLES = new Set<BackupTable>([
  'partners',
  'partner_transactions',
  'customers',
  'products',
  'expenses',
  'proformas',
  'stock_lots',
  'stock_movements',
  'sales',
])

function rowIdSet(rows: unknown[] | undefined): Set<string> {
  return new Set((rows ?? [])
    .map(r => (r as BackupRow).id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0))
}

function sanitizeRows(table: BackupTable, rows: unknown[], uid: string, companyId: string): BackupRow[] {
  return rows.map((raw) => {
    const row = { ...(raw as BackupRow) }
    if (Object.prototype.hasOwnProperty.call(row, 'user_id')) row.user_id = uid
    if (COMPANY_TABLES.has(table)) row.company_id = companyId
    if (Object.prototype.hasOwnProperty.call(row, 'deleted_at')) row.deleted_at = null
    return row
  })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const uid = authData.user.id
    let companyId: string
    try { companyId = await resolveCompanyId(uid, supabase) }
    catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

    const body = await req.json()
    const backupPath = body.path as string

    if (
      !backupPath ||
      !backupPath.startsWith(`${uid}/`) ||
      backupPath.includes('..') ||
      backupPath.includes('//')
    ) {
      return NextResponse.json({ error: 'Geçersiz yedek yolu' }, { status: 400 })
    }

    // 1. Download all backup files
    const tableData: Record<string, unknown[]> = {}

    for (const table of INSERT_ORDER) {
      const filePath = `${backupPath}/${table}.json`
      const { data, error } = await supabase.storage.from(BUCKET).download(filePath)

      if (error || !data) {
        console.warn(`[restore] ${table}.json not found, skipping`)
        tableData[table] = []
        continue
      }

      try {
        const text = await data.text()
        const rows = JSON.parse(text)
        tableData[table] = Array.isArray(rows) ? rows : []
      } catch {
        console.error(`[restore] Failed to parse ${table}.json`)
        tableData[table] = []
      }
    }

    // 2. Pre-flight validation — check data integrity BEFORE touching the DB.
    //    If validation fails, we return 422 without deleting anything.
    const validationErrors: string[] = []

    for (const table of INSERT_ORDER) {
      const rows = tableData[table]
      if (rows.length === 0) continue

      // Every row with a user_id field must match the authenticated user.
      // Rows from a different user's backup must never overwrite current user data.
      const alienRows = rows.filter((r) => {
        const row = r as Record<string, unknown>
        return Object.prototype.hasOwnProperty.call(row, 'user_id') && row.user_id !== uid
      })
      if (alienRows.length > 0) {
        validationErrors.push(
          `${table}: ${alienRows.length} satır farklı kullanıcıya ait — yedek reddedildi`
        )
      }

      const alienCompanyRows = rows.filter((r) => {
        const row = r as BackupRow
        return (
          Object.prototype.hasOwnProperty.call(row, 'company_id') &&
          row.company_id != null &&
          row.company_id !== companyId
        )
      })
      if (alienCompanyRows.length > 0) {
        validationErrors.push(
          `${table}: ${alienCompanyRows.length} satır farklı şirkete ait — yedek reddedildi`
        )
      }
    }

    const partnerIds  = rowIdSet(tableData.partners)
    const customerIds = rowIdSet(tableData.customers)
    const productIds = rowIdSet(tableData.products)
    const proformaIds = rowIdSet(tableData.proformas)
    const stockLotIds = rowIdSet(tableData.stock_lots)
    const saleIds = rowIdSet(tableData.sales)
    const saleItemIds = rowIdSet(tableData.sale_items)

    const orphanPartnerTxs = (tableData.partner_transactions ?? []).filter(r => {
      const partnerId = (r as BackupRow).partner_id as string | undefined
      return partnerId && !partnerIds.has(partnerId)
    })
    if (orphanPartnerTxs.length > 0) {
      validationErrors.push(
        `partner_transactions: ${orphanPartnerTxs.length} satır bu yedekte bulunmayan partner_id referansı içeriyor`
      )
    }

    const orphanProformaItems = (tableData.proforma_items ?? []).filter(r => {
      const proformaId = (r as BackupRow).proforma_id as string | undefined
      return proformaId && !proformaIds.has(proformaId)
    })
    if (orphanProformaItems.length > 0) {
      validationErrors.push(
        `proforma_items: ${orphanProformaItems.length} satır bu yedekte bulunmayan proforma_id referansı içeriyor`
      )
    }

    const orphanStockRows = [
      ...(tableData.stock_lots ?? []),
      ...(tableData.stock_movements ?? []),
    ].filter(r => {
      const productId = (r as BackupRow).product_id as string | undefined
      return productId && !productIds.has(productId)
    })
    if (orphanStockRows.length > 0) {
      validationErrors.push(
        `stock_*: ${orphanStockRows.length} satır bu yedekte bulunmayan product_id referansı içeriyor`
      )
    }

    const invalidSales = (tableData.sales ?? []).filter(r => {
      const row = r as BackupRow
      const customerId = row.customer_id as string | undefined
      const proformaId = row.proforma_id as string | undefined
      return (customerId && !customerIds.has(customerId)) || (proformaId && !proformaIds.has(proformaId))
    })
    if (invalidSales.length > 0) {
      validationErrors.push(
        `sales: ${invalidSales.length} satır bu yedekte bulunmayan customer_id/proforma_id referansı içeriyor`
      )
    }

    const orphanSaleItems = (tableData['sale_items'] ?? []).filter(r => {
      const saleId = (r as Record<string, unknown>).sale_id as string | undefined
      return saleId && !saleIds.has(saleId)
    })
    if (orphanSaleItems.length > 0) {
      validationErrors.push(
        `sale_items: ${orphanSaleItems.length} satır bu yedekte bulunmayan sale_id referansı içeriyor`
      )
    }

    const orphanAllocations = (tableData.sale_item_allocations ?? []).filter(r => {
      const row = r as BackupRow
      const saleId = row.sale_id as string | undefined
      const saleItemId = row.sale_item_id as string | undefined
      const stockLotId = row.stock_lot_id as string | undefined
      return (
        (saleId && !saleIds.has(saleId)) ||
        (saleItemId && !saleItemIds.has(saleItemId)) ||
        (stockLotId && !stockLotIds.has(stockLotId))
      )
    })
    if (orphanAllocations.length > 0) {
      validationErrors.push(
        `sale_item_allocations: ${orphanAllocations.length} satır bu yedekte bulunmayan sale/sale_item/stock_lot referansı içeriyor`
      )
    }

    if (validationErrors.length > 0) {
      console.error('[restore] pre-flight failed:', validationErrors)
      return NextResponse.json(
        { error: 'Yedek doğrulama başarısız — veri değiştirilmedi', details: validationErrors },
        { status: 422 }
      )
    }

    for (const table of INSERT_ORDER) {
      tableData[table] = sanitizeRows(table, tableData[table] ?? [], uid, companyId)
    }

    // 3. Restore partners + partner_transactions (direct upsert — not in the legacy RPC).
    // Atomicity guard: snapshot current partner data BEFORE deleting so we can compensate
    // if the main RPC (step 4) fails, preventing a partially-restored state.
    const partnersToRestore   = tableData['partners']             ?? []
    const partnerTxsToRestore = tableData['partner_transactions'] ?? []

    // Snapshot current partner data for rollback compensation
    const [{ data: oldPartners }, { data: oldPartnerTxs }] = await Promise.all([
      supabase.from('partners').select('*').eq('company_id', companyId).is('deleted_at', null),
      supabase.from('partner_transactions').select('*').eq('company_id', companyId).is('deleted_at', null),
    ])

    if (partnersToRestore.length > 0) {
      const { error: pDelErr } = await supabase
        .from('partners')
        .delete()
        .eq('user_id', uid)
        .eq('company_id', companyId)
      if (pDelErr) console.warn('[restore] partners delete warning:', pDelErr.message)

      const { error: pInsErr } = await supabase
        .from('partners')
        .insert(partnersToRestore as BackupRow[])
      if (pInsErr) {
        console.error('[restore] partners insert error:', pInsErr.message)
        return NextResponse.json(
          { error: 'Ortak verisi geri yüklenemedi: ' + pInsErr.message, success: false },
          { status: 500 },
        )
      }
    }

    if (partnerTxsToRestore.length > 0) {
      const { error: ptDelErr } = await supabase
        .from('partner_transactions')
        .delete()
        .eq('user_id', uid)
        .eq('company_id', companyId)
      if (ptDelErr) console.warn('[restore] partner_transactions delete warning:', ptDelErr.message)

      const { error: ptInsErr } = await supabase
        .from('partner_transactions')
        .insert(partnerTxsToRestore as BackupRow[])
      if (ptInsErr) {
        console.error('[restore] partner_transactions insert error:', ptInsErr.message)
        return NextResponse.json(
          { error: 'Ortak işlemleri geri yüklenemedi: ' + ptInsErr.message, success: false },
          { status: 500 },
        )
      }
    }

    // 4. Atomic restore via DB function.
    // restore_user_data() runs delete + insert in a single PostgreSQL transaction.
    // If it fails, we compensate by re-inserting the pre-restore partner snapshot so
    // we don't leave partners in a new-data / everything-else-old-data split state.
    const { error: rpcError } = await supabase.rpc('restore_user_data', {
      p_uid:                   uid,
      p_company_id:            companyId,
      p_customers:             tableData['customers']             ?? [],
      p_products:              tableData['products']              ?? [],
      p_expenses:              tableData['expenses']              ?? [],
      p_proformas:             tableData['proformas']             ?? [],
      p_proforma_items:        tableData['proforma_items']        ?? [],
      p_stock_lots:            tableData['stock_lots']            ?? [],
      p_stock_movements:       tableData['stock_movements']       ?? [],
      p_sales:                 tableData['sales']                 ?? [],
      p_sale_items:            tableData['sale_items']            ?? [],
      p_sale_item_allocations: tableData['sale_item_allocations'] ?? [],
    })

    if (rpcError) {
      console.error('[restore] rpc error:', rpcError.message)

      // Compensate: partners were already replaced — roll them back to pre-restore snapshot.
      // Best-effort; log failures but don't mask the original error.
      try {
        await supabase.from('partner_transactions').delete().eq('company_id', companyId)
        await supabase.from('partners').delete().eq('company_id', companyId)
        if (oldPartners && oldPartners.length > 0) {
          await supabase.from('partners').insert(oldPartners as BackupRow[])
        }
        if (oldPartnerTxs && oldPartnerTxs.length > 0) {
          await supabase.from('partner_transactions').insert(oldPartnerTxs as BackupRow[])
        }
        console.warn('[restore] partner compensation applied after rpc failure')
      } catch (compErr) {
        console.error('[restore] partner compensation failed — manual review required:', compErr)
      }

      return NextResponse.json(
        { error: 'Geri yükleme başarısız: ' + rpcError.message, success: false },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[restore]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Geri yükleme başarısız oldu' }, { status: 500 })
  }
}
