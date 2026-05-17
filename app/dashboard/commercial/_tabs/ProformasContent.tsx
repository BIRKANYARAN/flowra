// ── ProformasContent — Commercial hub / proformas tab ────────────────────────

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { StatusBadge, EmptyState, ErrorBanner } from '@/components/ui'
import { formatTRY, fmtDate, sym } from '@/lib/format'
import { normalizeProformaRow, type NormalizedProformaRow } from '@/lib/normalize'

interface Props { companyId: string }

export async function ProformasContent({ companyId }: Props) {
  const supabase = createClient()
  let list: NormalizedProformaRow[] = []
  let fetchError = ''

  try {
    const { data, error } = await supabase
      .from('proformas')
      .select('id, proforma_no, customer_name, total, currency, status, revision_no, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      fetchError = 'Proformalar yüklenemedi. Lütfen sayfayı yenileyin.'
    } else {
      for (const row of (data ?? [])) {
        const normalized = normalizeProformaRow(row)
        if (normalized) list.push(normalized)
      }
    }
  } catch {
    fetchError = 'Proformalar yüklenemedi. Lütfen sayfayı yenileyin.'
  }

  if (fetchError) return <ErrorBanner msg={fetchError} />

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">{list.length} proforma kaydı</p>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/commercial?tab=pipeline"
            className="inline-flex items-center gap-1.5 border border-gray-100 text-gray-500 px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-gray-50 hover:text-gray-800 transition-colors"
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
      </div>

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
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
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
                    <div className="text-xs font-mono font-semibold text-gray-700">{p.proforma_no || '—'}</div>
                    {p.revision_no > 1 && <div className="text-xs text-primary-500">Rev. {p.revision_no}</div>}
                  </div>
                  <div className="col-span-3 text-sm font-medium text-gray-800 truncate">{p.customer_name || '—'}</div>
                  <div className="col-span-2"><StatusBadge status={p.status || 'draft'} /></div>
                  <div className="col-span-2 text-sm text-gray-500">{displayDate}</div>
                  <div className="col-span-2 text-right font-black text-sm tabular-nums">{displayTotal}</div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
