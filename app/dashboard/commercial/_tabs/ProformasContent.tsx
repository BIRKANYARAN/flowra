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

  // Pipeline aggregates
  let pipelineValueTRY = 0
  let sentCount        = 0
  let acceptedCount    = 0
  let convertedCount   = 0
  let draftCount       = 0

  try {
    const { data, error } = await supabase
      .from('proformas')
      .select('id, proforma_no, customer_name, total, currency, fx_try, status, revision_no, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      fetchError = 'Proformalar yüklenemedi. Lütfen sayfayı yenileyin.'
    } else {
      for (const row of (data ?? [])) {
        const normalized = normalizeProformaRow(row)
        if (normalized) list.push(normalized)
        // Aggregates
        const valueTRY = row.currency === 'TRY'
          ? Number(row.total ?? 0)
          : Number(row.total ?? 0) * (Number((row as { fx_try?: number | null }).fx_try) || 1)
        const s = row.status ?? 'draft'
        if (s === 'sent')      { sentCount++;     pipelineValueTRY += valueTRY }
        if (s === 'accepted')  { acceptedCount++; pipelineValueTRY += valueTRY }
        if (s === 'converted') convertedCount++
        if (s === 'draft')     draftCount++
      }
    }
  } catch {
    fetchError = 'Proformalar yüklenemedi. Lütfen sayfayı yenileyin.'
  }

  if (fetchError) return <ErrorBanner msg={fetchError} />

  const openCount      = sentCount + acceptedCount
  const rejectedCount  = list.filter(p => p.status === 'rejected').length
  const totalNonDraft  = list.length - draftCount

  // Win rate: converted / (converted + rejected) — among decided proformas
  const decided   = convertedCount + rejectedCount
  const winRate   = decided > 0 ? Math.round((convertedCount / decided) * 100) : null

  return (
    <div className="max-w-5xl space-y-4">
      {/* KPI strip */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          {[
            { label: 'Toplam Teklif',    value: String(list.length),   sub: 'tüm zamanlar',                         color: 'text-[#0f172a]' },
            { label: 'Pipeline Değeri',  value: openCount > 0 ? formatTRY(pipelineValueTRY) : '—', sub: `${openCount} açık teklif (gönderildi/onaylandı)`, color: openCount > 0 ? 'text-info-text' : 'text-[#94a3b8]' },
            { label: 'Satışa Döndü',     value: String(convertedCount), sub: convertedCount > 0 ? 'onaylı dönüşüm' : 'Henüz yok', color: convertedCount > 0 ? 'text-pos-text' : 'text-[#94a3b8]' },
            { label: 'Dönüşüm Oranı',   value: list.length > 0 ? `%${Math.round((convertedCount / list.length) * 100)}` : '—', sub: `${draftCount} taslak`, color: 'text-[#334155]' },
          ].map((card, i) => (
            <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-[#94a3b8] mt-1 leading-tight">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Low win-rate alert — only when enough decisions to be statistically meaningful */}
      {winRate !== null && decided >= 5 && winRate < 30 && (
        <div className={`rounded border px-4 py-3 flex items-start gap-3 ${
          winRate < 15 ? 'bg-neg-light border-neg-light' : 'bg-warn-light border-warn-light'
        }`}>
          <span className="text-base mt-0.5">⚠</span>
          <div className="flex-1">
            <div className={`text-[11px] font-black uppercase tracking-wide ${winRate < 15 ? 'text-neg-text' : 'text-warn-text'}`}>
              Düşük Teklif Dönüşüm Oranı — %{winRate}
            </div>
            <div className={`text-xs mt-0.5 ${winRate < 15 ? 'text-neg-text' : 'text-warn-text'}`}>
              {decided} karar verilen tekliften sadece {convertedCount} tanesi satışa dönmüş.
              Fiyatlandırma, teklif içeriği veya takip sürecini gözden geçirin.
            </div>
          </div>
          <Link href="/dashboard/commercial?tab=pipeline" className={`text-[10px] font-bold underline underline-offset-2 shrink-0 mt-0.5 whitespace-nowrap ${winRate < 15 ? 'text-neg-text hover:text-neg-text' : 'text-warn-text hover:text-warn-text'}`}>
            Pipeline →
          </Link>
        </div>
      )}

      {/* High open pipeline aging — more than 5 proformas open > 14 days */}
      {(() => {
        const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
        const staleOpen = list.filter(p =>
          (p.status === 'sent' || p.status === 'accepted') &&
          p.created_at && new Date(p.created_at) < twoWeeksAgo
        )
        if (staleOpen.length < 3) return null
        return (
          <div className="bg-warn-light border border-warn-light rounded px-4 py-3 flex items-start gap-3">
            <span className="text-base mt-0.5">⚠</span>
            <div className="flex-1">
              <div className="text-[11px] font-black uppercase tracking-wide text-warn-text">
                {staleOpen.length} Açık Teklif 14+ Gün Yanıt Bekliyor
              </div>
              <div className="text-xs text-warn-text mt-0.5">
                Yanıt bekleyen teklifler pipeline değerini şişirir.
                Müşteri takibi yapın veya teklifleri güncelleyin.
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Proforma Status Funnel ────────────────────────────────────── */}
      {list.length > 2 && totalNonDraft > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Teklif Dönüşüm Hunisi</div>
          <div className="flex items-stretch gap-1">
            {[
              { label: 'Taslak',    count: draftCount,     color: 'bg-[#e2e8f0]',    textColor: 'text-[#64748b]'    },
              { label: 'Gönderildi', count: sentCount,     color: 'bg-info-light',    textColor: 'text-info-text'    },
              { label: 'Onaylandı', count: acceptedCount,  color: 'bg-pos-light', textColor: 'text-pos-text' },
              { label: 'Dönüştü',  count: convertedCount,  color: 'bg-primary-400', textColor: 'text-primary-800' },
              { label: 'Reddedildi', count: rejectedCount, color: 'bg-neg-light',     textColor: 'text-neg-text'     },
            ].map((step, i) => {
              if (step.count === 0) return null
              const widthPct = list.length > 0 ? Math.max(6, Math.round((step.count / list.length) * 100)) : 6
              return (
                <div key={step.label} className="flex-1 min-w-0">
                  <div className={`h-8 rounded flex items-center justify-center ${step.color}`}
                    style={{ minWidth: `${widthPct}%` }}>
                    <span className={`text-[10px] font-black tabular-nums ${step.textColor}`}>{step.count}</span>
                  </div>
                  <div className={`text-[9px] mt-1 text-center font-semibold ${step.textColor}`}>{step.label}</div>
                </div>
              )
            })}
          </div>
          {winRate !== null && (
            <div className="mt-3 flex items-center gap-3 text-[10px] text-[#64748b] border-t border-[#f1f5f9] pt-2.5">
              <span>Karar verilen teklifler: {decided}</span>
              <span className={`font-black ${winRate >= 60 ? 'text-pos-text' : winRate >= 40 ? 'text-warn-text' : 'text-neg'}`}>
                Kazanma Oranı: %{winRate}
              </span>
              {openCount > 0 && (
                <span className="text-info-text font-semibold">{openCount} aktif pipeline</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-[#94a3b8]">{list.length} proforma kaydı</p>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/commercial?tab=pipeline"
            className="inline-flex items-center gap-1.5 border border-[#e2e8f0] text-[#64748b] px-3.5 py-2 rounded text-xs font-semibold hover:bg-[#f8fafc] hover:text-[#1e293b] transition-colors"
          >
            Pipeline →
          </Link>
          <Link
            href="/dashboard/proformas/new"
            className="inline-flex items-center gap-1.5 bg-primary-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-700 transition-colors"
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
              className="inline-flex bg-primary-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-primary-700 transition-colors"
            >
              İlk Proformayı Oluştur
            </Link>
          }
        />
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="grid grid-cols-12 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-5 py-3 border-b border-[#e2e8f0]">
            <div className="col-span-3">No / Revizyon</div>
            <div className="col-span-3">Müşteri</div>
            <div className="col-span-2">Durum</div>
            <div className="col-span-2">Tarih</div>
            <div className="col-span-2 text-right">Tutar</div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
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
                  className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-[#f8fafc]/60 transition-colors"
                >
                  <div className="col-span-3">
                    <div className="text-xs font-mono font-semibold text-[#334155]">{p.proforma_no || '—'}</div>
                    {p.revision_no > 1 && <div className="text-xs text-primary-500">Rev. {p.revision_no}</div>}
                  </div>
                  <div className="col-span-3 text-sm font-medium text-[#1e293b] truncate">{p.customer_name || '—'}</div>
                  <div className="col-span-2"><StatusBadge status={p.status || 'draft'} /></div>
                  <div className="col-span-2 text-sm text-[#64748b]">{displayDate}</div>
                  <div className="col-span-2 text-right font-black text-sm tabular-nums">{displayTotal}</div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Teklifler satışa döndükten sonra pipeline ve tahsilat akışını takip edin.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/commercial?tab=pipeline" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Pipeline →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=sales" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Satışlar →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=collections" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Tahsilat →
          </Link>
        </div>
      </div>
    </div>
  )
}
