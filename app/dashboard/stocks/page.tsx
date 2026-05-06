'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSupabase } from '@/lib/hooks/useSupabase'
import type { Product, StockMovement } from '@/types'
import { PageHeader, Label } from '@/components/ui'
import { FlowraCard, FlowraButton } from '@/components/ui-kit'
import { resolveCompanyId } from '@/lib/resolve-company'

const IL = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'

export default function StocksPage() {
  const supabase = useSupabase()
  const [products,  setProducts]  = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selProduct, setSelProduct] = useState<string>('')
  const [adjQty,    setAdjQty]    = useState('0')
  const [adjType,   setAdjType]   = useState('purchase')
  const [adjNotes,  setAdjNotes]  = useState('')
  // Cost fields — cost_price, entry_date, currency, fx_rate
  const [costPrice,    setCostPrice]    = useState('')
  const [entryDate,    setEntryDate]    = useState(() => new Date().toISOString().slice(0, 10))
  const [costCurrency, setCostCurrency] = useState('TRY')
  const [fxRate,       setFxRate]       = useState('1')
  const [saving,       setSaving]       = useState(false)
  const [err,          setErr]          = useState('')

  // FX rate display state
  const [fxRateDate, setFxRateDate] = useState<string | null>(null)

  // Auto-fetch FX rate for the selected entry date and currency
  // When entryDate or costCurrency changes, fetch the historical rate
  useEffect(() => {
    if (costCurrency === 'TRY') { setFxRate('1'); setFxRateDate(null); return }
    ;(async () => {
      try {
        // Try to get rate for the specific entry date from DB
        const { data: dbRates } = await supabase
          .from('fx_rates')
          .select('buying, rate_date')
          .eq('currency', costCurrency)
          .lte('rate_date', entryDate)
          .order('rate_date', { ascending: false })
          .limit(1)

        if (dbRates && dbRates.length > 0 && Number(dbRates[0].buying) > 0) {
          setFxRate(Number(dbRates[0].buying).toFixed(4))
          setFxRateDate(dbRates[0].rate_date)
          return
        }

        // Fallback: fetch current from /api/fx
        const res = await fetch('/api/fx', { cache: 'no-store' })
        const data = await res.json()
        if (res.ok) {
          const rate = costCurrency === 'USD' ? Number(data.USD) : Number(data.EUR)
          if (rate > 0) {
            setFxRate(rate.toFixed(4))
            setFxRateDate(data.rate_date || null)
          }
        }
      } catch { /* non-fatal */ }
    })()
  }, [costCurrency, entryDate, supabase])

  const load = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return null
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)
    const [pRes, mRes] = await Promise.all([
      supabase.from('products').select('*').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
      supabase.from('stock_movements').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50),
    ])
    setProducts((pRes.data ?? []) as Product[])
    setMovements((mRes.data ?? []) as StockMovement[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const isStockIn = adjType === 'purchase' || adjType === 'return'

  async function adjust() {
    if (!selProduct) { setErr('Ürün seçin'); return }
    const qty = parseFloat(adjQty)
    if (!isFinite(qty) || qty === 0) { setErr('Geçerli bir miktar girin'); return }
    // TASK 3: cost_price required for stock-in
    const cost = parseFloat(costPrice) || 0
    if (isStockIn && cost <= 0) { setErr('Alım hareketlerinde maliyet fiyatı zorunludur'); return }
    // TASK 3: entry_date required for stock-in
    if (isStockIn && !entryDate) { setErr('Alım hareketlerinde giriş tarihi zorunludur'); return }

    setSaving(true); setErr('')
    const res = await fetch('/api/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        product_id: selProduct,
        qty_change: qty,
        reference_type: adjType,
        notes: adjNotes || null,
        cost_price: cost > 0 ? cost : null,
        entry_date: entryDate || null,
        cost_currency: costCurrency,
        fx_rate_at_entry: parseFloat(fxRate) || 1,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Hata'); setSaving(false); return }
    setAdjQty('0'); setAdjNotes(''); setCostPrice(''); setEntryDate(new Date().toISOString().slice(0, 10)); setCostCurrency('TRY'); setFxRate('1'); setSaving(false); load()
  }

  const TYPE_LABELS: Record<string, string> = {
    purchase: 'Alım', adjustment: 'Düzeltme', return: 'İade', write_off: 'Fire', sale: 'Satış',
  }

  function fmtDate(d: string) {
    try {
      return new Date(d).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
    } catch { return d || '—' }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Stok Yönetimi" sub="Stok hareketi ekle ve geçmişi incele" />

      {/* Stock levels */}
      <FlowraCard padding="none">
        <div className="px-5 py-4 border-b border-gray-100">
          <Label>Mevcut Stok</Label>
        </div>
        {products.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Ürün bulunamadı.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {products.map(p => {
              const low = Number(p.stock_qty) <= Number(p.stock_alert_qty)
              return (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/60">
                  <div>
                    <span className="text-sm font-semibold">{p.name}</span>
                    {p.sku && <span className="text-xs text-gray-400 ml-2">{p.sku}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {low && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-semibold">Düşük</span>}
                    <span className={`text-sm font-bold tabular-nums ${low ? 'text-amber-700' : 'text-gray-900'}`}>
                      {Number(p.stock_qty)} {p.unit}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </FlowraCard>

      {/* Adjustment form — TASK 3: added cost_price + entry_date */}
      <FlowraCard>
        <Label className="border-b border-gray-100 pb-3 mb-4 block">Stok Hareketi Ekle</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LAB}>Ürün *</label>
            <select className={IL} value={selProduct} onChange={e => setSelProduct(e.target.value)}>
              <option value="">— Ürün seçin —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LAB}>Hareket Tipi</label>
            <select className={IL} value={adjType} onChange={e => setAdjType(e.target.value)}>
              <option value="purchase">Alım (+)</option>
              <option value="adjustment">Düzeltme (+-)</option>
              <option value="return">İade (+)</option>
              <option value="write_off">Fire (-)</option>
            </select>
          </div>
          <div>
            <label className={LAB}>
              Miktar {!isStockIn && '(negatif = çıkış)'}
            </label>
            <input type="number" step="0.001" className={IL} value={adjQty} onChange={e => setAdjQty(e.target.value)} />
          </div>
          <div>
            <label className={LAB}>
              Maliyet Fiyatı {isStockIn ? '*' : '(opsiyonel)'}
            </label>
            <input
              type="number" step="0.01" min="0"
              className={IL}
              value={costPrice}
              onChange={e => setCostPrice(e.target.value)}
              placeholder={isStockIn ? 'Zorunlu' : 'Opsiyonel'}
            />
          </div>
          <div>
            <label className={LAB}>Maliyet Para Birimi</label>
            <select className={IL} value={costCurrency} onChange={e => setCostCurrency(e.target.value)}>
              <option value="TRY">TRY (₺)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (&euro;)</option>
            </select>
          </div>
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
              <input
                type="number" step="0.0001" min="0"
                className={IL}
                value={fxRate}
                onChange={e => { setFxRate(e.target.value); setFxRateDate(null) }}
              />
              {fxRateDate && fxRateDate !== entryDate && (
                <p className="text-xs text-amber-600 mt-1">
                  Seçilen tarih ({entryDate}) için kur bulunamadı, en yakın tarih kullanıldı.
                </p>
              )}
            </div>
          )}
          <div>
            <label className={LAB}>
              Giriş Tarihi {isStockIn ? '*' : '(opsiyonel)'}
            </label>
            <input
              type="date"
              className={IL}
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
            />
          </div>
          <div>
            <label className={LAB}>Not</label>
            <input className={IL} value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="Opsiyonel" />
          </div>
        </div>
        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-4">{err}</div>}
        <div className="mt-4">
          <FlowraButton variant="primary" loading={saving} onClick={adjust}>
            Hareketi Kaydet
          </FlowraButton>
        </div>
      </FlowraCard>

      {/* Movement history */}
      <FlowraCard padding="none">
        <div className="px-5 py-4 border-b border-gray-100">
          <Label>Son Hareketler</Label>
        </div>
        {movements.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Hareket bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3">Ürün</th>
                <th className="text-center px-3 py-3">Tip</th>
                <th className="text-right px-3 py-3">Değişim</th>
                <th className="text-right px-3 py-3">Maliyet</th>
                <th className="text-center px-3 py-3">Giriş Tarihi</th>
                <th className="text-right px-3 py-3">Sonrası</th>
                <th className="text-right px-5 py-3">Tarih</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {movements.map(m => {
                  const prod = products.find(p => p.id === m.product_id)
                  const cost = Number(m.unit_cost || 0)
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/60 text-sm">
                      <td className="px-5 py-3 font-medium">{prod?.name ?? '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                          {TYPE_LABELS[m.reference_type] ?? m.reference_type}
                        </span>
                      </td>
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${Number(m.qty_change) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {Number(m.qty_change) > 0 ? '+' : ''}{Number(m.qty_change)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                        {cost > 0 ? `₺${cost.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs tabular-nums">
                        {m.entry_date ? new Date(m.entry_date + 'T00:00:00').toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{Number(m.qty_after)}</td>
                      <td className="px-5 py-3 text-right text-gray-400">{fmtDate(m.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </FlowraCard>
    </div>
  )
}
