export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { PageHeader, StatusBadge, EmptyState, ErrorBanner } from '@/components/ui'
import { formatTRY, fmtDate, sym } from '@/lib/format'
import { normalizeProformaRow, type NormalizedProformaRow } from '@/lib/normalize'
import { resolveCompanyId } from '@/lib/resolve-company'


export default async function ProformasPage() {
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  let userId: string | null = null
  try {
    const supabase = createClient()
    const result = await supabase.auth.getUser()
    if (result.error || !result.data || !result.data.user) return null
    userId = result.data.user.id
  } catch {
    return null
  }
  if (!userId) return null

  // ── 2. Query ──────────────────────────────────────────────────────────────
  let list: NormalizedProformaRow[] = []
  let fetchError = ''
  let companyId = ''

  try {
    const supabase = createClient()
    companyId = await resolveCompanyId(userId, supabase)
    const { data, error } = await supabase
      .from('proformas')
      .select('id, proforma_no, customer_name, total, currency, status, revision_no, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      fetchError = 'Proformalar yüklenemedi. Lütfen sayfayı yenileyin.'
    } else {
      const rows = Array.isArray(data) ? data : []
      for (let i = 0; i < rows.length; i++) {
        const normalized = normalizeProformaRow(rows[i])
        if (normalized) list.push(normalized)
      }
    }
  } catch {
    fetchError = 'Proformalar yüklenemedi. Lütfen sayfayı yenileyin.'
  }

  // ── 3. Render ─────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <div className="max-w-5xl">
        <PageHeader title="Proformalar" />
        <ErrorBanner msg={fetchError} />
      </div>
    )
  }

  try {
    return (
      <div className="max-w-5xl">
        <PageHeader
          title="Proformalar"
          sub={`${list.length} kayıt`}
          action={
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/sales-flow"
                className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Pipeline →
              </Link>
              <Link
                href="/dashboard/proformas/new"
                className="inline-flex items-center gap-1.5 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
              >
                + Yeni Proforma
              </Link>
            </div>
          }
        />

        {list.length === 0 ? (
          <EmptyState
            icon="📄"
            title="Henüz proforma oluşturulmadı"
            sub="İlk proformanızı oluşturmak için butona tıklayın."
            action={
              <Link
                href="/dashboard/proformas/new"
                className="inline-flex bg-primary-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
              >
                İlk Proformayı Oluştur
              </Link>
            }
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-3 border-b border-gray-100">
              <div className="col-span-3">No / Revizyon</div>
              <div className="col-span-3">Müşteri</div>
              <div className="col-span-2">Durum</div>
              <div className="col-span-2">Tarih</div>
              <div className="col-span-2 text-right">Tutar</div>
            </div>

            <div className="divide-y divide-gray-50">
              {list.map(p => {
                const displayDate     = p.created_at ? fmtDate(p.created_at) : '—'
                const displayCurrency = p.currency || 'TRY'
                const displayTotal    = Number.isFinite(p.total)
                  ? (displayCurrency === 'TRY'
                      ? formatTRY(p.total)
                      : `${sym(displayCurrency)}${p.total.toFixed(2)}`)
                  : '—'

                return (
                  <Link
                    key={p.id}
                    href={`/dashboard/proformas/${p.id}`}
                    className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="col-span-3">
                      <div className="text-xs font-mono font-semibold text-gray-700">
                        {p.proforma_no || '—'}
                      </div>
                      {p.revision_no > 1 && (
                        <div className="text-xs text-primary-500">Rev. {p.revision_no}</div>
                      )}
                    </div>
                    <div className="col-span-3 text-sm font-medium text-gray-800 truncate">
                      {p.customer_name || '—'}
                    </div>
                    <div className="col-span-2">
                      <StatusBadge status={p.status || 'draft'} />
                    </div>
                    <div className="col-span-2 text-sm text-gray-500">{displayDate}</div>
                    <div className="col-span-2 text-right font-black text-sm tabular-nums">
                      {displayTotal}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  } catch {
    return (
      <div className="max-w-5xl">
        <PageHeader title="Proformalar" />
        <ErrorBanner msg="Veriler yüklenirken bir sorun oluştu. Lütfen sayfayı yenileyin." />
      </div>
    )
  }
}
