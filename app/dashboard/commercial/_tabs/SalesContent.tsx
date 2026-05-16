// ── SalesContent — Commercial hub / sales tab ─────────────────────────────────

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { normalizeSaleRow, type NormalizedSaleRow } from '@/lib/normalize'
import { formatTRY, fmtDate } from '@/lib/format'

interface Props { companyId: string }

function fmt(n: number) { return formatTRY(Number(n) || 0) }

export async function SalesContent({ companyId }: Props) {
  const supabase = createClient()
  let list: NormalizedSaleRow[] = []

  try {
    const { data: sales, error } = await supabase
      .from('sales')
      .select('id, customer_name, currency, total, total_try, nominal_profit, created_at, proforma_id, proformas(proforma_no, deleted_at)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (!error) {
      list = (sales ?? []).map(normalizeSaleRow).filter((r): r is NormalizedSaleRow => r !== null)
    }
  } catch {
    // non-fatal
  }

  const totalRev = list.reduce((s, r) => s + r.total_try, 0)
  const totalPft = list.reduce((s, r) => s + r.nominal_profit, 0)

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black">Satışlar</h2>
          <p className="text-sm text-gray-500 mt-0.5">{list.length} kayıt</p>
        </div>
        <Link
          href="/dashboard/finance?tab=overview"
          className="border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50/60 transition-colors"
        >
          Analitik →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Toplam Satış',  value: String(list.length),    color: 'text-gray-900' },
          { label: 'TRY Ciro',      value: fmt(totalRev),          color: 'text-gray-900' },
          { label: 'Nominal Kâr',   value: fmt(totalPft),          color: totalPft >= 0 ? 'text-emerald-700' : 'text-red-600' },
        ].map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl text-center py-16">
          <div className="text-5xl mb-3">💰</div>
          <p className="text-gray-500 font-medium mb-2">Henüz satış yok.</p>
          <p className="text-sm text-gray-400">Proformaları satışa dönüştürerek başlayın.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 px-5 py-3 border-b border-gray-100 uppercase tracking-widest">
            <div className="col-span-3">Müşteri</div>
            <div className="col-span-2">Proforma</div>
            <div className="col-span-2">Tarih</div>
            <div className="col-span-2 text-right">Tutar</div>
            <div className="col-span-2 text-right">TRY</div>
            <div className="col-span-1 text-right">Kâr</div>
          </div>
          <div className="divide-y divide-gray-50">
            {list.map(s => (
              <Link key={s.id} href={`/dashboard/sales/${s.id}`}
                className="grid grid-cols-12 items-center px-5 py-4 hover:bg-gray-50/60 transition-colors">
                <div className="col-span-3 text-sm font-semibold truncate">{s.customer_name}</div>
                <div className="col-span-2 text-xs font-mono text-gray-500">
                  {s.proforma_no ? (s.proforma_deleted ? s.proforma_no + ' ✕' : s.proforma_no) : '—'}
                </div>
                <div className="col-span-2 text-sm text-gray-500">{s.created_at ? fmtDate(s.created_at) : '—'}</div>
                <div className="col-span-2 text-right text-sm tabular-nums">
                  {s.currency !== 'TRY' ? `${s.currency} ${s.total.toFixed(2)}` : fmt(s.total)}
                </div>
                <div className="col-span-2 text-right text-sm font-medium tabular-nums">{fmt(s.total_try)}</div>
                <div className={`col-span-1 text-right text-xs font-bold tabular-nums ${s.nominal_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmt(s.nominal_profit)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
