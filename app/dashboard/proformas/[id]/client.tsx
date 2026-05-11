'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Btn, ErrorBanner, StatusBadge, fmtDate, sym } from '@/components/ui'
import { PdfDownloadButton } from '@/components/pdf/PdfDownloadButton'
import type { PdfOptions } from '@/components/pdf/generatePdf'
import { calculateLine, calculateTotals, type LineInput } from '@/lib/calc'

// ── Serializable DTOs (no raw DB row types, no undefined fields) ──────────────

/** One item as passed from server to client — only primitives. */
export interface ClientItem {
  id:       string
  name:     string
  price:    number
  kdv:      number
  quantity: number
  unit:     string
  currency: string
  discount_percent: number
}

/** PDF bank entry — all strings, never undefined. */
export interface ClientPdfBank {
  bankName:   string
  branchName: string  // empty string when null
  iban:       string
}

/** Fully serializable PDF options — no undefined anywhere. */
export interface ClientPdfOpts {
  proformaNo:   string
  createdAt:    string
  validityDays: number
  currency:     string
  fxUsd:        number | null
  fxEur:        number | null
  notes:        string          // empty string when null — never undefined
  company: {
    name:      string
    address:   string
    phone:     string
    website:   string
    taxNumber: string
    taxOffice: string
    logoUrl:   string
    mersisNo:  string
  }
  customer: {
    name:      string
    address:   string
    taxNumber: string
    taxOffice: string
    email:     string
    phone:     string
  }
  bank:  ClientPdfBank | null   // single bank object or null
  items: Array<{
    name:             string
    unit:             string
    quantity:         number
    price:            number
    kdv:              number
    currency:         string
    discount_percent: number
  }>
}

// ── Convert ClientPdfOpts → PdfOptions for the PDF engine ─────────────────────
function toPdfOptions(opts: ClientPdfOpts): PdfOptions {
  return {
    proformaNo:   opts.proformaNo,
    createdAt:    opts.createdAt,
    validityDays: opts.validityDays,
    currency:     opts.currency,
    fxUsd:        opts.fxUsd,
    fxEur:        opts.fxEur,
    notes:        opts.notes.length > 0 ? opts.notes : undefined,
    company: { ...opts.company },
    customer: { ...opts.customer },
    banks: opts.bank
      ? [{ bankName: opts.bank.bankName, branchName: opts.bank.branchName, iban: opts.bank.iban }]
      : [],
    items: opts.items.map(it => ({
      name: it.name, unit: it.unit, quantity: it.quantity,
      price: it.price, kdv: it.kdv, currency: it.currency,
      discount_percent: it.discount_percent ?? 0,
    })),
  }
}

// ── Internal modal state ──────────────────────────────────────────────────────
type SelItem = {
  id:              string
  name:            string
  price:           number
  kdv:             number
  origQty:         number
  qty:             number
  selected:        boolean
  unit:            string
  discountPercent: number
}

// ── Props (only serializable DTOs) ───────────────────────────────────────────
interface Props {
  id:           string
  no:           string
  status:       string
  currency:     string
  customerName: string
  createdAt:    string
  validityDays: number
  fxUsd:        number | null
  fxEur:        number | null
  pdfOpts:      ClientPdfOpts
  items:        ClientItem[]
}

export function ProformaDetailClient({
  id, no, status, currency, customerName, createdAt, fxUsd, fxEur, pdfOpts, items,
}: Props) {
  const router = useRouter()
  const S      = sym(currency)

  const [currentStatus, setCurrentStatus] = useState(status)
  const [copied,        setCopied]         = useState(false)
  const [showModal,     setShowModal]      = useState(false)
  const [selItems,      setSelItems]       = useState<SelItem[]>([])
  const [converting,    setConverting]     = useState(false)
  const [convertErr,    setConvertErr]     = useState('')
  const [statusLoading, setStatusLoading]  = useState(false)
  const [statusErr,     setStatusErr]      = useState('')
  const [showFxInfo,    setShowFxInfo]     = useState(false)

  const pdfOptions = toPdfOptions(pdfOpts)

  async function copyLink() {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/public/proforma/${id}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      try {
        const el = document.createElement('textarea')
        el.value = url
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      } catch { /* clipboard not available */ }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // ── TASK 9: Status update — idempotent, never errors on same-state ────────
  async function updateStatus(next: string) {
    // Same state → no-op (idempotent)
    if (currentStatus === next) return
    setStatusLoading(true)
    setStatusErr('')
    try {
      const res = await fetch(`/api/proformas/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setStatusErr((d as { error?: string }).error || 'Durum güncellenemedi')
      } else {
        setCurrentStatus(next)
      }
    } catch {
      setStatusErr('Beklenmeyen hata oluştu')
    }
    setStatusLoading(false)
  }

  function openModal() {
    setSelItems(
      items.map(it => ({
        id: it.id, name: it.name, price: it.price, kdv: it.kdv,
        unit: it.unit, origQty: it.quantity, qty: it.quantity, selected: true,
        discountPercent: it.discount_percent ?? 0,
      }))
    )
    setConvertErr('')
    setShowModal(true)
  }

  // ── TASK 2: Removed manual holding days — interest_days=0, calculated server-side ──
  async function confirmConvert() {
    const chosen = selItems.filter(it => it.selected)
    if (!chosen.length) { setConvertErr('En az bir ürün seçin.'); return }

    setConverting(true)
    setConvertErr('')

    try {
      const res = await fetch('/api/convert', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          proforma_id:    id,
          item_ids:       chosen.map(it => it.id),
          quantities:     chosen.map(it => it.qty),
          interest_days:  0, // auto-calculated from stock entry_date
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setConvertErr((data as { error?: string }).error || 'Dönüşüm hatası')
        setConverting(false)
        return
      }

      setShowModal(false)
      setCurrentStatus('converted')
      const saleId = (data as { sale_id?: string }).sale_id
      if (saleId) router.push(`/dashboard/sales/${saleId}`)
    } catch {
      setConvertErr('Beklenmeyen hata oluştu')
      setConverting(false)
    }
  }

  const selectedForCalc = selItems
    .filter(it => it.selected)
    .map(it => ({ price: it.price, quantity: it.qty, discount_percent: it.discountPercent, kdv: it.kdv }))
  const modalTotal = calculateTotals(selectedForCalc).grand_total

  const [shareUrl, setShareUrl] = useState(() =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/public/proforma/${id}`
      : ''
  )
  useEffect(() => {
    setShareUrl(`${window.location.origin}/public/proforma/${id}`)
  }, [id])

  // ── TASK 9: Status button labels — idempotent, allow "sent → sent" ────────
  const isSent     = currentStatus === 'sent'
  const isDraft    = currentStatus === 'draft'
  const isAccepted = currentStatus === 'accepted'
  const isRejected = currentStatus === 'rejected'
  const isConverted = currentStatus === 'converted'

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <Link
            href="/dashboard/proformas"
            className="text-sm text-gray-400 hover:text-gray-700 mb-1 inline-block"
          >
            ← Proformalar
          </Link>
          <div className="flex items-center gap-3 flex-wrap mt-0.5">
            <h1 className="text-xl font-black">{no}</h1>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full font-bold">
              {currency}
            </span>
            <StatusBadge status={currentStatus} />
            {/* TASK 10: FX info button — hidden by default */}
            {(fxUsd || fxEur) && (
              <button
                onClick={() => setShowFxInfo(!showFxInfo)}
                className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 text-xs font-bold flex items-center justify-center transition-colors"
                title="Kur bilgisi"
              >
                i
              </button>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{createdAt ? fmtDate(createdAt) : '—'}</p>
          {statusErr && <p className="text-xs text-red-500 mt-1">{statusErr}</p>}

          {/* TASK 10: FX info tooltip — only visible on click */}
          {showFxInfo && (fxUsd || fxEur) && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 inline-block">
              <div className="font-semibold text-gray-600 mb-1">Kur Snapshot (Oluşturma Anı)</div>
              {fxUsd ? <div>1 USD = <strong className="text-gray-700">₺{fxUsd.toFixed(4)}</strong></div> : null}
              {fxEur ? <div>1 EUR = <strong className="text-gray-700">₺{fxEur.toFixed(4)}</strong></div> : null}
              <div>1 TRY = <strong className="text-gray-700">₺1.0000</strong></div>
              <div className="text-gray-400 mt-1">{createdAt ? fmtDate(createdAt) : ''}</div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 flex-wrap justify-end">
            <Btn onClick={copyLink} variant="secondary" small>
              {copied ? '✓ Kopyalandı' : '🔗 Paylaş'}
            </Btn>

            <PdfDownloadButton opts={pdfOptions} />

            {/* TASK 7: Safari/mobile-friendly print — opens HTML page with window.print() */}
            <Btn
              onClick={() => window.open(`/public/proforma/${id}/print`, '_blank')}
              variant="secondary"
              small
            >
              Yazdır
            </Btn>

            {/* TASK 9: "Gönder" allowed from ANY non-converted state */}
            {!isConverted && (
              <Btn onClick={() => updateStatus('sent')} variant="secondary" small disabled={statusLoading}>
                {isSent ? 'Yeniden Gönder' : 'Gönderildi İşaretle'}
              </Btn>
            )}

            {/* Approve / Reject — only when sent */}
            {isSent && (
              <>
                <Btn onClick={() => updateStatus('accepted')} variant="secondary" small disabled={statusLoading}>
                  Onaylandı
                </Btn>
                <Btn onClick={() => updateStatus('rejected')} variant="secondary" small disabled={statusLoading}>
                  Reddedildi
                </Btn>
              </>
            )}

            {/* Convert — any non-converted state */}
            {!isConverted && (
              <Btn onClick={openModal} variant="primary" small>
                ✓ Satışa Dönüştür
              </Btn>
            )}
          </div>
        </div>
      </div>

      {/* Share link bar */}
      <div className="mt-4 mb-6 bg-primary-50 border border-primary-100 rounded-xl px-5 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-primary-800">Paylaşılabilir Link</div>
          <div className="text-xs text-primary-400 font-mono truncate mt-0.5">{shareUrl}</div>
        </div>
        <Btn onClick={copyLink} variant="secondary" small>
          {copied ? '✓' : 'Kopyala'}
        </Btn>
      </div>

      {/* Convert modal — TASK 2: no manual holding days */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget && !converting) setShowModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg">Satışa Dönüştür</h2>
                <p className="text-sm text-gray-500 mt-0.5">{no} · {customerName}</p>
              </div>
              <button
                onClick={() => { if (!converting) setShowModal(false) }}
                disabled={converting}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl text-gray-400 hover:text-gray-700 transition-colors"
              >
                x
              </button>
            </div>

            {/* Modal body — items only, no manual holding days */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ürün Seçimi</p>

              {selItems.map(it => {
                const lt = calculateLine({ price: it.price, quantity: it.qty, discount_percent: it.discountPercent, kdv: it.kdv }).line_total
                return (
                  <div
                    key={it.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${
                      it.selected ? 'border-gray-900 bg-gray-50' : 'border-gray-100 opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={it.selected}
                      disabled={converting}
                      onChange={() =>
                        setSelItems(s => s.map(x => x.id === it.id ? { ...x, selected: !x.selected } : x))
                      }
                      className="w-4 h-4 accent-primary-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{it.name}</div>
                      <div className="text-xs text-gray-400">{S}{Number.isFinite(it.price) ? it.price.toFixed(2) : '0.00'} · %{it.kdv} KDV</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        disabled={!it.selected || it.qty <= 0.01 || converting}
                        onClick={() =>
                          setSelItems(s => s.map(x =>
                            x.id === it.id ? { ...x, qty: Math.max(0.01, x.qty - 1) } : x
                          ))
                        }
                        className="w-7 h-7 border border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-100 disabled:opacity-30 flex items-center justify-center"
                      >-</button>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={it.qty}
                        disabled={!it.selected || converting}
                        onChange={e => {
                          const v = parseFloat(e.target.value)
                          if (v > 0) setSelItems(s => s.map(x => x.id === it.id ? { ...x, qty: v } : x))
                        }}
                        className="w-14 text-center text-sm border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-30"
                      />
                      <button
                        type="button"
                        disabled={!it.selected || converting}
                        onClick={() =>
                          setSelItems(s => s.map(x =>
                            x.id === it.id ? { ...x, qty: x.qty + 1 } : x
                          ))
                        }
                        className="w-7 h-7 border border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-100 disabled:opacity-30 flex items-center justify-center"
                      >+</button>
                    </div>
                    <div className="w-20 text-right text-sm font-bold tabular-nums flex-shrink-0">
                      {it.selected ? S + (Number.isFinite(lt) ? lt.toFixed(2) : '0.00') : '—'}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">
                  {selItems.filter(i => i.selected).length} ürün
                </span>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Satış Tutarı</div>
                  <div className="text-xl font-black tabular-nums">{S}{Number.isFinite(modalTotal) ? modalTotal.toFixed(2) : '0.00'}</div>
                </div>
              </div>

              {convertErr && <div className="mb-3"><ErrorBanner msg={convertErr} /></div>}

              <div className="flex gap-3">
                <Btn onClick={() => setShowModal(false)} variant="secondary" disabled={converting}>
                  İptal
                </Btn>
                <button
                  onClick={confirmConvert}
                  disabled={converting || selItems.filter(i => i.selected).length === 0}
                  className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
                >
                  {converting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    'Satışı Onayla'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
