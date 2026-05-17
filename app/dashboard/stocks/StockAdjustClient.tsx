'use client'

// ── StockAdjustClient — stock movement entry form (client island) ──────────────
//
// This is the ONLY client-side part of the stocks page.  All read data
// (current levels, lot panel, movement history) are server-rendered in page.tsx.
//
// Client-side needs:
//   • FX rate auto-fetch when currency or entry date changes
//   • Form state for the 7 input fields
//   • POST to /api/products on submit
//   • router.refresh() after successful save to re-run server component

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/hooks/useSupabase'

const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'

interface Props {
  products: { id: string; name: string; unit: string }[]
}

export default function StockAdjustClient({ products }: Props) {
  const supabase = useSupabase()
  const router   = useRouter()

  const [selProduct,    setSelProduct]    = useState('')
  const [adjQty,        setAdjQty]        = useState('0')
  const [adjType,       setAdjType]       = useState('purchase')
  const [adjNotes,      setAdjNotes]      = useState('')
  const [costPrice,     setCostPrice]     = useState('')
  const [entryDate,     setEntryDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [costCurrency,  setCostCurrency]  = useState('TRY')
  const [fxRate,        setFxRate]        = useState('1')
  const [fxRateDate,    setFxRateDate]    = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState('')
  const [success,       setSuccess]       = useState(false)

  const isStockIn = adjType === 'purchase' || adjType === 'return'

  // ── Auto-fetch FX rate when currency or entry date changes ─────────────────
  useEffect(() => {
    if (costCurrency === 'TRY') { setFxRate('1'); setFxRateDate(null); return }
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      try {
        const { data: dbRates } = await supabase
          .from('fx_rates')
          .select('buying, rate_date')
          .eq('currency', costCurrency)
          .lte('rate_date', entryDate)
          .order('rate_date', { ascending: false })
          .limit(1)

        if (cancelled) return
        if (dbRates && dbRates.length > 0 && Number(dbRates[0].buying) > 0) {
          setFxRate(Number(dbRates[0].buying).toFixed(4))
          setFxRateDate(dbRates[0].rate_date)
          return
        }

        // Fallback: fetch current from /api/fx
        const res  = await fetch('/api/fx', { cache: 'no-store', signal: controller.signal })
        const data = await res.json()
        if (!cancelled && res.ok) {
          const rate = costCurrency === 'USD' ? Number(data.USD) : Number(data.EUR)
          if (rate > 0) { setFxRate(rate.toFixed(4)); setFxRateDate(data.rate_date || null) }
        }
      } catch { /* non-fatal — includes AbortError */ }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [costCurrency, entryDate, supabase])

  // ── Submit ────────────────────────────────────────────────────────────────
  async function adjust() {
    if (!selProduct) { setErr('Ürün seçin'); return }
    const qty  = parseFloat(adjQty)
    if (!isFinite(qty) || qty === 0) { setErr('Geçerli bir miktar girin'); return }
    const cost = parseFloat(costPrice) || 0
    if (isStockIn && cost <= 0) { setErr('Alım hareketlerinde maliyet fiyatı zorunludur'); return }
    if (isStockIn && !entryDate) { setErr('Alım hareketlerinde giriş tarihi zorunludur'); return }

    setSaving(true); setErr('')
    const res = await fetch('/api/products', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key:   crypto.randomUUID(),
        product_id:        selProduct,
        qty_change:        qty,
        reference_type:    adjType,
        notes:             adjNotes || null,
        cost_price:        cost > 0 ? cost : null,
        entry_date:        entryDate || null,
        cost_currency:     costCurrency,
        fx_rate_at_entry:  parseFloat(fxRate) || 1,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Hata'); setSaving(false); return }

    // Reset form + reload to refresh server-rendered data
    setSelProduct(''); setAdjQty('0'); setAdjNotes(''); setCostPrice('')
    setEntryDate(new Date().toISOString().slice(0, 10)); setCostCurrency('TRY'); setFxRate('1')
    setSaving(false); setSuccess(true)
    setTimeout(() => { setSuccess(false); router.refresh() }, 800)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Stok Hareketi Ekle</span>
        {success && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
            ✓ Kaydedildi
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Product */}
        <div>
          <label className={LAB}>Ürün *</label>
          <select className={IL} value={selProduct} onChange={e => setSelProduct(e.target.value)}>
            <option value="">— Ürün seçin —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Movement type */}
        <div>
          <label className={LAB}>Hareket Tipi</label>
          <select className={IL} value={adjType} onChange={e => setAdjType(e.target.value)}>
            <option value="purchase">Alım (+)</option>
            <option value="adjustment">Düzeltme (+-)</option>
            <option value="return">İade (+)</option>
            <option value="write_off">Fire (-)</option>
          </select>
        </div>

        {/* Qty */}
        <div>
          <label className={LAB}>Miktar {!isStockIn && '(negatif = çıkış)'}</label>
          <input type="number" step="0.001" className={IL} value={adjQty}
            onChange={e => setAdjQty(e.target.value)} />
        </div>

        {/* Cost price */}
        <div>
          <label className={LAB}>Maliyet Fiyatı {isStockIn ? '*' : '(opsiyonel)'}</label>
          <input type="number" step="0.01" min="0" className={IL} value={costPrice}
            onChange={e => setCostPrice(e.target.value)}
            placeholder={isStockIn ? 'Zorunlu' : 'Opsiyonel'} />
        </div>

        {/* Currency */}
        <div>
          <label className={LAB}>Maliyet Para Birimi</label>
          <select className={IL} value={costCurrency} onChange={e => setCostCurrency(e.target.value)}>
            <option value="TRY">TRY (₺)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </div>

        {/* FX rate — only when foreign currency */}
        {costCurrency !== 'TRY' && (
          <div>
            <label className={LAB}>
              Kur ({costCurrency}/TRY)
              {fxRateDate && (
                <span className="text-primary-500 normal-case font-normal ml-1">
                  — {new Date(fxRateDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} tarihli
                </span>
              )}
            </label>
            <input type="number" step="0.0001" min="0" className={IL} value={fxRate}
              onChange={e => { setFxRate(e.target.value); setFxRateDate(null) }} />
            {fxRateDate && fxRateDate !== entryDate && (
              <p className="text-xs text-amber-600 mt-1">
                Seçilen tarih ({entryDate}) için kur bulunamadı, en yakın tarih kullanıldı.
              </p>
            )}
          </div>
        )}

        {/* Entry date */}
        <div>
          <label className={LAB}>Giriş Tarihi {isStockIn ? '*' : '(opsiyonel)'}</label>
          <input type="date" className={IL} value={entryDate}
            onChange={e => setEntryDate(e.target.value)} />
        </div>

        {/* Notes */}
        <div>
          <label className={LAB}>Not</label>
          <input className={IL} value={adjNotes}
            onChange={e => setAdjNotes(e.target.value)} placeholder="Opsiyonel" />
        </div>
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          {err}
        </div>
      )}

      <button
        disabled={saving}
        onClick={adjust}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
      >
        {saving ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Kaydediliyor…
          </>
        ) : 'Hareketi Kaydet'}
      </button>
    </div>
  )
}
